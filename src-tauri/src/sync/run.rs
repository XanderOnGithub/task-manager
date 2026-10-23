//! One sync of the open folder.

use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};

use task_core::git;

use super::config::for_open_folder;
use super::engine;
use super::runtime::{blocking, changed, now_ms, update};
use super::schedule::{pending_changes, quiet_for, FOCUS_PULL_AFTER, QUIET_BEFORE_COMMIT};
use super::token;
use crate::state::{AppState, CmdResult, DATA_CHANGED};

/// Sent to the UI after a sync kept both versions of some files (the payload is how many).
const SYNC_CONFLICTS: &str = "sync-conflicts";

/// "Sync now".
#[tauri::command]
pub async fn sync_now(app: AppHandle) -> CmdResult<()> {
    run_sync(&app).await
}

/// The window came back to the front: pull if it's been a while.
#[tauri::command]
pub async fn sync_nudge(app: AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let recent = state
        .sync
        .inner()
        .last_attempt
        .is_some_and(|at| at.elapsed() < FOCUS_PULL_AFTER);
    let idle = quiet_for(&app) >= QUIET_BEFORE_COMMIT || pending_changes(&app) == 0;
    if recent || !idle || for_open_folder(&app).is_none_or(|(c, _)| c.paused) {
        return Ok(());
    }
    run_sync(&app).await
}

/// One sync of the open folder. Never runs two at once.
pub(super) async fn run_sync(app: &AppHandle) -> CmdResult<()> {
    let Some((config, root)) = for_open_folder(app) else {
        return Ok(());
    };
    let token = token::get().ok_or("Sign in to GitHub to sync.")?;
    {
        let state = app.state::<AppState>();
        let mut inner = state.sync.inner();
        if inner.syncing {
            return Ok(());
        }
        inner.syncing = true;
        inner.last_attempt = Some(Instant::now());
    }
    changed(app);

    let (work, branch, repo) = (app.clone(), config.branch, config.repo);
    let result = blocking(move || {
        let state = work.state::<AppState>();
        // Connecting, signing out or quitting has the folder right now: skip this round.
        let Some(_only_one) = state.sync.try_lock_exclusive() else {
            return Ok(None);
        };
        engine::sync(&root, &repo, &branch, &token, || state.lock_folder()).map(Some)
    })
    .await;
    update(app, |inner| inner.syncing = false);
    match result {
        Ok(Some(outcome)) => {
            finished(app, &outcome);
            Ok(())
        }
        Ok(None) => Ok(()),
        Err(e) => {
            update(app, |inner| inner.error = Some(e.clone()));
            Err(e)
        }
    }
}

/// A sync went through: remember when, and show pulled files in the app.
pub(super) fn finished(app: &AppHandle, outcome: &git::Outcome) {
    let state = app.state::<AppState>();
    {
        let mut inner = state.sync.inner();
        inner.last_synced = Some(now_ms());
        inner.error = None;
        inner.pending = 0;
        inner.seen_activity = None; // count again at the next tick
    }
    if outcome.pulled || !outcome.conflicts.is_empty() {
        // Pulled files are outside changes. The watcher would report them too,
        // but may skip them as our own writes, so say it directly. The paths
        // let an open page know its own text changed.
        if let Ok(mut data) = state.data() {
            data.library = None;
        }
        let _ = app.emit(DATA_CHANGED, &outcome.changed);
    }
    if !outcome.conflicts.is_empty() {
        // Both versions were kept. Say so, so the copies are found (they are also
        // listed under Issues).
        let _ = app.emit(SYNC_CONFLICTS, outcome.conflicts.len());
    }
    changed(app);
}
