//! Bringing the other computers' changes in.

use std::path::Path;

use super::command::{run, split_nul};
use super::conflict;
use super::repo::head;
use crate::error::Result;

/// What a merge brought in.
pub(super) struct Merged {
    /// The branch moved: there was something new from the other side.
    pub pulled: bool,
    /// Copies and files where both sides changed the same thing (see `conflict`).
    pub conflicts: Vec<String>,
    /// Every file the merge changed, paths inside the data folder.
    pub changed: Vec<String>,
}

/// Merges `remote_ref` into the current branch. `unrelated` allows merging a
/// history that shares nothing with ours (first connect to a repository that
/// already has files).
///
/// If Git can't combine something, `conflict::resolve` keeps both versions. If
/// even that fails, the merge is undone completely and the error returned, so
/// nothing is ever half-merged.
pub(super) fn merge_remote(dir: &Path, remote_ref: &str, unrelated: bool) -> Result<Merged> {
    let before = head(dir);
    let mut args = vec![
        "-c",
        "commit.gpgsign=false",
        "merge",
        "--no-edit",
        "-m",
        "Moss: sync",
    ];
    if unrelated {
        args.push("--allow-unrelated-histories");
    }
    args.push(remote_ref);

    let conflicts = if run(dir, None, &args).is_ok() {
        Vec::new()
    } else {
        match conflict::resolve(dir, remote_ref) {
            Ok(kept) => kept,
            Err(e) => {
                let _ = run(dir, None, &["merge", "--abort"]);
                return Err(e);
            }
        }
    };

    let after = head(dir);
    let pulled = before != after;
    let changed = if pulled {
        changed_files(dir, before.as_deref())?
    } else {
        Vec::new()
    };
    Ok(Merged {
        pulled,
        conflicts,
        changed,
    })
}

/// The files that differ between `before` and now (everything, if there was no `before`).
fn changed_files(dir: &Path, before: Option<&str>) -> Result<Vec<String>> {
    let output = match before {
        Some(before) => run(dir, None, &["diff", "--name-only", "-z", before, "HEAD"])?,
        None => run(dir, None, &["ls-files", "-z"])?,
    };
    Ok(split_nul(&output))
}
