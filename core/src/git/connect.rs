//! Starting sync.

use std::path::Path;

use super::command::{run, succeeds};
use super::repo::{is_repo, write_if_missing, GITATTRIBUTES, GITIGNORE, REMOTE};
use super::sync::sync;
use super::Outcome;
use crate::error::{Error, Result};

/// Turns `dir` into a repository that syncs with `url` (`branch` is the remote's
/// main branch). Safe to run on a folder that is already a repository.
///
/// If the remote already has content, it is merged with what's in the folder.
/// If it's empty, the folder's files become its first commit.
///
/// `lock` is held while the working folder changes (see the module docs).
pub fn connect<G>(
    dir: &Path,
    url: &str,
    branch: &str,
    token: Option<&str>,
    lock: impl Fn() -> G,
) -> Result<Outcome> {
    check_remote(dir, url, branch)?;
    {
        let _held = lock();
        if !is_repo(dir) {
            run(dir, token, &["init", "-b", branch])?;
        }
        write_if_missing(&dir.join(".gitattributes"), GITATTRIBUTES)?;
        write_if_missing(&dir.join(".gitignore"), GITIGNORE)?;
    }

    // Point `origin` at the repo, whether or not it was set before.
    if succeeds(dir, &["remote", "get-url", REMOTE]) {
        run(dir, token, &["remote", "set-url", REMOTE, url])?;
    } else {
        run(dir, token, &["remote", "add", REMOTE, url])?;
    }
    sync(dir, branch, token, true, lock)
}

/// The address and branch come from outside this code (the front end, GitHub's
/// answers). Git would read a leading `-` as an option, so refuse those, and
/// anything that isn't a plain branch name.
fn check_remote(dir: &Path, url: &str, branch: &str) -> Result<()> {
    let bad = |what: &str| Err(Error::Git(format!("{what} isn't valid")));
    if url.is_empty() || url.starts_with('-') || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return bad("The repository address");
    }
    if branch.is_empty()
        || branch.starts_with('-')
        || !branch
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
        || !succeeds(dir, &["check-ref-format", "--branch", branch])
    {
        return bad("The branch name");
    }
    Ok(())
}
