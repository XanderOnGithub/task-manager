//! Small questions about the repository.

use std::path::Path;

use super::command::{run, succeeds};
use crate::error::Result;

/// The remote's name. Moss only ever uses one.
pub(super) const REMOTE: &str = "origin";

/// `unsorted.md` is one line per capture. With `merge=union`, lines added on
/// two computers both survive instead of conflicting.
pub(super) const GITATTRIBUTES: &str = "unsorted.md merge=union\n";

/// The trash is per computer, and Moss's own scratch files stay out of the repo.
pub(super) const GITIGNORE: &str = ".trash/\n.DS_Store\n";

/// True if `dir` already has a repository of its own (not one in a parent folder).
pub fn is_repo(dir: &Path) -> bool {
    dir.join(".git").exists()
}

/// The current commit, or None in a repository with no commits yet.
pub(super) fn head(dir: &Path) -> Option<String> {
    run(dir, None, &["rev-parse", "--verify", "--quiet", "HEAD"])
        .ok()
        .map(|s| s.trim().to_owned())
}

/// Does the remote have this branch (as far as the last fetch knows)?
pub(super) fn remote_branch_exists(dir: &Path, remote_ref: &str) -> bool {
    succeeds(dir, &["rev-parse", "--verify", "--quiet", remote_ref])
}

/// How many commits this side has that the remote doesn't (`ahead`), and the
/// other way round (`behind`).
pub(super) fn ahead_behind(dir: &Path, remote_ref: &str) -> Result<(usize, usize)> {
    let counts = run(
        dir,
        None,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("HEAD...{remote_ref}"),
        ],
    )?;
    let mut parts = counts.split_whitespace().map(|n| n.parse::<usize>().unwrap_or(0));
    Ok((parts.next().unwrap_or(0), parts.next().unwrap_or(0)))
}

/// Settings this repository needs, set before every sync (so folders connected
/// by an older version get them too). Only this repository's config is touched,
/// never the global one.
///
/// - **A name to commit under.** A computer that never set up Git has none, and
///   merges need one too.
/// - **No links.** A synced repository may contain a link to a file elsewhere on
///   this computer. Check links out as plain files holding the link's text, so
///   nothing Moss writes can end up outside the data folder.
pub(super) fn ensure_settings(dir: &Path) -> Result<()> {
    run(dir, None, &["config", "core.symlinks", "false"])?;
    if run(dir, None, &["config", "user.email"]).map_or(true, |e| e.trim().is_empty()) {
        run(dir, None, &["config", "user.name", "Moss"])?;
        run(
            dir,
            None,
            &["config", "user.email", "moss@users.noreply.github.com"],
        )?;
    }
    Ok(())
}

/// Writes `text` to `path` unless the file is already there.
pub(super) fn write_if_missing(path: &Path, text: &str) -> Result<()> {
    if !path.exists() {
        crate::fsutil::write_atomic(path, text)?;
    }
    Ok(())
}
