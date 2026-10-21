//! Deleting old backups.

use std::fs;
use std::path::Path;

use super::{list, Kind, KEEP_AUTOMATIC, KEEP_BEFORE_RESTORE};
use crate::error::Result;

/// Keeps the newest `KEEP_AUTOMATIC` automatic backups and the newest
/// `KEEP_BEFORE_RESTORE` "before restore" ones, and deletes the rest. Backups
/// you made yourself ("manual") are never deleted here. Returns how many went.
pub fn prune(dir: &Path) -> Result<usize> {
    let mut removed = 0;
    for (kind, keep) in [
        (Kind::Automatic, KEEP_AUTOMATIC),
        (Kind::BeforeRestore, KEEP_BEFORE_RESTORE),
    ] {
        // `list` is newest first, so everything after the first `keep` is old.
        for old in list(dir).into_iter().filter(|b| b.kind == kind).skip(keep) {
            fs::remove_file(old.path)?;
            removed += 1;
        }
    }
    Ok(removed)
}
