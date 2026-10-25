//! The backups, and the switch for making them automatically.

use serde::Serialize;
use tauri::{AppHandle, State};

use task_core::backup::{self, Backup};

use super::location::for_open_folder;
use crate::settings;
use crate::state::{AppState, CmdResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backups {
    /// Back up about once a day (on unless switched off).
    automatic: bool,
    /// Newest first.
    items: Vec<Backup>,
}

#[tauri::command]
pub async fn backups_get(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Backups> {
    let (_, dir) = for_open_folder(&app)?;
    Ok(Backups {
        automatic: settings::load(&state.settings_file).auto_backup.unwrap_or(true),
        items: backup::list(&dir),
    })
}

#[tauri::command]
pub async fn backups_set_automatic(state: State<'_, AppState>, automatic: bool) -> CmdResult<()> {
    settings::update(&state.settings_file, |saved| saved.auto_backup = Some(automatic))
        .map_err(|e| e.to_string())
}
