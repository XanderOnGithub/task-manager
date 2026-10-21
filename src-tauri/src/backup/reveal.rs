//! Showing the backups folder in the file manager.

use std::fs;

use tauri::AppHandle;

use super::location::for_open_folder;
use crate::state::CmdResult;

#[tauri::command]
pub async fn backups_reveal(app: AppHandle) -> CmdResult<()> {
    let (_, dir) = for_open_folder(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir, None::<&str>).map_err(|e| e.to_string())
}
