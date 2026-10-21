//! Opening a data folder: tidy it up, then watch it.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, Manager};

use task_core::watch;
use task_core::{example, migrate, ops};

use crate::state::{AppState, Data, DATA_CHANGED, OWN_WRITE_WINDOW};

/// Switches to `root` and starts watching it.
pub fn open(app: &AppHandle, data: &mut Data, root: PathBuf) {
    // Dropping the old watcher stops it.
    data.watcher = None;
    data.library = None;

    // Folders from before pages lived in areas (tasks/ + notes/) move to the
    // current layout (areas/). See core/src/migrate.rs. Runs before the
    // watcher starts, like the trash cleanup below.
    match migrate::migrate_layout(&root) {
        Ok(true) => eprintln!("Moved the data folder to the current layout"),
        Ok(false) => {}
        Err(e) => eprintln!("Couldn't move the data folder to the current layout: {e}"),
    }

    // Things deleted more than 30 days ago leave the hidden .trash folder for
    // good. (Before the watcher starts, so this doesn't trigger a reload.)
    match ops::empty_old_trash_now(&root) {
        Ok(0) => {}
        Ok(n) => eprintln!("Emptied {n} old item(s) from the trash"),
        Err(e) => eprintln!("Couldn't empty old trash: {e}"),
    }

    let handle = app.clone();
    let watched = root.clone();
    match watch::watch(&root, move |paths| {
        if let Ok(mut data) = handle.state::<AppState>().data.lock() {
            data.last_activity = Some(std::time::Instant::now());
            // Our own save, seen a moment later: the UI already reloaded right
            // after the command, so a second reload would only redo that work.
            // Only if every changed file is one of ours: not touched since our
            // write finished. An outside edit in the same second (a phone adding
            // to Unsorted) is newer than that, so it still reloads.
            if let (Some(at), Some(written)) = (data.last_write, data.last_write_time) {
                if at.elapsed() < OWN_WRITE_WINDOW
                    && paths.iter().all(|p| not_changed_since(&watched, p, written))
                {
                    return;
                }
            }
            // Someone else changed the files: forget the cached library.
            data.library = None;
        }
        // Then tell the UI to load again.
        let _ = handle.emit(DATA_CHANGED, paths);
    }) {
        Ok(watcher) => data.watcher = Some(watcher),
        Err(e) => eprintln!("Not watching {}: {e}", root.display()),
    }
    data.root = Some(root);
}

/// In development builds with no folder chosen yet, use a copy of the repo's
/// `sample-data/` so `pnpm tauri dev` shows something right away. The copy
/// lives in the app's data folder, so playing with it never changes the repo.
pub fn dev_sample(app: &AppHandle) -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    // Set MOSS_ONBOARDING=1 to see the first-launch screens in development.
    if std::env::var_os("MOSS_ONBOARDING").is_some() {
        return None;
    }
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample-data");
    let target = app.path().app_data_dir().ok()?.join("sample-data");
    if !target.exists() {
        example::add_example(&source, &target).ok()?;
    }
    Some(target)
}

/// True if `rel` (a path inside `root`) is gone or has not been modified since
/// `written`. Our own saves are the files this holds for.
fn not_changed_since(root: &std::path::Path, rel: &str, written: std::time::SystemTime) -> bool {
    match std::fs::metadata(root.join(rel)).and_then(|m| m.modified()) {
        Ok(modified) => modified <= written,
        Err(_) => true,
    }
}
