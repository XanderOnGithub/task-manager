//! Committing what changed.

use std::path::Path;

use super::command::run;
use super::status::pending_changes;
use crate::error::Result;

/// Commits everything that changed. Returns false if there was nothing to commit.
pub fn commit_all(dir: &Path) -> Result<bool> {
    let changes = pending_changes(dir)?;
    if changes == 0 {
        return Ok(false);
    }
    run(dir, None, &["add", "-A"])?;
    let message = if changes == 1 {
        "Moss: 1 change".to_string()
    } else {
        format!("Moss: {changes} changes")
    };
    run(
        dir,
        None,
        &["-c", "commit.gpgsign=false", "commit", "-m", &message],
    )?;
    Ok(true)
}
