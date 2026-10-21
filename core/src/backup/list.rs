//! The backups in a folder.

use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::{Backup, Kind, PREFIX};

/// The backups in `dir`, newest first. Anything that isn't named like one of
/// ours is ignored, so a folder you keep other things in is safe.
pub fn list(dir: &Path) -> Vec<Backup> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut backups: Vec<Backup> = entries.filter_map(|e| describe(&e.ok()?.path())).collect();
    // The name starts with the time, so newest first is a reverse sort by name.
    backups.sort_by(|a, b| b.file_name.cmp(&a.file_name));
    backups
}

/// Reads one backup file's name and size. `None` if it isn't one of ours.
pub(super) fn describe(path: &Path) -> Option<Backup> {
    let file_name = path.file_name()?.to_str()?.to_owned();
    let rest = file_name.strip_prefix(PREFIX)?.strip_suffix(".zip")?;
    let (stamp, kind) = if let Some(s) = rest.strip_suffix(Kind::Manual.suffix()) {
        (s, Kind::Manual)
    } else if let Some(s) = rest.strip_suffix(Kind::BeforeRestore.suffix()) {
        (s, Kind::BeforeRestore)
    } else {
        (rest, Kind::Automatic)
    };
    // "2026-10-20 09-57-32" → "2026-10-20 09:57"
    let when = chrono::NaiveDateTime::parse_from_str(stamp, "%Y-%m-%d %H-%M-%S")
        .ok()?
        .format("%Y-%m-%d %H:%M")
        .to_string();
    let meta = fs::metadata(path).ok().filter(|m| m.is_file())?;
    let made_at = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64);
    Some(Backup {
        kind,
        path: path.to_path_buf(),
        file_name,
        when,
        made_at,
        bytes: meta.len(),
    })
}
