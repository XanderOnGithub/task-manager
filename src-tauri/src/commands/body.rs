//! An item's text, and searching it.

use tauri::State;

use task_core::{ops, search};

use crate::state::{read, snapshot, write, AppState, CmdResult};

#[tauri::command]
pub async fn read_body(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    read(&state, |lib| ops::read_body(lib, &id))
}

#[tauri::command]
pub async fn write_body(state: State<'_, AppState>, id: String, body: String) -> CmdResult<()> {
    write(&state, |lib| ops::write_body(lib, &id, &body))
}

/// Finds items whose text contains `query`. Titles are matched in the UI.
///
/// This opens every file until it has enough matches, so it works on a
/// snapshot and runs off the async threads: typing in the search box must not
/// make saves, the file watcher or other commands wait.
#[tauri::command]
pub async fn search_text(state: State<'_, AppState>, query: String) -> CmdResult<Vec<search::Hit>> {
    let library = snapshot(&state)?;
    tauri::async_runtime::spawn_blocking(move || search::search_text(&library, &query, 20))
        .await
        .map_err(|e| e.to_string())
}
