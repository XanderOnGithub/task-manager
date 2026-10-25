//! How this device keeps the folder in step with GitHub.
//!
//! - **Computers** use the `git` program already installed (`task_core::git`).
//! - **Android** has no `git`, so it uses GitHub's web API instead
//!   (`task_core::apisync`). It follows the same rules: nothing is thrown away,
//!   and both versions of a file changed on two devices are kept.
//!
//! The rest of the app calls these functions and doesn't know which is which.

use std::path::Path;

use task_core::error::Result;
use task_core::git::Outcome;

#[cfg(not(target_os = "android"))]
mod imp {
    use super::*;
    use task_core::git;

    pub fn available() -> bool {
        git::available()
    }

    /// Starts syncing `dir` with `repo` ("owner/name"). `url` is its address, already checked.
    pub fn connect<G>(
        dir: &Path,
        _repo: &str,
        url: &str,
        branch: &str,
        token: &str,
        lock: impl Fn() -> G,
    ) -> Result<Outcome> {
        git::connect(dir, url, branch, Some(token), lock)
    }

    pub fn sync<G>(
        dir: &Path,
        _repo: &str,
        branch: &str,
        token: &str,
        lock: impl Fn() -> G,
    ) -> Result<Outcome> {
        git::sync(dir, branch, Some(token), false, lock)
    }

    /// How many files differ from the last sync.
    pub fn pending(dir: &Path) -> usize {
        git::pending_changes(dir).unwrap_or(0)
    }

    /// On quit: commit what's pending (quick, local). The push happens next launch.
    pub fn save_before_quit(dir: &Path) {
        let _ = git::commit_all(dir);
    }

    pub fn disconnect(dir: &Path) -> Result<()> {
        git::disconnect(dir)
    }
}

#[cfg(target_os = "android")]
mod imp {
    use super::*;
    use task_core::apisync::{self, GithubRemote};

    pub fn available() -> bool {
        true
    }

    pub fn connect<G>(
        dir: &Path,
        repo: &str,
        _url: &str,
        branch: &str,
        token: &str,
        lock: impl Fn() -> G,
    ) -> Result<Outcome> {
        apisync::sync(dir, &GithubRemote::new(token, repo, branch), lock)
    }

    pub fn sync<G>(
        dir: &Path,
        repo: &str,
        branch: &str,
        token: &str,
        lock: impl Fn() -> G,
    ) -> Result<Outcome> {
        apisync::sync(dir, &GithubRemote::new(token, repo, branch), lock)
    }

    pub fn pending(dir: &Path) -> usize {
        apisync::pending_changes(dir).unwrap_or(0)
    }

    /// Nothing to do: there is no local commit, and a phone can be closed at any moment anyway.
    pub fn save_before_quit(_dir: &Path) {}

    pub fn disconnect(dir: &Path) -> Result<()> {
        apisync::forget(dir);
        Ok(())
    }
}

pub(super) use imp::*;
