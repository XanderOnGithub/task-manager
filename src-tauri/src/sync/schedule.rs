//! Deciding when to sync: the background thread, and the commit on quit.

use std::time::Duration;

use tauri::{AppHandle, Manager};

use task_core::git;

use super::config::for_open_folder;
use super::run::run_sync;
use super::runtime::changed;
use super::token;
use crate::state::AppState;

/// How long after your last change Moss commits and pushes.
pub(super) const QUIET_BEFORE_COMMIT: Duration = Duration::from_secs(60);
/// How often it checks for changes from other computers.
const PULL_EVERY: Duration = Duration::from_secs(5 * 60);
/// A window coming to the front only pulls if the last sync was longer ago.
pub(super) const FOCUS_PULL_AFTER: Duration = Duration::from_secs(30);
/// How often the background thread looks at things.
const TICK: Duration = Duration::from_secs(15);

/// Starts the thread that syncs on its own. Called once at startup.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        // A few seconds after launch, so the window comes up first.
        std::thread::sleep(Duration::from_secs(3));
        let mut first = true;
        loop {
            tick(&app, first);
            first = false;
            std::thread::sleep(TICK);
        }
    });
}

fn tick(app: &AppHandle, first: bool) {
    let Some((config, root)) = for_open_folder(app) else {
        return;
    };
    if config.paused || token::get().is_none() || !git::available() {
        return;
    }
    let state = app.state::<AppState>();

    // How many files differ from the last commit? Shown in Settings. Asking
    // Git starts a process, so only do it when something in the folder has
    // changed since the last look.
    let activity = state.data.lock().ok().and_then(|d| d.last_activity);
    let (seen, cached, syncing, since_attempt) = {
        let inner = state.sync.inner();
        (
            inner.seen_activity,
            inner.pending,
            inner.syncing,
            inner.last_attempt.map(|at| at.elapsed()),
        )
    };
    let changes = if first || activity != seen {
        let counted = git::pending_changes(&root).unwrap_or(0);
        let mut inner = state.sync.inner();
        let moved = inner.pending != counted;
        inner.pending = counted;
        inner.seen_activity = activity;
        drop(inner);
        if moved {
            changed(app);
        }
        counted
    } else {
        cached
    };
    if syncing {
        return;
    }

    // With changes not committed yet, wait until you stop for a minute.
    // Without, just check for news every few minutes (or right away at launch).
    let due = if changes > 0 {
        quiet_for(app) >= QUIET_BEFORE_COMMIT && since_attempt.is_none_or(|t| t >= QUIET_BEFORE_COMMIT)
    } else {
        first || since_attempt.is_none_or(|t| t >= PULL_EVERY)
    };
    if due {
        // `run_sync` is async; this thread isn't, so wait for it here.
        let _ = tauri::async_runtime::block_on(run_sync(app));
    }
}

/// On quit: commit what's pending (quick, local), so nothing is left
/// uncommitted. The push happens at the next launch. If a sync is running it
/// has just committed, and quitting doesn't wait for the network.
pub fn on_exit(app: &AppHandle) {
    let Some((config, root)) = for_open_folder(app) else {
        return;
    };
    if config.paused {
        return;
    }
    let state = app.state::<AppState>();
    let only_one = state.sync.try_lock_exclusive();
    if only_one.is_some() {
        let _folder = state.lock_folder();
        let _ = git::commit_all(&root);
    }
}

/// How long since anything changed in the data folder (by you or from outside).
pub(super) fn quiet_for(app: &AppHandle) -> Duration {
    app.state::<AppState>()
        .data
        .lock()
        .ok()
        .and_then(|d| d.last_activity)
        .map_or(Duration::MAX, |at| at.elapsed())
}

/// Files waiting to be committed, as of the last count.
pub(super) fn pending_changes(app: &AppHandle) -> usize {
    app.state::<AppState>().sync.inner().pending
}
