//! Everything that changes files: create, rename, move, set a field, edit a body,
//! send to trash.
//!
//! Each function checks the hierarchy rules first, then touches the disk. None of
//! them update the in-memory `Library`; the caller loads again afterwards (the
//! file watcher does this automatically). That keeps one source of truth: the
//! files.
//!
//! Ids live inside the files, so renaming or moving a file never changes its id.

use std::fs;
use std::path::Path;

use crate::error::{Error, Result};
use crate::frontmatter::{self, Frontmatter};
use crate::fsutil::{self, title_taken, write_atomic};
use crate::id;
use crate::library::{has_pages, is_date, Library, AREAS_DIR, INDEX_FILE, PAGES_DIR};
use crate::model::{is_icon, Item, Kind, MILESTONE_COLORS};
use crate::names::check_title;
use crate::order;
use crate::trash;

/// Creates a new item and returns its id.
///
/// `parent` is the id of the item to create it in, or `None` for a new area.
/// A page's parent is an area, a project or another page. `body` is the text
/// under the frontmatter (often empty).
pub fn create(lib: &Library, kind: Kind, parent: Option<&str>, title: &str, body: &str) -> Result<String> {
    check_title(title)?;
    check_reserved(kind, title)?;

    // Where does it go?
    let dir_rel = match parent {
        None => top_level_dir(kind)?.to_owned(),
        Some(parent_id) => {
            let parent = find(lib, parent_id)?;
            check_parent(lib, kind, parent, None)?;
            folder_for_children(lib, parent, kind)?
        }
    };
    let dir = lib.abs(&dir_rel);
    fs::create_dir_all(&dir)?;
    if title_taken(&dir, title, None)? {
        return Err(Error::NameTaken(title.to_owned()));
    }

    // Frontmatter for the new item.
    let new_id = id::new_unique_id(|candidate| lib.get(candidate).is_some());
    let siblings = lib.children(parent, kind.is_page());
    let mut fm = Frontmatter::default();
    fm.set("id", Some(&new_id));
    if let Some(status) = kind.default_status() {
        fm.set("status", Some(status));
    }
    fm.set("order", Some(&next_order(&siblings)));
    fm.set("created", Some(&fsutil::today()));
    if kind == Kind::Milestone {
        fm.set("color", Some(least_used_color(&siblings)));
    }
    let text = frontmatter::join(&fm, body);

    // Areas, projects and milestones are folders; tasks and pages are files.
    // (A page becomes a folder later, when it gets its first subpage.)
    match kind {
        Kind::Area | Kind::Project | Kind::Milestone => {
            let folder = dir.join(title);
            fs::create_dir(&folder)?;
            write_atomic(&folder.join(INDEX_FILE), &text)?;
        }
        Kind::Task | Kind::Page => {
            write_atomic(&dir.join(format!("{title}.md")), &text)?;
        }
    }
    Ok(new_id)
}

/// Renames an item. Its id, and so any future links to it, stay the same.
pub fn rename(lib: &Library, id: &str, new_title: &str) -> Result<()> {
    check_title(new_title)?;
    let item = find(lib, id)?;
    check_reserved(item.kind, new_title)?;
    if item.title == new_title {
        return Ok(());
    }

    let old_path = lib.abs(&item.path);
    let dir = old_path.parent().expect("items are always inside a folder");
    let old_name = old_path.file_name().and_then(|n| n.to_str());
    if title_taken(dir, new_title, old_name)? {
        return Err(Error::NameTaken(new_title.to_owned()));
    }

    let new_name = if item.is_folder {
        new_title.to_owned()
    } else {
        format!("{new_title}.md")
    };
    fs::rename(&old_path, dir.join(new_name))?;
    Ok(())
}

/// Moves an item, and/or changes its position among its siblings.
///
/// - `new_parent`: where it goes (`None` = top level, for areas).
///   Pass its current parent to just reorder.
/// - `before`: id of the sibling to place it in front of, or `None` for the end.
pub fn move_item(lib: &Library, id: &str, new_parent: Option<&str>, before: Option<&str>) -> Result<()> {
    let item = find(lib, id)?;
    let same_parent = item.parent.as_deref() == new_parent;

    // 1. Move the file or folder, if the parent changes.
    let meta_rel = if same_parent {
        item.meta_path()
    } else {
        let dir_rel = match new_parent {
            None => top_level_dir(item.kind)?.to_owned(),
            Some(parent_id) => {
                let parent = find(lib, parent_id)?;
                check_parent(lib, item.kind, parent, Some(id))?;
                folder_for_children(lib, parent, item.kind)?
            }
        };
        let dir = lib.abs(&dir_rel);
        fs::create_dir_all(&dir)?;
        if title_taken(&dir, &item.title, None)? {
            return Err(Error::NameTaken(item.title.clone()));
        }
        let name = item.path.rsplit('/').next().expect("paths have a name");
        fs::rename(lib.abs(&item.path), dir.join(name))?;
        remove_if_empty_pages_folder(lib, &item.path);

        let new_path = format!("{dir_rel}/{name}");
        if item.is_folder {
            format!("{new_path}/{INDEX_FILE}")
        } else {
            new_path
        }
    };

    // 2. Work out the new order key from its new neighbours.
    let mut siblings: Vec<&Item> = lib
        .children(new_parent, item.kind.is_page())
        .into_iter()
        .filter(|s| s.id != id)
        .collect();

    // Files made outside the app may have no order key. Give every sibling one
    // (in their current display order) so there are neighbours to fit between.
    // This writes several files, but only happens once per folder.
    let mut keys: Vec<Option<String>> = siblings.iter().map(|s| s.order.clone()).collect();
    if keys.iter().any(Option::is_none) {
        let fresh = order::keys_after(None, siblings.len());
        for (sibling, key) in siblings.iter_mut().zip(&fresh) {
            update_frontmatter(&lib.abs(&sibling.meta_path()), |fm| fm.set("order", Some(key)))?;
        }
        keys = fresh.into_iter().map(Some).collect();
    }

    let key = match before.and_then(|b| siblings.iter().position(|s| s.id == b)) {
        Some(0) => order::key_between(None, keys[0].as_deref()),
        Some(i) => order::key_between(keys[i - 1].as_deref(), keys[i].as_deref()),
        None => order::key_between(keys.last().and_then(|k| k.as_deref()), None),
    };
    update_frontmatter(&lib.abs(&meta_rel), |fm| fm.set("order", Some(&key)))?;
    Ok(())
}

/// Changes one field: `status`, `due` or `color`. `None` clears it.
pub fn set_field(lib: &Library, id: &str, field: &str, value: Option<&str>) -> Result<()> {
    let item = find(lib, id)?;
    let invalid = || Error::InvalidValue {
        field: field.to_owned(),
        value: value.unwrap_or("").to_owned(),
    };

    let ok = match (field, value) {
        ("status", Some(v)) => item.kind.statuses().contains(&v),
        ("status", None) => false, // every status-bearing kind needs one
        ("due", Some(v)) => is_date(v),
        ("due", None) => true,
        ("color", Some(v)) => item.kind == Kind::Milestone && MILESTONE_COLORS.contains(&v),
        ("color", None) => item.kind == Kind::Milestone,
        ("icon", Some(v)) => item.kind == Kind::Page && is_icon(v),
        ("icon", None) => item.kind == Kind::Page,
        _ => return Err(Error::NotAllowed(format!("\"{field}\" can't be changed here"))),
    };
    if !ok {
        return Err(invalid());
    }
    update_frontmatter(&lib.abs(&item.meta_path()), |fm| fm.set(field, value))
}

/// Reads an item's body: the text under the frontmatter.
pub fn read_body(lib: &Library, id: &str) -> Result<String> {
    let item = find(lib, id)?;
    let path = lib.abs(&item.meta_path());
    if !path.exists() {
        return Ok(String::new()); // folder without _index.md
    }
    let text = fs::read_to_string(path)?;
    match frontmatter::split(&text) {
        Ok((_, body)) => Ok(body.to_owned()),
        Err(_) => Err(unclosed(&item.title)),
    }
}

/// Replaces an item's body, keeping its frontmatter exactly as it was.
pub fn write_body(lib: &Library, id: &str, body: &str) -> Result<()> {
    let item = find(lib, id)?;
    let path = lib.abs(&item.meta_path());
    let text = if path.exists() {
        fs::read_to_string(&path)?
    } else {
        String::new()
    };
    let (fm, _old_body) = frontmatter::split(&text).map_err(|_| unclosed(&item.title))?;
    write_atomic(&path, &frontmatter::join(&fm, body))?;
    Ok(())
}

/// Moves an item (and everything inside it) to the hidden `.trash` folder,
/// with a note of where it was (see trash.rs). Returns where it went, so the
/// app can offer Undo with `restore`.
pub fn trash(lib: &Library, id: &str) -> Result<String> {
    let item = find(lib, id)?;
    let name = item.path.rsplit('/').next().expect("paths have a name");
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let trash_rel = format!(".trash/{stamp}-{name}");

    fs::create_dir_all(lib.abs(".trash"))?;
    fs::rename(lib.abs(&item.path), lib.abs(&trash_rel))?;
    trash::note_origin(&lib.root, &trash_rel, &item.path)?;
    remove_if_empty_pages_folder(lib, &item.path);
    Ok(trash_rel)
}

/// Puts a trashed item back where it was (Undo after Delete, or Restore in
/// the Trash view).
///
/// The place it goes back into has to exist: restoring a task whose project
/// was deleted too would make a folder with no project in it, so that's
/// refused until the project is restored. The one exception is a `Pages`
/// folder, which is just made again.
pub fn restore(lib: &Library, trash_rel: &str, original_rel: &str) -> Result<()> {
    let target = lib.abs(original_rel);
    if target.exists() {
        let name = original_rel.rsplit('/').next().unwrap_or(original_rel);
        return Err(Error::NameTaken(name.trim_end_matches(".md").to_owned()));
    }
    if let Some(dir) = target.parent() {
        if !dir.exists() {
            let is_pages = dir.file_name().is_some_and(|n| n == PAGES_DIR);
            let owner_exists = dir.parent().is_some_and(Path::exists);
            if is_pages && owner_exists {
                fs::create_dir_all(dir)?;
            } else {
                let parent = dir
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                return Err(Error::NotAllowed(format!(
                    "\"{parent}\" was deleted too. Restore it first."
                )));
            }
        }
    }
    fs::rename(lib.abs(trash_rel), target)?;
    trash::forget_origin(&lib.root, trash_rel);
    Ok(())
}

/// How long deleted things stay in `.trash` before they're gone for good.
pub const TRASH_KEEP_DAYS: i64 = 30;

/// `empty_old_trash` for today, with the usual 30 days. The app calls this
/// whenever it opens a folder.
pub fn empty_old_trash_now(root: &Path) -> Result<usize> {
    empty_old_trash(root, chrono::Local::now().date_naive(), TRASH_KEEP_DAYS)
}

/// Deletes things that have sat in `.trash` for more than `keep_days` days.
/// Returns how many it removed.
///
/// Every trashed entry's name starts with the time it was deleted
/// (`20261016-134501-Paint the walls.md`, see `trash` above). We go by that
/// stamp rather than the file's modified time, because moving a file to the
/// trash doesn't change its modified time: a note you wrote last year and
/// deleted today would look a year old. Anything without a stamp (something
/// you put there by hand) is left alone.
pub fn empty_old_trash(root: &Path, today: chrono::NaiveDate, keep_days: i64) -> Result<usize> {
    let trash = root.join(".trash");
    let Ok(entries) = fs::read_dir(&trash) else {
        return Ok(0); // no trash folder yet: nothing to do
    };
    let mut removed = 0;
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // The first 8 characters are the date: YYYYMMDD.
        let Some(deleted_on) = name
            .get(..8)
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y%m%d").ok())
        else {
            continue;
        };
        if (today - deleted_on).num_days() > keep_days {
            let path = entry.path();
            if entry.file_type()?.is_dir() {
                fs::remove_dir_all(&path)?;
            } else {
                fs::remove_file(&path)?;
            }
            removed += 1;
        }
    }
    Ok(removed)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Finds an item or returns a NotFound error.
fn find<'a>(lib: &'a Library, id: &str) -> Result<&'a Item> {
    lib.get(id).ok_or_else(|| Error::NotFound(id.to_owned()))
}

/// Where top-level items of this kind live.
fn top_level_dir(kind: Kind) -> Result<&'static str> {
    match kind {
        Kind::Area => Ok(AREAS_DIR),
        Kind::Page => Err(Error::NotAllowed(
            "Choose an area or project for this page".into(),
        )),
        Kind::Project => Err(Error::NotAllowed("Choose an area for this project".into())),
        Kind::Milestone => Err(Error::NotAllowed("Choose a project for this milestone".into())),
        Kind::Task => Err(Error::NotAllowed(
            "Choose a milestone or project for this task".into(),
        )),
    }
}

/// The hierarchy rules: can an item of `kind` go inside `parent`?
///
/// `moving` is the id of the item being moved (it's ignored when checking the
/// parent's other children, and a page can't move inside itself).
fn check_parent(lib: &Library, kind: Kind, parent: &Item, moving: Option<&str>) -> Result<()> {
    let not_allowed = |msg: &str| Err(Error::NotAllowed(msg.to_owned()));
    // The parent's other children, not counting pages (pages never mix with
    // milestones or tasks: they sit in their own Pages folder).
    let others = || {
        lib.children(Some(&parent.id), false)
            .into_iter()
            .filter(move |c| Some(c.id.as_str()) != moving)
    };

    match (kind, parent.kind) {
        (Kind::Area, _) => not_allowed("Areas can't go inside other items"),

        (Kind::Project, Kind::Area) => Ok(()),
        (Kind::Project, _) => not_allowed("A project goes inside an area"),

        (Kind::Milestone, Kind::Project) => {
            if others().any(|c| c.kind == Kind::Task) {
                not_allowed("This project has tasks without a milestone. Move them into a milestone first.")
            } else {
                Ok(())
            }
        }
        (Kind::Milestone, _) => not_allowed("A milestone goes inside a project"),

        (Kind::Task, Kind::Milestone) => Ok(()),
        (Kind::Task, Kind::Project) => {
            if others().any(|c| c.kind == Kind::Milestone) {
                not_allowed("This project uses milestones. Choose a milestone for this task.")
            } else {
                Ok(())
            }
        }
        (Kind::Task, _) => not_allowed("A task goes inside a milestone or a project"),

        // Pages belong to an area or a project, or sit under another page.
        (Kind::Page, Kind::Area | Kind::Project) => Ok(()),
        (Kind::Page, Kind::Page) => match moving {
            Some(moving_id) if lib.is_within(&parent.id, moving_id) => {
                not_allowed("A page can't go inside itself")
            }
            _ => Ok(()),
        },
        (Kind::Page, _) => not_allowed("A page goes inside an area, a project or another page"),
    }
}

/// The folder that a child of `kind` inside `parent` is stored in.
///
/// - Pages of an area or project go in its `Pages` folder.
/// - A page stored as a single file (`Homelab.md`) is turned into a folder
///   (`Homelab/_index.md`) the first time it gets a subpage.
fn folder_for_children(lib: &Library, parent: &Item, kind: Kind) -> Result<String> {
    if kind == Kind::Page && has_pages(parent.kind) {
        return Ok(format!("{}/{PAGES_DIR}", parent.path));
    }
    if parent.is_folder {
        return Ok(parent.path.clone());
    }
    let folder_rel = parent.path.strip_suffix(".md").unwrap_or(&parent.path).to_owned();
    let folder = lib.abs(&folder_rel);
    if folder.exists() {
        return Err(Error::NameTaken(parent.title.clone()));
    }
    fs::create_dir(&folder)?;
    fs::rename(lib.abs(&parent.path), folder.join(INDEX_FILE))?;
    Ok(folder_rel)
}

/// "Pages" is the folder that holds an area's or project's pages, so no
/// project or milestone can use that name (it would sit in the same folder).
/// Areas, tasks and pages never sit next to a Pages folder, so they can.
fn check_reserved(kind: Kind, title: &str) -> Result<()> {
    if matches!(kind, Kind::Project | Kind::Milestone) && title.eq_ignore_ascii_case(PAGES_DIR) {
        return Err(Error::InvalidName(format!(
            "\"{PAGES_DIR}\" is reserved for pages. Choose another name for this {}",
            kind.name()
        )));
    }
    Ok(())
}

/// After moving the last page out of a `Pages` folder, remove the empty folder
/// so the data folder stays tidy. `old_rel` is where the page used to be.
/// Failing to remove it is fine (it just stays empty), so errors are ignored.
fn remove_if_empty_pages_folder(lib: &Library, old_rel: &str) {
    let Some((dir_rel, _name)) = old_rel.rsplit_once('/') else {
        return;
    };
    if dir_rel.rsplit('/').next() == Some(PAGES_DIR) {
        // remove_dir only removes EMPTY folders, so this can't delete anything.
        let _ = fs::remove_dir(lib.abs(dir_rel));
    }
}

/// An order key after the last sibling.
fn next_order(siblings: &[&Item]) -> String {
    let last = siblings.iter().filter_map(|s| s.order.as_deref()).max();
    order::key_between(last, None)
}

/// The milestone color its siblings use least, so new milestones look different.
fn least_used_color(siblings: &[&Item]) -> &'static str {
    MILESTONE_COLORS
        .iter()
        .min_by_key(|color| {
            siblings
                .iter()
                .filter(|s| s.color.as_deref() == Some(**color))
                .count()
        })
        .expect("palette isn't empty")
}

/// Reads a file's frontmatter, lets `change` edit it, and saves. The body is
/// kept exactly as it was. A missing file is created (folders without
/// `_index.md`).
pub(crate) fn update_frontmatter(path: &Path, change: impl FnOnce(&mut Frontmatter)) -> Result<()> {
    let text = if path.exists() {
        fs::read_to_string(path)?
    } else {
        String::new()
    };
    let (mut fm, body) = frontmatter::split(&text).map_err(|_| {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        unclosed(&name)
    })?;
    change(&mut fm);
    write_atomic(path, &frontmatter::join(&fm, body))?;
    Ok(())
}

fn unclosed(title: &str) -> Error {
    Error::NotAllowed(format!(
        "The details block at the top of \"{title}\" is never closed with ---. Fix it in a text editor first."
    ))
}
