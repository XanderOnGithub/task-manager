//! How much is waiting to be committed.

use std::path::Path;

use super::command::run;
use crate::error::Result;

/// How many files differ from the last commit (changed, new or deleted).
pub fn pending_changes(dir: &Path) -> Result<usize> {
    let status = run(dir, None, &["status", "--porcelain"])?;
    Ok(status.lines().filter(|l| !l.trim().is_empty()).count())
}
