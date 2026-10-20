//! What's saved in settings.json about sync.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::settings;
use crate::state::AppState;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// The data folder this belongs to. Sync stops if you switch to another one.
    pub folder: PathBuf,
    /// "owner/name"
    pub repo: String,
    pub branch: String,
    pub paused: bool,
}

/// The config for the folder that's open, with that folder, if it syncs.
pub(super) fn for_open_folder(app: &AppHandle) -> Option<(Config, PathBuf)> {
    let state = app.state::<AppState>();
    let config = settings::load(&state.settings_file).sync?;
    let root = state.data.lock().ok()?.root.clone()?;
    (config.folder == root).then_some((config, root))
}

/// Saves `config` (or removes sync with `None`) without touching other settings.
pub(super) fn save(app: &AppHandle, config: Option<Config>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut saved = settings::load(&state.settings_file);
    saved.sync = config;
    settings::save(&state.settings_file, &saved).map_err(|e| e.to_string())
}
