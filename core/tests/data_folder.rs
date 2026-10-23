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

const TASKS: &str = "areas/Home/Renovate the house";

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
    assert_eq!(count(Kind::Page), 5);
    assert_eq!(
        lib.children(None, true).len(),
        0,
        "every page belongs to something"
    );

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

    // Pages belong to an area or a project, and nest.
    let tech = by_title(&lib, "Technology");
    assert_eq!(titles(&lib.children(Some(&tech.id), true)), ["Homelab"]);
    assert_eq!(
        titles(&lib.children(Some(&reno.id), true)),
        ["Kitchen measurements"]
    );
    let lab = by_title(&lib, "Homelab");
    assert!(lab.is_folder);
    assert_eq!(lab.parent.as_deref(), Some(tech.id.as_str()));
    assert_eq!(titles(&lib.children(Some(&lab.id), true)), ["Network", "Backups"]);
    // The Pages folder is not an item, and a project's pages don't count as
    // its milestones or tasks.
    assert!(lib.items.iter().all(|i| i.title != "Pages"));
    assert_eq!(lib.children(Some(&reno.id), false).len(), 2);
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
fn fixing_never_replaces_an_id_or_an_index_that_arrived_after_loading() {
    let (_dir, root) = sample();
    let sink = root.join(TASKS).join("Replace the sink");
    fs::write(sink.join("Buy caulk.md"), "Just text.\n").unwrap();
    fs::create_dir(root.join(TASKS).join("Clean up")).unwrap();
    fs::write(root.join(TASKS).join("Clean up/Haul debris.md"), "").unwrap();
    let lib = load(&root);

    // Before the fixes run, a sync brings in the real id and the real _index.md.
    fs::write(
        sink.join("Buy caulk.md"),
        "---\nid: FROMSYNC01\n---\nJust text.\n",
    )
    .unwrap();
    let index = "---\nid: FROMSYNC02\nstatus: open\n---\nFrom the other computer.\n";
    fs::write(root.join(TASKS).join("Clean up/_index.md"), index).unwrap();

    fix::apply(&lib).unwrap();

    let caulk = fs::read_to_string(sink.join("Buy caulk.md")).unwrap();
    assert!(
        caulk.contains("id: FROMSYNC01") && !caulk.contains("id: FROMSYNC01\nid:"),
        "{caulk}"
    );
    assert_eq!(
        fs::read_to_string(root.join(TASKS).join("Clean up/_index.md")).unwrap(),
        index
    );
}

/// A folder link that points back at its own parent used to be followed until
/// the path was too long to open, which failed the whole load.
#[cfg(unix)]
#[test]
fn a_folder_link_that_loops_does_not_stop_the_load() {
    let (_dir, root) = sample();
    let pages = root.join("areas/Home/Pages");
    fs::create_dir_all(&pages).unwrap();
    std::os::unix::fs::symlink(&pages, pages.join("Loop")).unwrap();

    let lib = Library::load(&root).expect("one odd folder must not fail the load");
    assert!(lib.issues.iter().any(|i| matches!(i, Issue::TooDeep { .. })));
    // Everything else still loads.
    assert_eq!(by_title(&lib, "Replace the sink").kind, Kind::Milestone);
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
    fs::write(root.join("areas/Home/Loose task.md"), "").unwrap(); // tasks don't go in areas
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
    not_allowed(ops::create(&lib, Kind::Page, None, "Loose page", "")); // pages belong somewhere
    not_allowed(ops::create(
        &lib,
        Kind::Page,
        Some(&sink),
        "Page in milestone",
        "",
    ));
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
fn a_page_becomes_a_folder_when_it_gets_a_subpage() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let kitchen = by_title(&lib, "Kitchen measurements").id.clone();

    ops::create(
        &lib,
        Kind::Page,
        Some(&kitchen),
        "Appliances",
        "Fridge: 36 in wide.\n",
    )
    .unwrap();

    assert!(root
        .join("areas/Home/Renovate the house/Pages/Kitchen measurements/_index.md")
        .is_file());
    assert!(!root
        .join("areas/Home/Renovate the house/Pages/Kitchen measurements.md")
        .exists());
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
    let folder = root.join("areas/Home/Redo the bathroom");
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
    refused(ops::move_item(&lib, &lab, Some(&network), None)); // a page into its own subpage
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

#[test]
fn same_named_items_deleted_together_both_reach_the_trash() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let home = by_title(&lib, "Home").id.clone();
    let a = ops::create(&lib, Kind::Project, Some(&home), "Garden", "").unwrap();
    let b = ops::create(&lib, Kind::Project, Some(&home), "Garage", "").unwrap();
    let lib = load(&root);
    let first = ops::create(&lib, Kind::Task, Some(&a), "Tidy up", "from the garden").unwrap();
    let second = ops::create(&lib, Kind::Task, Some(&b), "Tidy up", "from the garage").unwrap();

    // Same name, same second: the second must not replace the first.
    let lib = load(&root);
    let one = ops::trash(&lib, &first).unwrap();
    let lib = load(&root);
    let two = ops::trash(&lib, &second).unwrap();
    assert_ne!(one, two);
    assert!(fs::read_to_string(root.join(&one))
        .unwrap()
        .contains("from the garden"));
    assert!(fs::read_to_string(root.join(&two))
        .unwrap()
        .contains("from the garage"));
    assert_eq!(task_core::trash::list(&root).unwrap().len(), 2);
}

#[test]
fn restoring_refuses_paths_outside_the_data_folder() {
    let (dir, root) = sample();
    let lib = load(&root);
    let trashed = ops::trash(&lib, "TSKTILE001").unwrap();
    let lib = load(&root);

    for target in [
        "../escaped.md",
        "/tmp/escaped.md",
        "areas/../../escaped.md",
        ".trash/again.md",
    ] {
        assert!(
            matches!(ops::restore(&lib, &trashed, target), Err(Error::NotAllowed(_))),
            "{target}"
        );
    }
    // And only things from the trash can be restored.
    assert!(matches!(
        ops::restore(&lib, "areas/Home/_index.md", "areas/Home/copy.md"),
        Err(Error::NotAllowed(_))
    ));
    assert!(!dir.path().join("escaped.md").exists());
    assert!(root.join(&trashed).exists(), "still in the trash");
}

// ---------------------------------------------------------------------------
// Unsorted
// ---------------------------------------------------------------------------

#[test]
fn a_restore_note_cannot_point_outside_areas() {
    // The note that says where a trashed item came from can arrive through a
    // sync. It must not be able to put a file in `.git/hooks`, say.
    let (_dir, root) = sample();
    let lib = load(&root);
    let trashed = ops::trash(&lib, "TSKTILE001").unwrap();
    let lib = load(&root);
    for target in [".git/hooks/post-merge", "unsorted.md", "Moss notes.md"] {
        assert!(
            matches!(ops::restore(&lib, &trashed, target), Err(Error::NotAllowed(_))),
            "{target}"
        );
    }
    assert!(root.join(&trashed).exists(), "still in the trash");
}

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
fn reading_the_folder_is_not_a_change() {
    // Linux reports every time a file is opened. If loading counted as a
    // change, the app would reload itself over and over.
    let (_dir, root) = sample();
    let (tx, rx) = mpsc::channel();
    let _watcher = task_core::watch::watch(&root, move |paths| {
        let _ = tx.send(paths);
    })
    .unwrap();
    std::thread::sleep(Duration::from_millis(100));
    // Ignore anything reported while the watcher was starting up.
    while rx.recv_timeout(Duration::from_millis(600)).is_ok() {}

    Library::load(&root).unwrap();
    if let Ok(paths) = rx.recv_timeout(Duration::from_millis(800)) {
        panic!("loading was reported as a change: {paths:?}");
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
    fs::write(
        trash.join("20260910-120000-Old task.md.from"),
        "areas/Home/Old task.md\n",
    )
    .unwrap();
    fs::write(trash.join("20261010-090000-Recent task.md"), "recent").unwrap();
    fs::write(trash.join("put here by hand.md"), "mine").unwrap();

    let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 16).unwrap();
    let removed = ops::empty_old_trash(&root, today, 30).unwrap();

    assert_eq!(removed, 2);
    assert!(!trash.join("20260901-100000-Old project").exists());
    assert!(!trash.join("20260910-120000-Old task.md").exists());
    // The note goes with its item, and isn't counted as a second one.
    assert!(!trash.join("20260910-120000-Old task.md.from").exists());
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
    let text = fs::read_to_string(root.join("areas/Technology/Pages/Homelab/_index.md")).unwrap();
    assert!(text.contains("icon: 🌿"), "stored in the frontmatter: {text}");

    // Emoji made of several characters joined together are fine.
    ops::set_field(&lib, &page, "icon", Some("👩‍💻")).unwrap();
    // Words, spaces and non-pages are not.
    assert!(ops::set_field(&lib, &page, "icon", Some("a long word")).is_err());
    assert!(ops::set_field(&lib, &task, "icon", Some("🌿")).is_err());

    // Removing it leaves no icon line behind.
    ops::set_field(&lib, &page, "icon", None).unwrap();
    let lib = load(&root);
    assert_eq!(by_title(&lib, "Homelab").icon, None);
    let text = fs::read_to_string(root.join("areas/Technology/Pages/Homelab/_index.md")).unwrap();
    assert!(!text.contains("icon:"));
}

// ---------------------------------------------------------------------------
// Pages in areas and projects
// ---------------------------------------------------------------------------

#[test]
fn pages_live_in_a_pages_folder_of_their_area_or_project() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let home = by_title(&lib, "Home").id.clone();
    let bath = by_title(&lib, "Redo the bathroom").id.clone();

    // A page in an area goes in its Pages folder (created on first use).
    let plan = ops::create(&lib, Kind::Page, Some(&home), "Floor plan", "").unwrap();
    assert!(root.join("areas/Home/Pages/Floor plan.md").is_file());
    // A page in a project without milestones doesn't make it "mixed".
    ops::create(&lib, Kind::Page, Some(&bath), "Tile ideas", "").unwrap();
    assert!(root
        .join("areas/Home/Redo the bathroom/Pages/Tile ideas.md")
        .is_file());

    let lib = load(&root);
    assert!(lib.issues.is_empty(), "{:#?}", lib.issues);
    assert_eq!(titles(&lib.children(Some(&home), true)), ["Floor plan"]);
    assert_eq!(titles(&lib.children(Some(&bath), false)), ["Pick tile"]);
    // A task can still go in the project, and a milestone can't (it has tasks).
    ops::create(&lib, Kind::Task, Some(&bath), "Order grout", "").unwrap();

    // Moving the only page out removes the now-empty Pages folder.
    ops::move_item(&lib, &plan, Some(&bath), None).unwrap();
    assert!(!root.join("areas/Home/Pages").exists());
    assert!(root
        .join("areas/Home/Redo the bathroom/Pages/Floor plan.md")
        .is_file());
    let lib = load(&root);
    assert_eq!(
        titles(&lib.children(Some(&bath), true)),
        ["Tile ideas", "Floor plan"]
    );
}

#[test]
fn projects_and_milestones_cant_be_called_pages() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let home = by_title(&lib, "Home").id.clone();
    let reno = by_title(&lib, "Renovate the house").id.clone();

    let invalid = |r: task_core::Result<String>| assert!(matches!(r, Err(Error::InvalidName(_))), "{r:?}");
    invalid(ops::create(&lib, Kind::Project, Some(&home), "Pages", ""));
    invalid(ops::create(&lib, Kind::Milestone, Some(&reno), "pages", ""));
    assert!(matches!(
        ops::rename(&lib, &reno, "Pages"),
        Err(Error::InvalidName(_))
    ));
    // A page or task called Pages is fine: it never sits next to a Pages folder.
    let lab = by_title(&lib, "Homelab").id.clone();
    ops::create(&lib, Kind::Page, Some(&lab), "Pages", "").unwrap();
}

#[test]
fn an_old_data_folder_moves_to_the_new_layout() {
    let (_dir, root) = sample();
    // Put the sample back the way older versions stored it: tasks/ and notes/.
    fs::rename(root.join("areas"), root.join("tasks")).unwrap();
    fs::create_dir(root.join("notes")).unwrap();
    fs::rename(
        root.join("tasks/Technology/Pages/Homelab"),
        root.join("notes/Homelab"),
    )
    .unwrap();
    fs::remove_dir(root.join("tasks/Technology/Pages")).unwrap();
    fs::write(root.join("notes/.DS_Store"), "").unwrap();

    assert!(task_core::migrate::migrate_layout(&root).unwrap());
    assert!(!root.join("tasks").exists());
    assert!(!root.join("notes").exists());

    let lib = load(&root);
    assert!(lib.issues.is_empty(), "{:#?}", lib.issues);
    let reference = by_title(&lib, "Reference");
    assert_eq!(reference.kind, Kind::Area);
    assert_eq!(titles(&lib.children(Some(&reference.id), true)), ["Homelab"]);
    // Subpages came along.
    let lab = by_title(&lib, "Homelab");
    assert_eq!(titles(&lib.children(Some(&lab.id), true)), ["Network", "Backups"]);
    // Everything else is where it was.
    assert_eq!(lib.items.iter().filter(|i| i.kind == Kind::Task).count(), 10);

    // Running it again does nothing.
    assert!(!task_core::migrate::migrate_layout(&root).unwrap());
}

#[test]
fn tasks_can_be_later_or_waiting() {
    let (_dir, root) = sample();
    let lib = load(&root);
    // The two optional lanes are ordinary statuses on disk.
    ops::set_field(&lib, "TSKINSTL01", "status", Some("waiting")).unwrap();
    ops::set_field(&lib, "TSKTILE001", "status", Some("later")).unwrap();
    let lib = load(&root);
    assert!(lib.issues.is_empty(), "{:#?}", lib.issues);
    assert_eq!(lib.get("TSKINSTL01").unwrap().status.as_deref(), Some("waiting"));
    assert_eq!(lib.get("TSKTILE001").unwrap().status.as_deref(), Some("later"));
    // Still task-only: a milestone can't wait.
    let sink = by_title(&lib, "Replace the sink").id.clone();
    assert!(ops::set_field(&lib, &sink, "status", Some("waiting")).is_err());
}

#[test]
fn the_example_only_goes_into_an_empty_folder() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample-data");
    let dir = tempfile::tempdir().unwrap();

    // A new folder (or one with only hidden files) gets the example.
    let fresh = dir.path().join("Moss");
    assert!(task_core::example::add_example(&source, &fresh).unwrap());
    let lib = load(&fresh);
    assert!(lib.issues.is_empty(), "{:#?}", lib.issues);
    assert!(lib.items.iter().any(|i| i.title == "Renovate the house"));

    // A folder with anything in it is left alone.
    let used = dir.path().join("Mine");
    fs::create_dir(&used).unwrap();
    fs::write(used.join("notes.txt"), "mine").unwrap();
    assert!(!task_core::example::add_example(&source, &used).unwrap());
    assert!(!used.join("areas").exists());
}

#[test]
fn the_trash_lists_restores_and_empties() {
    use task_core::trash;
    let (_dir, root) = sample();
    let lib = load(&root);

    // Deleting keeps a note of where it was, so the Trash can show and restore it.
    let tile = ops::trash(&lib, "TSKTILE001").unwrap();
    let entries = trash::list(&root).unwrap();
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry.path, tile);
    assert_eq!(entry.title, "Pick tile");
    assert_eq!(entry.kind, Some(Kind::Task));
    assert_eq!(entry.from, ["Home", "Redo the bathroom"]);
    assert_eq!(entry.deleted.len(), 16);

    let lib = load(&root);
    ops::restore(&lib, &entry.path, entry.original.as_deref().unwrap()).unwrap();
    assert!(trash::list(&root).unwrap().is_empty(), "the note goes with it");
    assert!(load(&root).items.iter().any(|i| i.id == "TSKTILE001"));

    // A task can't come back while the milestone it was in is still in the trash.
    let lib = load(&root);
    let sink = by_title(&lib, "Replace the sink").id.clone();
    let task = ops::trash(&lib, "TSKINSTL01").unwrap();
    let lib = load(&root);
    let milestone = ops::trash(&lib, &sink).unwrap();
    let lib = load(&root);
    let original = trash::list(&root)
        .unwrap()
        .into_iter()
        .find(|e| e.path == task)
        .unwrap()
        .original
        .unwrap();
    assert!(matches!(
        ops::restore(&lib, &task, &original),
        Err(Error::NotAllowed(_))
    ));

    // Delete forever, then empty the rest.
    trash::delete_forever(&root, &milestone).unwrap();
    assert_eq!(trash::list(&root).unwrap().len(), 1);
    assert!(
        trash::delete_forever(&root, "areas/Home").is_err(),
        "only things in the trash"
    );
    assert_eq!(trash::empty(&root).unwrap(), 1);
    assert!(trash::list(&root).unwrap().is_empty());
}

#[test]
fn the_example_can_come_from_files_built_into_the_app() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("Moss");
    let files: Vec<(&str, &[u8])> = vec![
        ("unsorted.md", b"- 2026-10-16 10:00 buy caulk\n"),
        ("areas/Home/_index.md", b"---\nid: AREAHOME01\n---\n"),
        ("areas/Home/.DS_Store", b"junk"),
    ];
    assert!(task_core::example::add_example_files(files.clone(), &target).unwrap());
    assert!(target.join("areas/Home/_index.md").is_file());
    assert!(
        !target.join("areas/Home/.DS_Store").exists(),
        "hidden files stay out"
    );
    assert_eq!(load(&target).items.len(), 1);
    // Never into a folder that has something in it.
    assert!(!task_core::example::add_example_files(files, &target).unwrap());
}

#[test]
fn names_windows_cant_store_are_refused_for_new_items_and_flagged_for_old_ones() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let home = by_title(&lib, "Home").id.clone();
    // New titles follow the strict rules, so the folder syncs to Windows.
    for bad in ["Call Bob?", "CON", "ends.", "a|b"] {
        assert!(
            matches!(
                ops::create(&lib, Kind::Project, Some(&home), bad, ""),
                Err(Error::InvalidName(_))
            ),
            "{bad}"
        );
    }
    // A name made earlier (here: by hand) still loads, with an Issue about it.
    fs::create_dir_all(root.join("areas/Home/Why not?")).unwrap();
    fs::write(
        root.join("areas/Home/Why not?/_index.md"),
        "---\nid: WHYNOT0001\n---\n",
    )
    .unwrap();
    let lib = load(&root);
    assert!(lib.get("WHYNOT0001").is_some(), "still loads");
    assert!(lib.issues.iter().any(|i| matches!(i, Issue::NotPortable { .. })));
}

// ---------------------------------------------------------------------------
// Repeating tasks
// ---------------------------------------------------------------------------

fn date(text: &str) -> chrono::NaiveDate {
    chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
}

#[test]
fn a_repeating_task_comes_back_instead_of_staying_done() {
    let (_dir, root) = sample();
    let lib = load(&root);
    ops::set_field(&lib, "TSKTILE001", "repeat", Some("Every 1 week")).unwrap();
    ops::set_field(&lib, "TSKTILE001", "due", Some("2026-10-20")).unwrap();
    let lib = load(&root);
    let tile = lib.get("TSKTILE001").unwrap();
    assert_eq!(
        tile.repeat.as_deref(),
        Some("weekly"),
        "stored in its canonical words"
    );

    // Finishing it on the day it's due: Todo again, due a week later.
    let next = ops::set_status(&lib, "TSKTILE001", "done", date("2026-10-20")).unwrap();
    assert_eq!(next.as_deref(), Some("2026-10-27"));
    let lib = load(&root);
    let tile = lib.get("TSKTILE001").unwrap();
    assert_eq!(
        (tile.status.as_deref(), tile.due.as_deref()),
        (Some("todo"), Some("2026-10-27"))
    );
    assert!(fs::read_to_string(root.join(tile.meta_path()))
        .unwrap()
        .contains("repeat: weekly"));

    // Finished late: back on the schedule, after today.
    let next = ops::set_status(&lib, "TSKTILE001", "done", date("2026-11-10")).unwrap();
    assert_eq!(next.as_deref(), Some("2026-11-17"));

    // Other statuses are plain changes.
    let lib = load(&root);
    assert_eq!(
        ops::set_status(&lib, "TSKTILE001", "doing", date("2026-11-10")).unwrap(),
        None
    );
    assert_eq!(
        load(&root).get("TSKTILE001").unwrap().status.as_deref(),
        Some("doing")
    );
}

#[test]
fn finishing_a_task_that_does_not_repeat_works_as_before() {
    let (_dir, root) = sample();
    let lib = load(&root);
    assert_eq!(
        ops::set_status(&lib, "TSKTILE001", "done", date("2026-10-20")).unwrap(),
        None
    );
    assert_eq!(
        load(&root).get("TSKTILE001").unwrap().status.as_deref(),
        Some("done")
    );
}

#[test]
fn repeat_is_checked_and_belongs_to_tasks() {
    let (_dir, root) = sample();
    let lib = load(&root);
    assert!(matches!(
        ops::set_field(&lib, "TSKTILE001", "repeat", Some("sometimes")),
        Err(Error::InvalidValue { .. })
    ));
    let home = by_title(&lib, "Home").id.clone();
    assert!(
        ops::set_field(&lib, &home, "repeat", Some("weekly")).is_err(),
        "an area can't repeat"
    );
    ops::set_field(&lib, "TSKTILE001", "repeat", Some("daily")).unwrap();
    ops::set_field(&lib, "TSKTILE001", "repeat", None).unwrap();
    assert_eq!(load(&root).get("TSKTILE001").unwrap().repeat, None);

    // A value written by hand that isn't a repeat is an Issue, and ignored.
    let path = root.join(load(&root).get("TSKTILE001").unwrap().meta_path());
    let text = fs::read_to_string(&path)
        .unwrap()
        .replacen("---\n", "---\nrepeat: whenever\n", 1);
    fs::write(&path, text).unwrap();
    let lib = load(&root);
    assert_eq!(lib.get("TSKTILE001").unwrap().repeat, None);
    assert!(lib
        .issues
        .iter()
        .any(|i| matches!(i, Issue::InvalidValue { field, .. } if field == "repeat")));
}

#[test]
fn a_copy_saved_by_git_sync_is_listed_as_an_issue_you_can_open() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let tile = lib.get("TSKTILE001").unwrap().clone();
    let copy_path = root.join(
        tile.path
            .replace("Pick tile.md", "Pick tile (from other computer).md"),
    );
    fs::write(
        &copy_path,
        "---\nstatus: doing\n---\nWritten on the other computer\n",
    )
    .unwrap();

    let lib = load(&root);
    let issue = lib
        .issues
        .iter()
        .find(|i| matches!(i, Issue::ConflictCopy { .. }))
        .expect("the copy is an issue");
    let id = issue.item_id().expect("and can be opened").to_owned();
    assert_eq!(lib.get(&id).unwrap().title, "Pick tile (from other computer)");
    assert!(!issue.is_fixable());
    // It is an ordinary task too, so it can be read, merged by hand and deleted.
    assert_eq!(
        ops::read_body(&lib, &id).unwrap().trim(),
        "Written on the other computer"
    );
}

#[test]
fn filing_an_entry_with_a_date_sets_the_due_date_and_keeps_what_was_typed() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let path = root.join("unsorted.md");
    let mut text = fs::read_to_string(&path).unwrap();
    text.push_str("- 2026-10-19 10:00 call Bob friday\n");
    fs::write(&path, text).unwrap();
    let entry = unsorted::read(&lib)
        .unwrap()
        .into_iter()
        .find(|e| e.text == "call Bob friday")
        .unwrap();
    let bath = by_title(&lib, "Redo the bathroom").id.clone();

    let options = unsorted::FileOptions {
        text: Some("call Bob".into()),
        due: Some("2026-10-23".into()),
    };
    let id = unsorted::file_with(&lib, &entry, Kind::Task, Some(&bath), &options).unwrap();

    let lib = load(&root);
    let task = lib.get(&id).unwrap();
    assert_eq!(task.title, "call Bob");
    assert_eq!(task.due.as_deref(), Some("2026-10-23"));
    // The words as typed are kept in the body, so nothing is lost.
    assert_eq!(ops::read_body(&lib, &id).unwrap().trim(), "call Bob friday");
    assert!(unsorted::read(&lib)
        .unwrap()
        .iter()
        .all(|e| e.text != "call Bob friday"));

    // A date only means something for a task.
    let entry = unsorted::add(&lib, "plan the trip friday", "2026-10-19 10:05").unwrap();
    let lib = load(&root);
    let id = unsorted::file_with(
        &lib,
        &entry,
        Kind::Page,
        Some(&bath),
        &unsorted::FileOptions {
            text: Some("plan the trip".into()),
            due: Some("2026-10-23".into()),
        },
    )
    .unwrap();
    assert_eq!(load(&root).get(&id).unwrap().due, None);
}

#[test]
fn a_task_can_wait_on_other_tasks_but_not_in_a_circle() {
    let (_dir, root) = sample();
    let lib = load(&root);
    assert!(lib.get("TSKTILE001").unwrap().blocked_by.is_empty());

    // Two blockers are stored as ids in one line and read back.
    ops::set_field(&lib, "TSKTILE001", "blocked_by", Some("TSKPLUMB01, TSKWATER01")).unwrap();
    let lib = load(&root);
    assert_eq!(
        lib.get("TSKTILE001").unwrap().blocked_by,
        vec!["TSKPLUMB01", "TSKWATER01"]
    );

    // A task can't wait on itself, on something that isn't a task, on an unknown id,
    // or on a task that already waits on it.
    assert!(ops::set_field(&lib, "TSKTILE001", "blocked_by", Some("TSKTILE001")).is_err());
    let home = by_title(&lib, "Home").id.clone();
    assert!(ops::set_field(&lib, "TSKTILE001", "blocked_by", Some(&home)).is_err());
    assert!(ops::set_field(&lib, "TSKTILE001", "blocked_by", Some("NOSUCHID01")).is_err());
    assert!(ops::set_field(&lib, "TSKPLUMB01", "blocked_by", Some("TSKTILE001")).is_err());
    assert!(ops::set_field(&lib, &home, "blocked_by", Some("TSKTILE001")).is_err());

    // Clearing removes the line.
    ops::set_field(&lib, "TSKTILE001", "blocked_by", None).unwrap();
    assert!(load(&root).get("TSKTILE001").unwrap().blocked_by.is_empty());
}

#[test]
fn hostile_frontmatter_is_isolated_and_the_rest_still_loads() {
    let (_dir, root) = sample();
    let tile = load(&root).get("TSKTILE001").unwrap().meta_path();
    let path = root.join(&tile);

    // Lines that aren't valid "key: value" YAML, a stray colon, a tab, a "---"
    // inside the body and even a second "---" block must not break anything.
    let junk = "---\nid: TSKTILE001\nstatus: doing\n: : :\n\t- nested\n[broken\nkey with spaces: x\n---\nBody with a rule:\n\n---\n\nand `---` more\n";
    fs::write(&path, junk).unwrap();
    let lib = load(&root);
    assert_eq!(lib.get("TSKTILE001").unwrap().status.as_deref(), Some("doing"));
    assert!(lib.items.len() > 10, "the rest of the folder still loads");

    // Changing a field keeps the odd lines and the whole body exactly.
    ops::set_field(&lib, "TSKTILE001", "due", Some("2026-11-01")).unwrap();
    let text = fs::read_to_string(&path).unwrap();
    assert!(text.contains("[broken\n") && text.contains("\t- nested\n"));
    assert!(text.ends_with("Body with a rule:\n\n---\n\nand `---` more\n"));

    // A block that is never closed is an Issue on that one file, not a crash,
    // and writing to it is refused instead of guessing where it ends.
    fs::write(&path, "---\nid: TSKTILE001\nstatus: doing\nno end\n").unwrap();
    let lib = load(&root);
    assert!(lib
        .issues
        .iter()
        .any(|i| matches!(i, Issue::UnclosedFrontmatter { .. })));
    assert!(lib.items.len() > 10);
    assert!(ops::set_field(&lib, "TSKTILE001", "due", Some("2026-11-01")).is_err());
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "---\nid: TSKTILE001\nstatus: doing\nno end\n"
    );

    // Empty, binary-looking and BOM-prefixed files load too.
    fs::write(&path, "").unwrap();
    load(&root);
    fs::write(&path, b"\xef\xbb\xbf---\r\nid: TSKTILE001\r\n---\r\ntext").unwrap();
    assert!(load(&root).get("TSKTILE001").is_some());
}

#[test]
fn renaming_an_area_with_hundreds_of_tasks_keeps_every_id_and_is_quick() {
    let (_dir, root) = sample();
    let lib = load(&root);
    let home = by_title(&lib, "Home").id.clone();
    let project = ops::create(&lib, Kind::Project, Some(&home), "Bulk", "").unwrap();
    let lib = load(&root);
    let before = lib.items.len();
    // 500 tasks written straight into the folder: renaming the area is one rename.
    let dir = root.join(&lib.get(&project).unwrap().path);
    for n in 0..500 {
        fs::write(
            dir.join(format!("Bulk {n}.md")),
            format!("---\nid: BULK{n:06}\nstatus: todo\n---\n"),
        )
        .unwrap();
    }
    let lib = load(&root);
    assert_eq!(lib.items.len(), before + 500);

    let started = std::time::Instant::now();
    ops::rename(&lib, &home, "Household").unwrap();
    let lib = load(&root);
    assert!(started.elapsed() < Duration::from_secs(2));
    assert_eq!(lib.items.len(), before + 500);
    assert!(lib
        .get("BULK000499")
        .unwrap()
        .path
        .starts_with("areas/Household/"));
    assert!(lib.issues.is_empty());
}
