//! Git sync for the desktop app: sign in to GitHub, pick a repository,
//! and keep the data folder in it. The Git and GitHub work itself lives in
//! `task-core` (`git/`, `github.rs`); these files are the glue: where the token
//! is kept, when to sync, and what the UI is told. One file per action:
//!
//! - `config`      what's saved in settings.json about sync
//! - `engine`      the `git` program on computers, GitHub's web API on Android
//! - `runtime`     what's in memory while the app runs, and the status events
//! - `token`       the GitHub token (the system keychain; a private file on Android)
//! - `info`        the status Settings shows (`sync_state`)
//! - `login`       sign in with GitHub (`github_login_start`, `github_login_poll`)
//! - `logout`      sign out (`github_logout`)
//! - `repos`       list the repositories Moss may use, and the page to change that (`github_repos`, `github_install_url`)
//! - `connect`     start syncing a folder with a repository (`sync_connect`)
//! - `disconnect`  stop syncing (`sync_disconnect`)
//! - `pause`       pause and resume (`sync_set_paused`)
//! - `run`         one sync (`sync_now`, `sync_nudge`)
//! - `schedule`    the background thread that decides when to sync, and the commit on quit
//!
//! When it syncs:
//! - about a minute after the last change (one commit for everything since the last)
//! - when the app opens, when its window comes back to the front, and every few minutes
//! - when you press "Sync now"
//! - on quit it only commits (fast); the push happens at the next launch
//!
//! The commands are registered by path (`sync::info::sync_state`, ...) because
//! Tauri's command macro can't be re-exported.
//!
//! Two syncs never run at once: every Git operation holds `Runtime::exclusive`.
//! While Git changes the data folder it also holds the folder lock
//! (`AppState::lock_folder`), so the app's own saves wait their turn.

mod config;
pub(crate) mod connect;
pub(crate) mod disconnect;
mod engine;
pub(crate) mod info;
pub(crate) mod login;
pub(crate) mod logout;
pub(crate) mod pause;
pub(crate) mod repos;
pub(crate) mod run;
mod runtime;
mod schedule;
mod token;

pub use config::Config;
pub use runtime::Runtime;
pub use schedule::{on_exit, start};
