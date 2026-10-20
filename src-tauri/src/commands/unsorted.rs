//! The Unsorted capture list.

use tauri::State;

use task_core::unsorted::{self, Entry};
use task_core::{fsutil, Kind};

use crate::state::{write, AppState, CmdResult};

#[tauri::command]
pub async fn add_unsorted(state: State<'_, AppState>, text: String) -> CmdResult<Entry> {
    write(&state, |lib| unsorted::add(lib, &text, &fsutil::now_stamp()))
}

/// Turns an Unsorted entry into a task, page or project inside `parent`.
#[tauri::command]
pub async fn file_unsorted(
    state: State<'_, AppState>,
    entry: Entry,
    kind: Kind,
    parent: Option<String>,
) -> CmdResult<String> {
    write(&state, |lib| unsorted::file(lib, &entry, kind, parent.as_deref()))
}

#[tauri::command]
pub async fn remove_unsorted(state: State<'_, AppState>, entry: Entry) -> CmdResult<()> {
    write(&state, |lib| unsorted::remove(lib, &entry))
}

/// Puts an entry back (Undo after filing or removing).
#[tauri::command]
pub async fn restore_unsorted(state: State<'_, AppState>, entry: Entry) -> CmdResult<()> {
    write(&state, |lib| unsorted::restore(lib, &entry))
}
