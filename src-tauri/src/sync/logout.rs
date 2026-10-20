//! Signing out.

use tauri::AppHandle;

use super::runtime::update;
use super::{disconnect, token};
use crate::state::CmdResult;

/// Signs out: forgets the token and stops syncing this folder.
#[tauri::command]
pub async fn github_logout(app: AppHandle) -> CmdResult<()> {
    let work = app.clone();
    tauri::async_runtime::spawn_blocking(move || disconnect::stop_syncing(&work))
        .await
        .map_err(|e| e.to_string())??;
    token::clear();
    update(&app, |inner| inner.username = None);
    Ok(())
}
