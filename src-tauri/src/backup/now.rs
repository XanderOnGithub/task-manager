//! "Back up now".

use tauri::{AppHandle, State};

use task_core::backup::{self, Backup, Kind};

use super::location::for_open_folder;
use crate::state::{AppState, CmdResult};

/// Makes a backup you asked for. It is kept until you delete it.
#[tauri::command]
pub async fn backup_now(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Backup> {
    let (root, dir) = for_open_folder(&app)?;
    // Zipping reads every file: no save should land halfway through.
    let _folder = state.lock_folder();
    backup::create(&root, &dir, Kind::Manual).map_err(|e| e.to_string())
}
