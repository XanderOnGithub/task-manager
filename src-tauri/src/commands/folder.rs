//! Choosing and opening the data folder.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use task_core::example;

use crate::state::{AppState, CmdResult};
use crate::{folder, settings};

/// The data folder in use, if one is set.
#[tauri::command]
pub fn get_data_folder(state: State<'_, AppState>) -> CmdResult<Option<String>> {
    let data = state.data()?;
    Ok(data.root.as_ref().map(|p| p.display().to_string()))
}

/// Where Moss suggests keeping your files on first launch: a "Moss" folder in
/// Documents. `display` is the same path with your home folder written as "~".
#[derive(Serialize)]
pub struct SuggestedFolder {
    path: String,
    display: String,
}

#[tauri::command]
pub fn suggested_data_folder(app: AppHandle) -> CmdResult<SuggestedFolder> {
    let paths = app.path();
    // A phone keeps it in the app's private storage (no storage permission to ask
    // for). It is where the sync puts the files; "Moss" is just a name here.
    #[cfg(target_os = "android")]
    {
        let path = paths.app_data_dir().map_err(|e| e.to_string())?.join("Moss");
        return Ok(SuggestedFolder {
            path: path.display().to_string(),
            display: "On this phone".to_string(),
        });
    }
    // Some Linux desktops don't name a Documents folder; use ~/Documents there.
    let docs = paths
        .document_dir()
        .or_else(|_| paths.home_dir().map(|home| home.join("Documents")))
        .map_err(|e| e.to_string())?;
    let path = docs.join("Moss");
    let display = match paths
        .home_dir()
        .ok()
        .and_then(|home| path.strip_prefix(home).ok())
    {
        Some(rest) => format!("~/{}", rest.display()),
        None => path.display().to_string(),
    };
    Ok(SuggestedFolder {
        path: path.display().to_string(),
        display,
    })
}

/// First launch: makes the folder if needed, adds the example to it if you
/// asked (only into an empty folder, see core/src/example.rs), then opens it.
/// Returns whether the example was added.
#[tauri::command]
pub fn start_data_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    example: bool,
) -> CmdResult<bool> {
    let root = PathBuf::from(&path);
    fs::create_dir_all(&root).map_err(|e| format!("Couldn't make {path}: {e}"))?;
    let added = if example {
        let _folder = state.lock_folder();
        example::add_example_files(example_files(), &root).map_err(|e| e.to_string())?
    } else {
        false
    };
    set_data_folder(app, state, path)?;
    Ok(added)
}

/// The example (the repo's sample-data/), built into the app itself so every
/// download has it, even the portable Windows .exe. If you change
/// sample-data/, run `cargo clean -p moss` so the next build picks it up.
static EXAMPLE: include_dir::Dir = include_dir::include_dir!("$CARGO_MANIFEST_DIR/../sample-data");

/// Every file in the built-in example, as (path inside it, contents).
fn example_files() -> Vec<(&'static str, &'static [u8])> {
    fn walk(dir: &'static include_dir::Dir<'static>, out: &mut Vec<(&'static str, &'static [u8])>) {
        for file in dir.files() {
            if let Some(path) = file.path().to_str() {
                out.push((path, file.contents()));
            }
        }
        for sub in dir.dirs() {
            walk(sub, out);
        }
    }
    let mut out = Vec::new();
    walk(&EXAMPLE, &mut out);
    out
}

/// Switches to another data folder and remembers it for next time.
#[tauri::command]
pub fn set_data_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {path}"));
    }
    settings::update(&state.settings_file, |saved| {
        saved.data_folder = Some(root.clone())
    })
    .map_err(|e| e.to_string())?;
    let _folder = state.lock_folder();
    let mut data = state.data()?;
    folder::open(&app, &mut data, root);
    Ok(())
}
