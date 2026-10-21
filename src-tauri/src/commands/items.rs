//! Creating, renaming, moving and changing items.

use tauri::State;

use task_core::{fsutil, ops, Kind};

use crate::state::{write, AppState, CmdResult};

/// Creates an area, project, milestone, task or page. Returns the new id.
#[tauri::command]
pub async fn create_item(
    state: State<'_, AppState>,
    kind: Kind,
    parent: Option<String>,
    title: String,
) -> CmdResult<String> {
    write(&state, |lib| {
        ops::create(lib, kind, parent.as_deref(), &title, "")
    })
}

#[tauri::command]
pub async fn rename_item(state: State<'_, AppState>, id: String, title: String) -> CmdResult<()> {
    write(&state, |lib| ops::rename(lib, &id, &title))
}

/// Moves an item into `parent` (or reorders it there), placing it before the
/// sibling `before`, or at the end.
#[tauri::command]
pub async fn move_item(
    state: State<'_, AppState>,
    id: String,
    parent: Option<String>,
    before: Option<String>,
) -> CmdResult<()> {
    write(&state, |lib| {
        ops::move_item(lib, &id, parent.as_deref(), before.as_deref())
    })
}

/// Sets `status`, `due` or `color`. A `null` value clears it.
#[tauri::command]
pub async fn set_field(
    state: State<'_, AppState>,
    id: String,
    field: String,
    value: Option<String>,
) -> CmdResult<()> {
    write(&state, |lib| ops::set_field(lib, &id, &field, value.as_deref()))
}

/// Changes a task's status. For a repeating task that is finished, the task
/// goes back to Todo with its next due date, which is returned.
#[tauri::command]
pub async fn set_status(state: State<'_, AppState>, id: String, status: String) -> CmdResult<Option<String>> {
    write(&state, |lib| {
        ops::set_status(lib, &id, &status, fsutil::today_date())
    })
}
