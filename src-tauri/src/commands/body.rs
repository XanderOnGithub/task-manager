//! An item's text, and searching it.

use tauri::State;

use task_core::{ops, search};

use crate::state::{read, write, AppState, CmdResult};

#[tauri::command]
pub async fn read_body(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    read(&state, |lib| ops::read_body(lib, &id))
}

#[tauri::command]
pub async fn write_body(state: State<'_, AppState>, id: String, body: String) -> CmdResult<()> {
    write(&state, |lib| ops::write_body(lib, &id, &body))
}

/// Finds items whose text contains `query`. Titles are matched in the UI.
#[tauri::command]
pub async fn search_text(state: State<'_, AppState>, query: String) -> CmdResult<Vec<search::Hit>> {
    read(&state, |lib| Ok(search::search_text(lib, &query, 20)))
}
