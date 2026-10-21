//! Making a backup about once a day, without being asked.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use task_core::backup::{self, Kind, AUTOMATIC_EVERY};

use super::location::for_open_folder;
use crate::settings;
use crate::state::AppState;

/// How often to look at whether a backup is due.
const LOOK_EVERY: Duration = Duration::from_secs(60 * 60);

/// Starts the thread. Called once at startup.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        // After the window is up and sync has had its first go.
        std::thread::sleep(Duration::from_secs(30));
        loop {
            if let Err(e) = tick(&app) {
                eprintln!("Backup didn't run: {e}");
            }
            std::thread::sleep(LOOK_EVERY);
        }
    });
}

fn tick(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if !settings::load(&state.settings_file).auto_backup.unwrap_or(true) {
        return Ok(());
    }
    // No data folder open yet: nothing to back up.
    let Ok((root, dir)) = for_open_folder(app) else {
        return Ok(());
    };
    // An empty folder isn't worth a backup (first launch, before anything is written).
    if !root.join("unsorted.md").exists() && !root.join("areas").exists() {
        return Ok(());
    }
    // Due when the newest backup that wasn't made by a restore is over a day old.
    let newest = backup::list(&dir)
        .into_iter()
        .find(|b| b.kind != Kind::BeforeRestore)
        .map_or(0, |b| b.made_at);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64);
    if now.saturating_sub(newest) < AUTOMATIC_EVERY.as_millis() as u64 {
        return Ok(());
    }

    let _folder = state.lock_folder();
    backup::create(&root, &dir, Kind::Automatic).map_err(|e| e.to_string())?;
    backup::prune(&dir).map_err(|e| e.to_string())?;
    Ok(())
}
