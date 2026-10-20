//! Putting a backup back.

use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager, State};

use task_core::backup::{self, Backup};

use super::location::for_open_folder;
use crate::state::{AppState, CmdResult, DATA_CHANGED};

/// Replaces the data folder's files with a backup (one from the list, or a zip
/// you picked). What was there is saved first as a "before restore" backup,
/// which is returned.
#[tauri::command]
pub async fn backup_restore(app: AppHandle, state: State<'_, AppState>, path: String) -> CmdResult<Backup> {
    let (root, dir) = for_open_folder(&app)?;
    let zip = PathBuf::from(path);
    if !zip.is_file() {
        return Err("That backup file isn't there any more.".into());
    }

    // No sync may touch the files meanwhile, and no save either.
    let work = app.clone();
    let safety = tauri::async_runtime::spawn_blocking(move || {
        let state = work.state::<AppState>();
        let _only_one = state.sync_exclusive();
        let _folder = state.lock_folder();
        backup::restore(&zip, &root, &dir).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Everything on disk changed: forget what we had and tell the UI to load again.
    {
        let mut data = state.data()?;
        data.library = None;
        data.last_activity = Some(std::time::Instant::now());
    }
    let _ = app.emit(DATA_CHANGED, Vec::<String>::new());
    Ok(safety)
}
