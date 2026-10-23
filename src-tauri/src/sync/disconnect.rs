//! Stopping sync.

use tauri::{AppHandle, Manager};

use super::config;
use super::engine;
use super::runtime::{changed, Inner};
use crate::state::{AppState, CmdResult};

/// Stops syncing this folder. The files and their history stay.
#[tauri::command]
pub async fn sync_disconnect(app: AppHandle) -> CmdResult<()> {
    // Git work waits its turn behind any running sync.
    let work = app.clone();
    tauri::async_runtime::spawn_blocking(move || stop_syncing(&work))
        .await
        .map_err(|e| e.to_string())??;
    changed(&app);
    Ok(())
}

/// Forgets the remote and the saved config. Blocks until a running sync is
/// done, so call it from a blocking thread.
pub(super) fn stop_syncing(app: &AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let _only_one = state.sync.lock_exclusive();
    if let Some((_, root)) = config::for_open_folder(app) {
        let _folder = state.lock_folder();
        engine::disconnect(&root).map_err(|e| e.to_string())?;
    }
    config::save(app, None)?;
    let mut inner = state.sync.inner();
    *inner = Inner {
        username: inner.username.take(),
        ..Inner::default()
    };
    Ok(())
}
