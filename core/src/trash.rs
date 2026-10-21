//! The trash: everything you delete, for 30 days.
//!
//! Deleting moves the item (file or whole folder) into the hidden `.trash`
//! folder, named with the time it was deleted:
//!
//! ```text
//! .trash/20261016-223512-Paint the walls.md         the task itself
//! .trash/20261016-223512-Paint the walls.md.from    one line: where it was
//! ```
//!
//! The small `.from` note is what lets you restore it later from the Trash
//! view (not only right after deleting, from the toast). Things deleted more
//! than 30 days ago are removed for good when the app opens (see
//! `ops::empty_old_trash`), notes and all.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::{Error, Result};
use crate::model::Kind;

/// The folder inside the data folder.
pub const TRASH_DIR: &str = ".trash";
/// Ending of the note that says where a trashed item came from.
const FROM: &str = ".from";

/// One thing in the trash, for the Trash view.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    /// Where it is now, e.g. `.trash/20261016-223512-Paint the walls.md`.
    pub path: String,
    /// Where it came from, e.g. `areas/Home/Renovate the house/Paint the walls.md`.
    /// `None` for things trashed before the app kept notes (they can't be restored here).
    pub original: Option<String>,
    pub title: String,
    pub kind: Option<Kind>,
    /// The titles of what it was inside, top first: `["Home", "Renovate the house"]`.
    pub from: Vec<String>,
    /// When it was deleted, `YYYY-MM-DD HH:MM`.
    pub deleted: String,
}

/// Writes the note next to a freshly trashed item.
pub(crate) fn note_origin(root: &Path, trash_rel: &str, original_rel: &str) -> Result<()> {
    crate::fsutil::write_atomic(
        &root.join(format!("{trash_rel}{FROM}")),
        &format!("{original_rel}\n"),
    )?;
    Ok(())
}

/// Removes an item's note (after it's restored or deleted for good).
pub(crate) fn forget_origin(root: &Path, trash_rel: &str) {
    let _ = fs::remove_file(root.join(format!("{trash_rel}{FROM}")));
}

/// Everything in the trash, most recently deleted first.
pub fn list(root: &Path) -> Result<Vec<TrashEntry>> {
    let dir = root.join(TRASH_DIR);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new()); // no trash yet
    };
    let mut out = Vec::new();
    for entry in entries {
        let name = entry?.file_name().to_string_lossy().into_owned();
        if name.ends_with(FROM) || name.starts_with('.') {
            continue;
        }
        let path = format!("{TRASH_DIR}/{name}");
        let original = fs::read_to_string(root.join(format!("{path}{FROM}")))
            .ok()
            .map(|text| text.trim().to_owned())
            .filter(|text| !text.is_empty());
        // "20261016-223512-Paint the walls.md" → stamp and name.
        let (deleted, rest) = split_stamp(&name);
        let title = rest.strip_suffix(".md").unwrap_or(rest).to_owned();
        let (kind, from) = match &original {
            Some(original) => (kind_of(original), parents_of(original)),
            None => (None, Vec::new()),
        };
        out.push(TrashEntry {
            path,
            original,
            title,
            kind,
            from,
            deleted,
        });
    }
    // The stamp sorts by time, so newest first is a reverse sort by name.
    out.sort_by(|a, b| b.path.cmp(&a.path));
    Ok(out)
}

/// Deletes one thing from the trash for good.
pub fn delete_forever(root: &Path, trash_rel: &str) -> Result<()> {
    crate::fsutil::check_inside(trash_rel)?;
    if !trash_rel.starts_with(&format!("{TRASH_DIR}/")) {
        return Err(Error::NotAllowed("That isn't in the trash".into()));
    }
    let path = root.join(trash_rel);
    if path.is_dir() {
        fs::remove_dir_all(&path)?;
    } else {
        fs::remove_file(&path)?;
    }
    forget_origin(root, trash_rel);
    Ok(())
}

/// Deletes everything in the trash for good. Returns how many things it removed.
pub fn empty(root: &Path) -> Result<usize> {
    let entries = list(root)?;
    for entry in &entries {
        delete_forever(root, &entry.path)?;
    }
    Ok(entries.len())
}

/// "20261016-223512-Paint the walls.md" → ("2026-10-16 22:35", "Paint the walls.md").
/// Names without a stamp come back with an empty time.
fn split_stamp(name: &str) -> (String, &str) {
    let stamp = name.get(..15).filter(|s| {
        s.as_bytes()[8] == b'-' && s.chars().enumerate().all(|(i, c)| i == 8 || c.is_ascii_digit())
    });
    match (stamp, name.get(16..)) {
        (Some(s), Some(rest)) => (
            format!(
                "{}-{}-{} {}:{}",
                &s[0..4],
                &s[4..6],
                &s[6..8],
                &s[9..11],
                &s[11..13]
            ),
            rest,
        ),
        _ => (String::new(), name),
    }
}

/// What an item was, worked out from where it lived (the same rules as
/// loading, see library.rs).
fn kind_of(original: &str) -> Option<Kind> {
    let parts: Vec<&str> = original.strip_prefix("areas/")?.split('/').collect();
    if parts.contains(&"Pages") {
        return Some(Kind::Page);
    }
    let is_file = original.ends_with(".md");
    match (parts.len(), is_file) {
        (1, false) => Some(Kind::Area),
        (2, false) => Some(Kind::Project),
        (3, false) => Some(Kind::Milestone),
        (3, true) | (4, true) => Some(Kind::Task),
        _ => None,
    }
}

/// The titles of the folders it was in, without `areas` and `Pages`.
fn parents_of(original: &str) -> Vec<String> {
    let mut parts: Vec<&str> = original.split('/').collect();
    parts.pop(); // the item itself
    parts
        .into_iter()
        .filter(|p| *p != "areas" && *p != "Pages")
        .map(|p| p.trim_end_matches(".md").to_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_time_from_the_name() {
        let (when, rest) = split_stamp("20261016-223512-Paint the walls.md");
        assert_eq!(when, "2026-10-16 22:35");
        assert_eq!(rest, "Paint the walls.md");
        assert_eq!(split_stamp("notes.md").0, "");
    }

    #[test]
    fn works_out_kind_and_parents_from_the_old_place() {
        assert_eq!(kind_of("areas/Home"), Some(Kind::Area));
        assert_eq!(kind_of("areas/Home/Renovate"), Some(Kind::Project));
        assert_eq!(kind_of("areas/Home/Renovate/Sink"), Some(Kind::Milestone));
        assert_eq!(kind_of("areas/Home/Renovate/Sink/Caulk.md"), Some(Kind::Task));
        assert_eq!(kind_of("areas/Home/Bath/Tile.md"), Some(Kind::Task));
        assert_eq!(kind_of("areas/Home/Pages/Plan.md"), Some(Kind::Page));
        assert_eq!(
            parents_of("areas/Home/Renovate/Pages/Plan.md"),
            ["Home", "Renovate"]
        );
    }
}
