//! Git sync: keeps the data folder in a Git repository.
//!
//! This shells out to the `git` installed on the computer instead of linking a
//! Git library. That keeps the code small, and it means Git's own behavior
//! (merging, the `union` merge driver) is what runs.
//!
//! One file per action:
//!
//! - `command`    running `git` safely (token handling, no console window, messages)
//! - `repo`       small questions about the repository (is it one, who am I, how far apart)
//! - `connect`    turn the folder into a repository that syncs with a remote
//! - `disconnect` stop syncing (files and history stay)
//! - `status`     how many files differ from the last commit
//! - `commit`     commit everything that changed
//! - `sync`       commit, fetch, merge, push
//! - `merge`      bring the other computers' changes in
//! - `conflict`   what happens when both sides changed the same file
//!
//! Signing in works through a token: when there is one, it is handed to Git for
//! that single command through environment variables (never written to a
//! config file, never put in the remote URL, never in the command line where
//! `ps` could show it).
//!
//! What a sync does, in order:
//! 1. commit everything that changed ("Moss: 3 changes")
//! 2. fetch what the other computers pushed
//! 3. merge it in. A real conflict never loses text: the local version stays,
//!    and the other version is saved next to it as "Title (from other computer).md"
//! 4. push
//!
//! The app also writes files while this runs. So the steps that change the
//! working folder (commit, merge) run while holding a lock the caller passes in
//! (`lock`), and the slow network steps (fetch, push) run without it.

mod command;
mod commit;
mod conflict;
mod connect;
mod disconnect;
mod merge;
mod repo;
mod status;
mod sync;

pub use command::available;
pub use commit::commit_all;
pub use connect::connect;
pub use disconnect::disconnect;
pub use repo::is_repo;
pub use status::pending_changes;
pub use sync::sync;

/// What one sync did.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    /// Changes from other computers came in.
    pub pulled: bool,
    /// Local changes went out.
    pub pushed: bool,
    /// Files that changed on both computers. The other version was kept as
    /// "(from other computer)" next to the file, or added to the end of a
    /// folder's `_index.md`. These are the paths of those copies or files.
    pub conflicts: Vec<String>,
    /// Every file the merge changed here (paths inside the data folder), so
    /// the app can refresh whatever is open.
    pub changed: Vec<String>,
}
