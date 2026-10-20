//! The small settings file (app config folder / settings.json).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::sync;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub data_folder: Option<PathBuf>,
    /// Experimental 120fps drawing on macOS. See high_refresh.rs.
    pub high_refresh: bool,
    /// Git sync for the data folder, once set up. See sync/.
    pub sync: Option<sync::Config>,
}

/// Reads the settings. A missing or unreadable file means the defaults.
pub fn load(path: &Path) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Writes the settings. Atomic, so a crash while saving can't leave a
/// half-written file that would reset the data folder choice.
pub fn save(path: &Path, settings: &Settings) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let text = serde_json::to_string_pretty(settings).expect("settings are plain data");
    task_core::fsutil::write_atomic(path, &text)
}

/// The app used to be called "Task Manager" with the id
/// `com.xanderreyes.taskmanager`. Settings live in a folder named after the id,
/// so after the rename to Moss they'd be "lost" (you'd have to choose your data
/// folder again). On first start as Moss, copy the old settings file over.
/// Your pages and tasks never moved; this is only the settings file.
pub fn bring_over_old(new_file: &Path) {
    if new_file.exists() {
        return;
    }
    // Same parent folder (e.g. ~/Library/Application Support), old app id.
    let Some(old_file) = new_file
        .parent()
        .and_then(Path::parent)
        .map(|base| base.join("com.xanderreyes.taskmanager").join("settings.json"))
    else {
        return;
    };
    if old_file.exists() {
        if let Some(dir) = new_file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Err(e) = fs::copy(&old_file, new_file) {
            eprintln!("Couldn't bring over old settings: {e}");
        }
    }
}
