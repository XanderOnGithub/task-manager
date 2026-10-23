//! The small settings file (app config folder / settings.json).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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
    /// Back up about once a day. `None` (never chosen) means on. See backup/.
    pub auto_backup: Option<bool>,
}

/// Reads the settings. A missing file means the defaults.
///
/// A file that is there but can't be understood also gives the defaults, but
/// first it is copied to `settings.json.invalid`: the next save would overwrite
/// it, and it holds the data folder choice and the sync setup.
pub fn load(path: &Path) -> Settings {
    let Ok(text) = fs::read_to_string(path) else {
        return Settings::default();
    };
    serde_json::from_str(&text).unwrap_or_else(|e| {
        eprintln!("Couldn't read the settings ({e}); starting from the defaults");
        let kept = path.with_extension("json.invalid");
        if !kept.exists() {
            let _ = fs::write(kept, &text);
        }
        Settings::default()
    })
}

/// Only one settings change at a time. Several parts of the app change their
/// own setting (the data folder, sync, backups, 120fps), each by reading the
/// file, changing one field and writing it back; two at once could otherwise
/// write back each other's old value.
static CHANGING: Mutex<()> = Mutex::new(());

/// Reads the settings, lets `change` edit them, and saves them. Use this
/// instead of `load` + `save` whenever you change a setting.
pub fn update(path: &Path, change: impl FnOnce(&mut Settings)) -> std::io::Result<()> {
    // Nothing is left half-done if another thread panicked, so carry on.
    let _only_one = CHANGING.lock().unwrap_or_else(|e| e.into_inner());
    let mut settings = load(path);
    change(&mut settings);
    save(path, &settings)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_settings_file_that_cant_be_read_is_kept_not_lost() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"dataFolder": 12}"#).unwrap();

        assert!(load(&path).data_folder.is_none());
        assert_eq!(
            fs::read_to_string(dir.path().join("settings.json.invalid")).unwrap(),
            r#"{"dataFolder": 12}"#
        );
    }

    #[test]
    fn changes_from_different_places_do_not_undo_each_other() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let workers: Vec<_> = (0..2)
            .map(|which| {
                let path = path.clone();
                std::thread::spawn(move || {
                    for _ in 0..50 {
                        update(&path, |s| {
                            if which == 0 {
                                s.high_refresh = !s.high_refresh;
                            } else {
                                s.auto_backup = Some(s.auto_backup != Some(true));
                            }
                        })
                        .unwrap();
                    }
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        // Each field was flipped 50 times, an even number: back where it began.
        // A lost update would leave one of them flipped the wrong way.
        let end = load(&path);
        assert!(!end.high_refresh);
        assert_eq!(end.auto_backup, Some(false));
    }
}
