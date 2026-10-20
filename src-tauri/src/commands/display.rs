//! The experimental 120fps switch (macOS only; see ../high_refresh.rs).

use serde::Serialize;
use tauri::State;

use crate::state::{AppState, CmdResult};
use crate::{high_refresh, settings};

/// What the Settings screen shows for the 120fps switch.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HighRefresh {
    supported: bool,
    enabled: bool,
}

#[tauri::command]
pub fn get_high_refresh(state: State<'_, AppState>) -> HighRefresh {
    HighRefresh {
        supported: high_refresh::SUPPORTED,
        enabled: settings::load(&state.settings_file).high_refresh,
    }
}

/// Saves the switch and applies it. The UI reloads the page afterwards so the
/// new frame rate takes effect.
#[tauri::command]
pub async fn set_high_refresh(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    enabled: bool,
) -> CmdResult<()> {
    let mut saved = settings::load(&state.settings_file);
    saved.high_refresh = enabled;
    settings::save(&state.settings_file, &saved).map_err(|e| e.to_string())?;

    // Commands run off the main thread, so it's fine to wait for the result here.
    let (tx, rx) = std::sync::mpsc::channel();
    high_refresh::apply(&window, enabled, move |result| {
        let _ = tx.send(result);
    });
    rx.recv_timeout(std::time::Duration::from_secs(3))
        .map_err(|_| "The web view didn't respond".to_owned())?
}
