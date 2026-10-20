//! Pausing and resuming.

use tauri::AppHandle;

use super::config::{self, for_open_folder};
use super::runtime::changed;
use crate::state::CmdResult;

#[tauri::command]
pub async fn sync_set_paused(app: AppHandle, paused: bool) -> CmdResult<()> {
    if let Some((mut current, _)) = for_open_folder(&app) {
        current.paused = paused;
        config::save(&app, Some(current))?;
    }
    changed(&app);
    Ok(())
}
