//! End-to-end tests against a real folder on disk.
//!
//! Each test copies `sample-data/` (the renovation example from the mockups) into
//! a throwaway folder, does something to it, and checks both the files and what
//! the library loads afterwards.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use task_core::{fix, ops, unsorted, Error, Issue, Kind, Library};

/// Copies the sample data into a temp folder. Keep the TempDir alive: dropping
/// it deletes the folder.
fn sample() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample-data");
    copy_dir(&source, dir.path());
    let root = dir.path().to_path_buf();
    (dir, root)
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn load(root: &Path) -> Library {
    Library::load(root).unwrap()
}

/// Finds an item by title (titles are unique in the sample data).
fn by_title<'a>(lib: &'a Library, title: &str) -> &'a task_core::Item {
    lib.items
        .iter()
        .find(|i| i.title == title)
        .unwrap_or_else(|| panic!("no item {title}"))
}

fn titles(items: &[&task_core::Item]) -> Vec<String> {
    items.iter().map(|i| i.title.clone()).collect()
}

const TASKS: &str = "tasks/Home/Renovate the house";

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

#[test]
fn sample_data_loads_with_no_issues() {
    let (_dir, root) = sample();
    let lib = load(&root);
    assert!(lib.issues.is_empty(), "{:#?}", lib.issues);

    let count = |kind| lib.items.iter().filter(|i| i.kind == kind).count();
    assert_eq!(count(Kind::Area), 4);
    assert_eq!(count(Kind::Project), 3);
    assert_eq!(count(Kind::Milestone), 3);
    assert_eq!(count(Kind::Task), 10);
    assert_eq!(count(Kind::Note), 5);

    // Areas in their saved order, not alphabetical.
    assert_eq!(
        titles(&lib.children(None, false)),
        ["Home", "Technology", "School", "Health"]
    );

    // The project's children are its milestones, in order.
    let reno = by_title(&lib, "Renovate the house");
    assert_eq!(
        titles(&lib.children(Some(&reno.id), false)),
        ["Replace the sink", "Paint the kitchen"]
    );

    // A task knows its parent, status, due date.
    let sink = by_title(&lib, "Install new sink");
    assert_eq!(sink.kind, Kind::Task);
    assert_eq!(
        sink.parent.as_deref(),
        Some(by_title(&lib, "Replace the sink").id.as_str())
    );
    assert_eq!(sink.status.as_deref(), Some("doing"));
    assert_eq!(sink.due.as_deref(), Some("2026-10-17"));

    // Notes nest.
    let lab = by_title(&lib, "Homelab");
    assert!(lab.is_folder);
    assert_eq!(titles(&lib.children(Some(&lab.id), true)), ["Network", "Backups"]);
    assert_eq!(
        titles(&lib.children(None, true)),
        ["Homelab", "Kitchen measurements", "Recipes to try"]
    );
}

#[test]
fn missing_ids_and_index_files_are_fixed() {
    let (_dir, root) = sample();
    // A task made in Finder with no frontmatter, and a milestone folder with no _index.md.
    fs::write(
        root.join(TASKS).join("Replace the sink/Buy caulk.md"),
        "Just text.\n",
    )
    .unwrap();
    fs::create_dir(root.join(TASKS).join("Clean up")).unwrap();
    fs::write(root.join(TASKS).join("Clean up/Haul debris.md"), "").unwrap();

    let lib = load(&root);
    let fixable: Vec<_> = lib.issues.iter().filter(|i| i.is_fixable()).collect();
    assert_eq!(fixable.len(), 3, "{:#?}", lib.issues);
    let caulk_id = by_title(&lib, "Buy caulk").id.clone();

    assert_eq!(fix::apply(&lib).unwrap(), 3);
    let lib = load(&root);
    assert!(lib.issues.is_empty(), "{:#?}", lib.issues);
    // The id the loader picked is the one that was written.
    assert_eq!(by_title(&lib, "Buy caulk").id, caulk_id);
    // The body survived, and the id is the first line of the block.
    let text = fs::read_to_string(root.join(TASKS).join("Replace the sink/Buy caulk.md")).unwrap();
    assert!(text.starts_with(&format!("---\nid: {caulk_id}\n")), "{text}");
    assert!(text.ends_with("Just text.\n"));
    assert_eq!(by_title(&lib, "Clean up").kind, Kind::Milestone);
}

#[test]
fn a_copied_file_gets_a_new_id() {
    let (_dir, root) = sample();
    let dir = root.join(TASKS).join("Replace the sink");
    // "Install new sink copy.md" sorts BEFORE "Install new sink.md", so the copy
    // is loaded first. The loader still has to give the id to the original.
    std::thread::sleep(Duration::from_millis(20));
    fs::copy(
        dir.join("Install new sink.md"),
        dir.join("Install new sink copy.md"),
    )
    .unwrap();

    let lib = load(&root);
    assert!(
        matches!(lib.issues.as_slice(), [Issue::DuplicateId { .. }]),
        "{:#?}",
        lib.issues
    );
    fix::apply(&lib).unwrap();

    let lib = load(&root);
    assert!(lib.issues.is_empty());
    assert_ne!(
        by_title(&lib, "Install new sink").id,
        by_title(&lib, "Install new sink copy").id
    );
    assert_eq!(
        by_title(&lib, "Install new sink").id,
        "TSKINSTL01",
        "the original keeps its id"
    );
}

#[test]
fn bad_files_become_issues_not_errors() {
    let (_dir, root) = sample();
    let reno = root.join(TASKS);
    fs::write(
        reno.join("Replace the sink/Weird.md"),
        "---\nid: W1\nstatus: maybe\ndue: next week\n---\n",
    )
    .unwrap();
    fs::write(
        reno.join("Replace the sink/Broken.md"),
        "---\nid: B1\nno closing fence\n",
    )
    .unwrap();
    fs::write(root.join("tasks/Home/Loose task.md"), "").unwrap(); // tasks don't go in areas
    fs::write(reno.join("Stray task.md"), "").unwrap(); // project now mixes milestones and tasks
    fs::create_dir_all(reno.join("Replace the sink/Too deep")).unwrap();

    let lib = load(&root);
    let kinds: Vec<&str> = lib
        .issues
        .iter()
        .map(|i| match i {
            Issue::InvalidValue { field, .. } => field.as_str(),
            Issue::UnclosedFrontmatter { .. } => "unclosed",
            Issue::StrayFile { .. } => "stray",
            Issue::MixedChildren { .. } => "mixed",
            Issue::TooDeep { .. } => "deep",
            Issue::MissingId { .. } => "missing id",
            other => panic!("unexpected {other:?}"),
        })
        .collect();
    for expected in ["status", "due", "unclosed", "stray", "mixed", "deep"] {
        assert!(kinds.contains(&expected), "{expected} missing from {kinds:?}");
    }
    // Bad values fall back to defaults instead of breaking the item.
    let weird = by_title(&lib, "Weird");
    assert_eq!(weird.status.as_deref(), Some("todo"));
    assert_eq!(weird.due, None);
    // The unclosed file still shows up, and isn't offered an id fix (that could damage it).
    assert!(lib.items.iter().any(|i| i.title == "Broken"));
    assert!(!lib
        .issues
        .iter()
        .any(|i| matches!(i, Issue::MissingId { path, .. } if path.contains("Broken"))));
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

#[test]
fn creating_follows_the_hierarchy_rules() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let sink = by_title(&lib, "Replace the sink").id.clone();
    let reno = by_title(&lib, "Renovate the house").id.clone();
    let bath = by_title(&lib, "Redo the bathroom").id.clone();
    let home = by_title(&lib, "Home").id.clone();

    // Allowed.
    let caulk = ops::create(&lib, Kind::Task, Some(&sink), "Buy caulk", "").unwrap();
    ops::create(&lib, Kind::Task, Some(&bath), "Pick grout", "").unwrap(); // project without milestones
    ops::create(&lib, Kind::Milestone, Some(&reno), "Floors", "").unwrap();
    ops::create(&lib, Kind::Project, Some(&home), "Fix the fence", "").unwrap();
    ops::create(&lib, Kind::Area, None, "Finance", "").unwrap();

    // Not allowed.
    let not_allowed = |r: task_core::Result<String>| assert!(matches!(r, Err(Error::NotAllowed(_))), "{r:?}");
    not_allowed(ops::create(&lib, Kind::Task, Some(&reno), "Loose", "")); // project uses milestones
    not_allowed(ops::create(&lib, Kind::Milestone, Some(&bath), "Tiling", "")); // project has loose tasks
    not_allowed(ops::create(&lib, Kind::Task, Some(&home), "In an area", ""));
    not_allowed(ops::create(&lib, Kind::Task, None, "Nowhere", ""));
    not_allowed(ops::create(&lib, Kind::Note, Some(&home), "Note in area", ""));
    assert!(matches!(
        ops::create(&lib, Kind::Task, Some(&sink), "install NEW sink", ""),
        Err(Error::NameTaken(_))
    ));
    assert!(matches!(
        ops::create(&lib, Kind::Task, Some(&sink), "a: b", ""),
        Err(Error::InvalidName(_))
    ));

    let lib = load(&root);
    assert!(lib.issues.is_empty(), "{:#?}", lib.issues);
    let new_task = lib.get(&caulk).unwrap();
    assert_eq!(new_task.status.as_deref(), Some("todo"));
    assert!(new_task.created.is_some());
    // New items go to the end.
    assert_eq!(
        titles(&lib.children(Some(&sink), false)).last().unwrap(),
        "Buy caulk"
    );
    // New milestones pick a color the project isn't using yet.
    let floors = by_title(&lib, "Floors");
    assert!(!["dusty-blue", "mauve"].contains(&floors.color.as_deref().unwrap()));
}

#[test]
fn a_note_becomes_a_folder_when_it_gets_a_subpage() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let kitchen = by_title(&lib, "Kitchen measurements").id.clone();

    ops::create(
        &lib,
        Kind::Note,
        Some(&kitchen),
        "Appliances",
        "Fridge: 36 in wide.\n",
    )
    .unwrap();

    assert!(root.join("notes/Kitchen measurements/_index.md").is_file());
    assert!(!root.join("notes/Kitchen measurements.md").exists());
    let lib = load(&root);
    let parent = lib.get(&kitchen).unwrap();
    assert!(parent.is_folder, "same id, now a folder");
    assert_eq!(titles(&lib.children(Some(&kitchen), true)), ["Appliances"]);
    assert_eq!(
        ops::read_body(&lib, &kitchen).unwrap(),
        "Counter: 96 in. Sink cutout: 33 x 22 in.\n"
    );
}

// ---------------------------------------------------------------------------
// Renaming and moving
// ---------------------------------------------------------------------------

#[test]
fn rename_keeps_the_id() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let sink = by_title(&lib, "Replace the sink").id.clone();

    ops::rename(&lib, &sink, "Replace the kitchen sink").unwrap();

    let lib = load(&root);
    assert!(matches!(
        ops::rename(&lib, "TSKDEMO001", "shut off the WATER"),
        Err(Error::NameTaken(_))
    ));
    ops::rename(&lib, "TSKDEMO001", "Demo the Old Sink").unwrap(); // changing only the case is fine

    let lib = load(&root);
    assert_eq!(lib.get("TSKDEMO001").unwrap().title, "Demo the Old Sink");
    let item = lib.get(&sink).unwrap();
    assert_eq!(item.title, "Replace the kitchen sink");
    assert_eq!(
        lib.children(Some(&sink), false).len(),
        4,
        "children moved with the folder"
    );
}

#[test]
fn move_changes_parent_and_keeps_the_id() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let paint = by_title(&lib, "Paint the kitchen").id.clone();

    ops::move_item(&lib, "TSKPLUMB01", Some(&paint), None).unwrap();

    let lib = load(&root);
    let moved = lib.get("TSKPLUMB01").unwrap();
    assert_eq!(moved.parent.as_deref(), Some(paint.as_str()));
    assert_eq!(
        titles(&lib.children(Some(&paint), false)).last().unwrap(),
        "Reconnect plumbing"
    );
    assert!(root
        .join(TASKS)
        .join("Paint the kitchen/Reconnect plumbing.md")
        .is_file());
}

#[test]
fn reordering_writes_only_the_moved_file() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let sink = by_title(&lib, "Replace the sink").id.clone();
    let folder = root.join(TASKS).join("Replace the sink");
    let snapshot = |name: &str| fs::read_to_string(folder.join(name)).unwrap();
    let before = [
        "Shut off the water.md",
        "Demo the old sink.md",
        "Install new sink.md",
    ]
    .map(snapshot);

    // Drag "Reconnect plumbing" to just before "Demo the old sink".
    ops::move_item(&lib, "TSKPLUMB01", Some(&sink), Some("TSKDEMO001")).unwrap();

    let after = [
        "Shut off the water.md",
        "Demo the old sink.md",
        "Install new sink.md",
    ]
    .map(snapshot);
    assert_eq!(before, after, "neighbours weren't touched");
    let lib = load(&root);
    assert_eq!(
        titles(&lib.children(Some(&sink), false)),
        [
            "Shut off the water",
            "Reconnect plumbing",
            "Demo the old sink",
            "Install new sink"
        ]
    );

    // And to the very top.
    ops::move_item(&lib, "TSKINSTL01", Some(&sink), Some("TSKWATER01")).unwrap();
    let lib = load(&root);
    assert_eq!(titles(&lib.children(Some(&sink), false))[0], "Install new sink");
}

#[test]
fn reordering_gives_keys_to_files_that_have_none() {
    let (_dir, root) = sample();
    let folder = root.join("tasks/Home/Redo the bathroom");
    for name in ["Order mirror", "Remove vanity"] {
        fs::write(
            folder.join(format!("{name}.md")),
            "---\nid: X-".to_owned() + name.split(' ').next().unwrap() + "\n---\n",
        )
        .unwrap();
    }
    let lib = load(&root);
    let bath = by_title(&lib, "Redo the bathroom").id.clone();

    ops::move_item(&lib, "TSKTILE001", Some(&bath), None).unwrap();

    let lib = load(&root);
    assert!(lib.children(Some(&bath), false).iter().all(|i| i.order.is_some()));
    assert_eq!(
        titles(&lib.children(Some(&bath), false)).last().unwrap(),
        "Pick tile"
    );
}

#[test]
fn moves_that_break_the_rules_are_refused() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let lab = by_title(&lib, "Homelab").id.clone();
    let network = by_title(&lib, "Network").id.clone();
    let reno = by_title(&lib, "Renovate the house").id.clone();
    let home = by_title(&lib, "Home").id.clone();

    let refused = |r: task_core::Result<()>| assert!(matches!(r, Err(Error::NotAllowed(_))), "{r:?}");
    refused(ops::move_item(&lib, &lab, Some(&network), None)); // a note into its own subpage
    refused(ops::move_item(&lib, "TSKTILE001", Some(&reno), None)); // task into a project with milestones
    refused(ops::move_item(&lib, &reno, Some(&reno), None)); // project into itself
    refused(ops::move_item(&lib, &home, Some(&reno), None)); // area into a project
    refused(ops::move_item(&lib, "TSKTILE001", None, None)); // task to the top level

    // Nothing moved.
    let lib = load(&root);
    assert!(lib.issues.is_empty());
    assert_eq!(lib.get("TSKTILE001").unwrap().title, "Pick tile");
}

// ---------------------------------------------------------------------------
// Fields, bodies, trash
// ---------------------------------------------------------------------------

#[test]
fn fields_are_checked_before_writing() {
    let (_dir, root) = sample();
    let lib = load(&root);

    ops::set_field(&lib, "TSKINSTL01", "status", Some("done")).unwrap();
    ops::set_field(&lib, "TSKINSTL01", "due", None).unwrap();
    ops::set_field(&lib, "MSSINK0001", "color", Some("teal")).unwrap();

    let invalid = |r: task_core::Result<()>| assert!(r.is_err(), "{r:?}");
    invalid(ops::set_field(&lib, "TSKINSTL01", "status", Some("open"))); // that's a milestone status
    invalid(ops::set_field(&lib, "TSKINSTL01", "due", Some("2026-02-30")));
    invalid(ops::set_field(&lib, "TSKINSTL01", "color", Some("teal"))); // only milestones have colors
    invalid(ops::set_field(&lib, "TSKINSTL01", "id", Some("HACKED")));
    invalid(ops::set_field(&lib, "AREAHOME01", "status", Some("todo")));

    let lib = load(&root);
    let task = lib.get("TSKINSTL01").unwrap();
    assert_eq!(task.status.as_deref(), Some("done"));
    assert_eq!(task.due, None);
    assert_eq!(lib.get("MSSINK0001").unwrap().color.as_deref(), Some("teal"));
    // The body is untouched by field changes.
    assert!(ops::read_body(&lib, "TSKINSTL01").unwrap().contains("P-trap"));
}

#[test]
fn body_edits_keep_the_frontmatter() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let path = root.join(TASKS).join("Replace the sink/Install new sink.md");
    let block_before = fs::read_to_string(&path)
        .unwrap()
        .split("---\n")
        .nth(1)
        .unwrap()
        .to_owned();

    ops::write_body(&lib, "TSKINSTL01", "New body.\n").unwrap();

    let text = fs::read_to_string(&path).unwrap();
    assert_eq!(text, format!("---\n{block_before}---\nNew body.\n"));
}

#[test]
fn trash_and_restore() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let sink = by_title(&lib, "Replace the sink").clone();

    let trashed = ops::trash(&lib, &sink.id).unwrap();
    let lib = load(&root);
    assert!(lib.get(&sink.id).is_none(), "trash is hidden");
    assert!(lib.get("TSKINSTL01").is_none(), "and so is everything inside it");

    ops::restore(&lib, &trashed, &sink.path).unwrap();
    let lib = load(&root);
    assert_eq!(lib.get(&sink.id).unwrap().title, "Replace the sink");
    assert!(lib.get("TSKINSTL01").is_some());
}

// ---------------------------------------------------------------------------
// Unsorted
// ---------------------------------------------------------------------------

#[test]
fn unsorted_add_stamp_and_file() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let path = root.join("unsorted.md");

    // A phone appends a line with no stamp.
    let mut text = fs::read_to_string(&path).unwrap();
    text.push_str("pick up paint samples\n");
    fs::write(&path, text).unwrap();
    assert_eq!(unsorted::stamp_missing(&lib, "2026-10-16 09:00").unwrap(), 1);
    assert_eq!(
        unsorted::stamp_missing(&lib, "2026-10-16 09:01").unwrap(),
        0,
        "only once"
    );

    // Typing in the app.
    unsorted::add(&lib, "  call the\nplumber ", "2026-10-16 09:05").unwrap();
    let entries = unsorted::read(&lib).unwrap();
    assert_eq!(entries.len(), 6);
    assert_eq!(entries[4].text, "pick up paint samples");
    assert_eq!(entries[4].added.as_deref(), Some("2026-10-16 09:00"));
    assert_eq!(entries[5].text, "call the plumber");

    // Filing "buy caulk for the sink" into the milestone.
    let sink = by_title(&lib, "Replace the sink").id.clone();
    let id = unsorted::file(&lib, &entries[0], Kind::Task, Some(&sink)).unwrap();
    let lib = load(&root);
    assert_eq!(lib.get(&id).unwrap().title, "buy caulk for the sink");
    let remaining = unsorted::read(&lib).unwrap();
    assert_eq!(remaining.len(), 5);
    assert!(remaining.iter().all(|e| e.text != "buy caulk for the sink"));

    // Text with ":" gets a cleaned title, and the original goes in the body.
    let idea = remaining
        .iter()
        .find(|e| e.text.starts_with("idea:"))
        .unwrap()
        .clone();
    let id = unsorted::file(&lib, &idea, Kind::Task, Some(&sink)).unwrap();
    let lib = load(&root);
    assert_eq!(lib.get(&id).unwrap().title, "idea- weekly review checklist");
    assert_eq!(
        ops::read_body(&lib, &id).unwrap(),
        "idea: weekly review checklist\n"
    );

    // Undo puts the line back where it was.
    unsorted::restore(&lib, &idea).unwrap();
    assert!(unsorted::read(&lib).unwrap().iter().any(|e| e.raw == idea.raw));
}

#[test]
fn unsorted_never_removes_the_wrong_line() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let entries = unsorted::read(&lib).unwrap();

    // The line was edited somewhere else after we read it.
    let edited = fs::read_to_string(root.join("unsorted.md"))
        .unwrap()
        .replace("buy caulk", "buy silicone");
    fs::write(root.join("unsorted.md"), edited).unwrap();

    assert!(matches!(
        unsorted::remove(&lib, &entries[0]),
        Err(Error::Changed(_))
    ));
    assert_eq!(unsorted::read(&lib).unwrap().len(), 4, "nothing was removed");

    // Lines added above it don't matter: it's found by its text.
    let mut text = String::from("- 2026-10-16 08:00 new first line\n");
    text.push_str(&fs::read_to_string(root.join("unsorted.md")).unwrap());
    fs::write(root.join("unsorted.md"), text).unwrap();
    unsorted::remove(&lib, &entries[1]).unwrap();
    let left = unsorted::read(&lib).unwrap();
    assert_eq!(left.len(), 4);
    assert!(left.iter().all(|e| e.raw != entries[1].raw));
}

#[test]
fn a_missing_unsorted_file_is_just_empty() {
    let (_dir, root) = sample();
    fs::remove_file(root.join("unsorted.md")).unwrap();
    let lib = load(&root);
    assert!(unsorted::read(&lib).unwrap().is_empty());
    unsorted::add(&lib, "first", "2026-10-16 10:00").unwrap();
    assert_eq!(
        fs::read_to_string(root.join("unsorted.md")).unwrap(),
        "- 2026-10-16 10:00 first\n"
    );
}

// ---------------------------------------------------------------------------
// Watching
// ---------------------------------------------------------------------------

#[test]
fn the_watcher_reports_outside_changes() {
    let (_dir, root) = sample();
    let (tx, rx) = mpsc::channel();
    let _watcher = task_core::watch::watch(&root, move |paths| {
        let _ = tx.send(paths);
    })
    .unwrap();

    std::thread::sleep(Duration::from_millis(100));
    fs::write(root.join("unsorted.md"), "- 2026-10-16 10:00 from the phone\n").unwrap();

    // Some systems also report the folders the watcher just started watching, so
    // keep reading batches until the file shows up.
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let left = deadline.saturating_duration_since(std::time::Instant::now());
        let paths = rx
            .recv_timeout(left)
            .expect("unsorted.md change was never reported");
        if paths.iter().any(|p| p == "unsorted.md") {
            break;
        }
    }
}

#[test]
fn old_trash_is_emptied_and_recent_trash_kept() {
    let (_dir, root) = sample();
    let trash = root.join(".trash");
    fs::create_dir_all(trash.join("20260901-100000-Old project")).unwrap();
    fs::write(
        trash.join("20260901-100000-Old project/_index.md"),
        "---\nid: x\n---\n",
    )
    .unwrap();
    fs::write(trash.join("20260910-120000-Old task.md"), "old").unwrap();
    fs::write(trash.join("20261010-090000-Recent task.md"), "recent").unwrap();
    fs::write(trash.join("put here by hand.md"), "mine").unwrap();

    let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 16).unwrap();
    let removed = ops::empty_old_trash(&root, today, 30).unwrap();

    assert_eq!(removed, 2);
    assert!(!trash.join("20260901-100000-Old project").exists());
    assert!(!trash.join("20260910-120000-Old task.md").exists());
    assert!(trash.join("20261010-090000-Recent task.md").exists());
    // No date stamp: not ours to delete.
    assert!(trash.join("put here by hand.md").exists());
    // A folder without .trash is fine too.
    let (_empty, other) = sample();
    assert_eq!(ops::empty_old_trash(&other, today, 30).unwrap(), 0);
}

#[test]
fn search_finds_text_inside_items() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let hits = task_core::search::search_text(&lib, "SINK CUTOUT", 10);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].id, by_title(&lib, "Kitchen measurements").id);
    assert!(hits[0].snippet.contains("Sink cutout"));
    assert!(task_core::search::search_text(&lib, "   ", 10).is_empty());
    // The limit caps the number of hits.
    assert!(task_core::search::search_text(&lib, "e", 2).len() <= 2);
}

#[test]
fn pages_can_have_an_emoji_icon() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let page = by_title(&lib, "Homelab").id.clone();
    let task = by_title(&lib, "Pick tile").id.clone();

    ops::set_field(&lib, &page, "icon", Some("🌿")).unwrap();
    let lib = load(&root);
    assert_eq!(by_title(&lib, "Homelab").icon.as_deref(), Some("🌿"));
    let text = fs::read_to_string(root.join("notes/Homelab/_index.md")).unwrap();
    assert!(text.contains("icon: 🌿"), "stored in the frontmatter: {text}");

    // Emoji made of several characters joined together are fine.
    ops::set_field(&lib, &page, "icon", Some("👩‍💻")).unwrap();
    // Words, spaces and non-notes are not.
    assert!(ops::set_field(&lib, &page, "icon", Some("a long word")).is_err());
    assert!(ops::set_field(&lib, &task, "icon", Some("🌿")).is_err());

    // Removing it leaves no icon line behind.
    ops::set_field(&lib, &page, "icon", None).unwrap();
    let lib = load(&root);
    assert_eq!(by_title(&lib, "Homelab").icon, None);
    let text = fs::read_to_string(root.join("notes/Homelab/_index.md")).unwrap();
    assert!(!text.contains("icon:"));
}
