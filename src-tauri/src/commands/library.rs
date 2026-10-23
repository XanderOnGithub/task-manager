//! Loading everything the UI draws.

use serde::Serialize;
use tauri::State;

use task_core::unsorted::{self, Entry};
use task_core::{fix, fsutil, IssueView, Item, Library};

use crate::state::{AppState, CmdResult};

/// What the UI gets from `load_library`: everything it needs to draw.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    data_folder: String,
    items: Vec<Item>,
    issues: Vec<IssueView>,
    unsorted: Vec<Entry>,
}

/// Loads everything: items, issues and Unsorted.
///
/// Also does the automatic housekeeping: writes missing ids (see `fix.rs`) and
/// timestamps Unsorted lines added from elsewhere. That writes files, so it
/// holds the folder lock like any other change.
#[tauri::command]
pub async fn load_library(state: State<'_, AppState>) -> CmdResult<Snapshot> {
    let _folder = state.lock_folder();
    let mut data = state.data()?;
    let root = data.root.clone().ok_or("Choose a data folder")?;

    let mut library = Library::load(&root).map_err(|e| format!("Couldn't open {}: {e}", root.display()))?;
    if fix::apply(&library).map_err(|e| e.to_string())? > 0 {
        library = Library::load(&root).map_err(|e| e.to_string())?;
    }
    unsorted::stamp_missing(&library, &fsutil::now_stamp()).map_err(|e| e.to_string())?;
    let entries = unsorted::read(&library).map_err(|e| e.to_string())?;

    let snapshot = Snapshot {
        data_folder: root.display().to_string(),
        items: library.items.clone(),
        issues: library.issues.iter().map(IssueView::from).collect(),
        unsorted: entries,
    };
    data.library = Some(std::sync::Arc::new(library));
    Ok(snapshot)
}
