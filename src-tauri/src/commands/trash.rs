//! Deleting, restoring and the Trash view.

use serde::Serialize;
use tauri::State;

use task_core::ops;
use task_core::trash::{self, TrashEntry};

use crate::state::{read, write, AppState, CmdResult};

/// What `trash_item` returns, so the UI can offer Undo.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Trashed {
    trash_path: String,
    original_path: String,
}

/// Sends an item to the hidden `.trash` folder. Pass the result to
/// `restore_item` to undo.
#[tauri::command]
pub async fn trash_item(state: State<'_, AppState>, id: String) -> CmdResult<Trashed> {
    write(&state, |lib| {
        let original_path = lib.get(&id).map(|i| i.path.clone()).unwrap_or_default();
        let trash_path = ops::trash(lib, &id)?;
        Ok(Trashed {
            trash_path,
            original_path,
        })
    })
}

#[tauri::command]
pub async fn restore_item(
    state: State<'_, AppState>,
    trash_path: String,
    original_path: String,
) -> CmdResult<()> {
    write(&state, |lib| ops::restore(lib, &trash_path, &original_path))
}

/// Everything in the trash, newest first (the Trash view).
#[tauri::command]
pub async fn list_trash(state: State<'_, AppState>) -> CmdResult<Vec<TrashEntry>> {
    read(&state, |lib| trash::list(&lib.root))
}

/// Deletes one thing in the trash for good.
#[tauri::command]
pub async fn delete_forever(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    write(&state, |lib| trash::delete_forever(&lib.root, &path))
}

/// Deletes everything in the trash for good. Returns how many things went.
#[tauri::command]
pub async fn empty_trash(state: State<'_, AppState>) -> CmdResult<usize> {
    write(&state, |lib| trash::empty(&lib.root))
}
