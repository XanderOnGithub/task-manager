//! Stopping sync.

use std::path::Path;

use super::command::{run, succeeds};
use super::repo::REMOTE;
use crate::error::Result;

/// Stops syncing: forgets the remote. The files and their history stay.
pub fn disconnect(dir: &Path) -> Result<()> {
    if succeeds(dir, &["remote", "get-url", REMOTE]) {
        run(dir, None, &["remote", "remove", REMOTE])?;
    }
    Ok(())
}
