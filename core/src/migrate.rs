//! Moving an older data folder to the current layout.
//!
//! Before pages belonged to areas and projects, the data folder had two
//! top-level folders:
//!
//! ```text
//! tasks/<Area>/...        areas, projects, milestones, tasks
//! notes/<Page>.md         pages, on their own
//! ```
//!
//! Now there's one, and pages live next to what they're about:
//!
//! ```text
//! areas/<Area>/...                 the same areas, projects, milestones, tasks
//! areas/<Area>/Pages/<Page>.md     an area's pages
//! ```
//!
//! `migrate_layout` makes that change once, when a folder is opened:
//!
//! 1. `tasks/` is renamed to `areas/` (nothing inside changes).
//! 2. Everything in `notes/` moves to a new area called "Reference", in its
//!    `Pages` folder. Links between pages are relative, and the pages keep
//!    their places relative to each other, so links keep working. Move them
//!    somewhere better in the app afterwards.
//!
//! It never overwrites anything: if a name is already taken at the new place,
//! that one entry stays where it was. Running it again is harmless.

use std::fs;
use std::path::Path;

use crate::error::Result;
use crate::frontmatter::{self, Frontmatter};
use crate::fsutil::{self, write_atomic};
use crate::id;
use crate::library::{AREAS_DIR, INDEX_FILE, PAGES_DIR};

/// The old folder names.
const OLD_TASKS_DIR: &str = "tasks";
const OLD_NOTES_DIR: &str = "notes";
/// Where old notes go.
pub const REFERENCE_AREA: &str = "Reference";

/// Moves an older data folder to the current layout. Returns true if anything
/// moved.
pub fn migrate_layout(root: &Path) -> Result<bool> {
    let mut moved = false;
    let areas = root.join(AREAS_DIR);

    // 1. tasks/ → areas/
    let old_tasks = root.join(OLD_TASKS_DIR);
    if old_tasks.is_dir() {
        if !areas.exists() {
            // The simple case: one rename and we're done.
            fs::rename(&old_tasks, &areas)?;
            moved = true;
        } else {
            // Both exist (e.g. a sync tool brought back an old copy): move
            // over whatever isn't there yet.
            moved |= move_entries(&old_tasks, &areas)?;
        }
    }

    // 2. notes/* → areas/Reference/Pages/*
    let old_notes = root.join(OLD_NOTES_DIR);
    if old_notes.is_dir() && has_visible_entries(&old_notes)? {
        let reference = areas.join(REFERENCE_AREA);
        fs::create_dir_all(&reference)?;
        let index = reference.join(INDEX_FILE);
        if !index.exists() {
            // A new area needs its own _index.md with an id.
            let mut fm = Frontmatter::default();
            fm.set("id", Some(&id::new_id()));
            fm.set("created", Some(&fsutil::today()));
            write_atomic(&index, &frontmatter::join(&fm, ""))?;
        }
        let pages = reference.join(PAGES_DIR);
        fs::create_dir_all(&pages)?;
        moved |= move_entries(&old_notes, &pages)?;
    }

    Ok(moved)
}

/// Moves every visible entry of `from` into `to`, skipping names already used
/// in `to`. Removes `from` if that left it empty. Returns true if anything
/// moved.
fn move_entries(from: &Path, to: &Path) -> Result<bool> {
    let mut moved = false;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue; // .DS_Store and friends stay behind
        }
        let target = to.join(&name);
        if target.exists() {
            continue; // never overwrite
        }
        fs::rename(entry.path(), target)?;
        moved = true;
    }
    // Only removes the folder if nothing (not even a hidden file) is left.
    if !has_visible_entries(from)? {
        let _ = fs::remove_file(from.join(".DS_Store"));
        let _ = fs::remove_dir(from);
    }
    Ok(moved)
}

/// True if the folder has anything in it besides hidden files.
fn has_visible_entries(dir: &Path) -> Result<bool> {
    for entry in fs::read_dir(dir)? {
        if !entry?.file_name().to_string_lossy().starts_with('.') {
            return Ok(true);
        }
    }
    Ok(false)
}
