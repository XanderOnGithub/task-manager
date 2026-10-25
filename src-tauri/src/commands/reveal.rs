//! Showing an item in the file manager, and where it is.

use tauri::State;

use task_core::fsutil::check_inside;

use crate::state::{read, AppState, CmdResult};

/// Shows the item's file or folder in Finder.
#[tauri::command]
pub async fn reveal_in_finder(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let path = item_path(state, id).await?;
    show_in_file_manager(path)
}

/// The item's full path on disk, for "Copy path".
#[tauri::command]
pub async fn item_path(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    read(&state, |lib| {
        let item = lib
            .get(&id)
            .ok_or_else(|| task_core::Error::NotFound(id.clone()))?;
        Ok(lib.abs(&item.path).display().to_string())
    })
}

/// Shows a file or folder by its path inside the data folder (the Issues view
/// knows paths, not ids: the item may not have loaded at all).
#[tauri::command]
pub async fn reveal_path(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let full = read(&state, |lib| {
        check_inside(&path)?;
        let full = lib.abs(&path);
        if full.exists() {
            Ok(full)
        } else {
            Err(task_core::Error::NotFound(path.clone()))
        }
    })?;
    show_in_file_manager(full)
}

/// Shows a file or folder in Finder, Explorer or the file manager. A phone has none.
#[cfg(desktop)]
fn show_in_file_manager(path: impl AsRef<std::path::Path>) -> CmdResult<()> {
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}

#[cfg(mobile)]
fn show_in_file_manager(_path: impl AsRef<std::path::Path>) -> CmdResult<()> {
    Err("Files can't be shown in a file manager on this device.".into())
}
