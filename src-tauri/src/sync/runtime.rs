//! What lives in memory while the app runs, and telling the UI about it.

use std::sync::{Mutex, MutexGuard};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};

use crate::state::{AppState, CmdResult};

/// Sent to the UI whenever the sync status changes.
const SYNC_CHANGED: &str = "sync-changed";

#[derive(Default)]
pub struct Runtime {
    pub(super) inner: Mutex<Inner>,
    /// Held for the whole of every Git operation, so two never overlap (a sync
    /// and a disconnect, say, or the commit on quit).
    pub(super) exclusive: Mutex<()>,
}

#[derive(Default)]
pub(super) struct Inner {
    /// The GitHub username, looked up once per sign-in.
    pub username: Option<String>,
    pub syncing: bool,
    /// Milliseconds since 1970 of the last successful sync.
    pub last_synced: Option<u64>,
    /// When Moss last tried (success or not), so a failing sync isn't retried every tick.
    pub last_attempt: Option<Instant>,
    pub error: Option<String>,
    /// Files that differ from the last commit.
    pub pending: usize,
    /// The folder activity `pending` was counted at. `git status` only runs
    /// again when something has changed since, not every few seconds.
    pub seen_activity: Option<Instant>,
}

impl Runtime {
    /// Waits for any running Git operation, then holds the right to run one.
    pub(crate) fn lock_exclusive(&self) -> MutexGuard<'_, ()> {
        self.exclusive.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Takes the right to run a Git operation if nobody has it; None if one is running.
    pub(super) fn try_lock_exclusive(&self) -> Option<MutexGuard<'_, ()>> {
        match self.exclusive.try_lock() {
            Ok(guard) => Some(guard),
            Err(std::sync::TryLockError::Poisoned(e)) => Some(e.into_inner()),
            Err(std::sync::TryLockError::WouldBlock) => None,
        }
    }

    /// The status, for quick changes. Recovers from a poisoned lock: it only holds plain values.
    pub(super) fn inner(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Runs `f` on the status and tells the UI it may have changed.
pub(super) fn update(app: &AppHandle, f: impl FnOnce(&mut Inner)) {
    f(&mut app.state::<AppState>().sync.inner());
    changed(app);
}

pub(super) fn changed(app: &AppHandle) {
    let _ = app.emit(SYNC_CHANGED, ());
}

pub(super) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Runs blocking work (Git, web requests) off the async runtime's threads.
pub(super) async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> task_core::Result<T> + Send + 'static,
) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
