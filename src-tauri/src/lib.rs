//! The desktop app: the bridge between the UI and `task-core`.
//!
//! Each `#[tauri::command]` function below can be called from TypeScript with
//! `invoke("command_name", { ...args })` (see `src/lib/api.ts`). The commands
//! are thin: they find the data folder, call into `task-core`, and turn errors
//! into plain strings the UI can show.
//!
//! The loaded `Library` is cached between commands so clicking around never
//! touches the disk. The cache is dropped whenever files change, either because
//! a command wrote something or because the watcher saw an outside change. The
//! UI hears about outside changes through the `data-changed` event and calls
//! `load_library` again.

mod high_refresh;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use task_core::trash::{self, TrashEntry};
use task_core::unsorted::{self, Entry};
use task_core::watch::{self, Watcher};
use task_core::{example, fix, fsutil, migrate, ops, search, Issue, Item, Kind, Library};

/// Name of the event sent to the UI when files change outside the app.
const DATA_CHANGED: &str = "data-changed";

/// Everything the app keeps in memory between commands.
struct AppState {
    /// Where `settings.json` lives (the app's config folder).
    settings_file: PathBuf,
    data: Mutex<Data>,
}

#[derive(Default)]
struct Data {
    /// The data folder you picked.
    root: Option<PathBuf>,
    /// Cached library. `None` means "load it next time it's needed".
    library: Option<Library>,
    /// Keeps the folder watcher running. Replaced when the folder changes.
    watcher: Option<Watcher>,
    /// When a command last wrote files. The watcher sees those writes too, a
    /// moment later; this lets it tell them apart from outside changes.
    last_write: Option<Instant>,
}

/// How long after one of our own writes the watcher treats changes as ours.
/// The watcher reports a batch once things have been quiet for
/// `watch::QUIET_PERIOD` (250ms), so our writes show up about then. The
/// window is generous so a busy disk doesn't slip past it.
///
/// The trade-off: an outside change landing in that same second (say, your
/// phone adding to Unsorted) isn't shown until the next change of any kind.
const OWN_WRITE_WINDOW: Duration = Duration::from_millis(1000);

/// The small settings file (app config folder / settings.json).
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    data_folder: Option<PathBuf>,
    /// Experimental 120fps drawing on macOS. See high_refresh.rs.
    high_refresh: bool,
}

/// What the Settings screen shows for the 120fps switch.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HighRefresh {
    supported: bool,
    enabled: bool,
}

/// What the UI gets from `load_library`: everything it needs to draw.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    data_folder: String,
    items: Vec<Item>,
    issues: Vec<Issue>,
    unsorted: Vec<Entry>,
}

/// What `trash_item` returns, so the UI can offer Undo.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Trashed {
    trash_path: String,
    original_path: String,
}

/// Commands return `Result<T, String>`: the string is shown to you as-is.
type CmdResult<T> = Result<T, String>;

// ---------------------------------------------------------------------------
// Data folder
// ---------------------------------------------------------------------------

/// The data folder in use, if one is set.
#[tauri::command]
fn get_data_folder(state: State<'_, AppState>) -> CmdResult<Option<String>> {
    let data = lock(&state)?;
    Ok(data.root.as_ref().map(|p| p.display().to_string()))
}

/// Where Moss suggests keeping your files on first launch: a "Moss" folder in
/// Documents. `display` is the same path with your home folder written as "~".
#[derive(Serialize)]
struct SuggestedFolder {
    path: String,
    display: String,
}

#[tauri::command]
fn suggested_data_folder(app: AppHandle) -> CmdResult<SuggestedFolder> {
    let paths = app.path();
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
fn start_data_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    example: bool,
) -> CmdResult<bool> {
    let root = PathBuf::from(&path);
    fs::create_dir_all(&root).map_err(|e| format!("Couldn't make {path}: {e}"))?;
    let added = if example {
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
fn set_data_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {path}"));
    }
    let mut settings = load_settings(&state.settings_file);
    settings.data_folder = Some(root.clone());
    save_settings(&state.settings_file, &settings).map_err(|e| e.to_string())?;
    let mut data = lock(&state)?;
    open_folder(&app, &mut data, root);
    Ok(())
}

/// Loads everything: items, issues and Unsorted.
///
/// Also does the automatic housekeeping: writes missing ids (see `fix.rs`) and
/// timestamps Unsorted lines added from elsewhere.
#[tauri::command]
async fn load_library(state: State<'_, AppState>) -> CmdResult<Snapshot> {
    let mut data = lock(&state)?;
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
        issues: library.issues.clone(),
        unsorted: entries,
    };
    data.library = Some(library);
    Ok(snapshot)
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/// Creates an area, project, milestone, task or page. Returns the new id.
#[tauri::command]
async fn create_item(
    state: State<'_, AppState>,
    kind: Kind,
    parent: Option<String>,
    title: String,
) -> CmdResult<String> {
    write(&state, |lib| {
        ops::create(lib, kind, parent.as_deref(), &title, "")
    })
}

#[tauri::command]
async fn rename_item(state: State<'_, AppState>, id: String, title: String) -> CmdResult<()> {
    write(&state, |lib| ops::rename(lib, &id, &title))
}

/// Moves an item into `parent` (or reorders it there), placing it before the
/// sibling `before`, or at the end.
#[tauri::command]
async fn move_item(
    state: State<'_, AppState>,
    id: String,
    parent: Option<String>,
    before: Option<String>,
) -> CmdResult<()> {
    write(&state, |lib| {
        ops::move_item(lib, &id, parent.as_deref(), before.as_deref())
    })
}

/// Sets `status`, `due` or `color`. A `null` value clears it.
#[tauri::command]
async fn set_field(
    state: State<'_, AppState>,
    id: String,
    field: String,
    value: Option<String>,
) -> CmdResult<()> {
    write(&state, |lib| ops::set_field(lib, &id, &field, value.as_deref()))
}

#[tauri::command]
async fn read_body(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    read(&state, |lib| ops::read_body(lib, &id))
}

/// Finds items whose text contains `query`. Titles are matched in the UI.
#[tauri::command]
async fn search_text(state: State<'_, AppState>, query: String) -> CmdResult<Vec<search::Hit>> {
    read(&state, |lib| Ok(search::search_text(lib, &query, 20)))
}

#[tauri::command]
async fn write_body(state: State<'_, AppState>, id: String, body: String) -> CmdResult<()> {
    write(&state, |lib| ops::write_body(lib, &id, &body))
}

/// Sends an item to the hidden `.trash` folder. Pass the result to
/// `restore_item` to undo.
#[tauri::command]
async fn trash_item(state: State<'_, AppState>, id: String) -> CmdResult<Trashed> {
    write(&state, |lib| {
        let original_path = lib.get(&id).map(|i| i.path.clone()).unwrap_or_default();
        let trash_path = ops::trash(lib, &id)?;
        Ok(Trashed {
            trash_path,
            original_path,
        })
    })
}

#[tauri::command]
async fn restore_item(
    state: State<'_, AppState>,
    trash_path: String,
    original_path: String,
) -> CmdResult<()> {
    write(&state, |lib| ops::restore(lib, &trash_path, &original_path))
}

/// Everything in the trash, newest first (the Trash view).
#[tauri::command]
async fn list_trash(state: State<'_, AppState>) -> CmdResult<Vec<TrashEntry>> {
    read(&state, |lib| trash::list(&lib.root))
}

/// Deletes one thing in the trash for good.
#[tauri::command]
async fn delete_forever(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    write(&state, |lib| trash::delete_forever(&lib.root, &path))
}

/// Deletes everything in the trash for good. Returns how many things went.
#[tauri::command]
async fn empty_trash(state: State<'_, AppState>) -> CmdResult<usize> {
    write(&state, |lib| trash::empty(&lib.root))
}

/// Shows the item's file or folder in Finder.
#[tauri::command]
async fn reveal_in_finder(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let path = item_path(state, id).await?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}

/// The item's full path on disk, for "Copy path".
#[tauri::command]
async fn item_path(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    read(&state, |lib| {
        let item = lib
            .get(&id)
            .ok_or_else(|| task_core::Error::NotFound(id.clone()))?;
        Ok(lib.abs(&item.path).display().to_string())
    })
}

// ---------------------------------------------------------------------------
// Unsorted
// ---------------------------------------------------------------------------

#[tauri::command]
async fn add_unsorted(state: State<'_, AppState>, text: String) -> CmdResult<Entry> {
    write(&state, |lib| unsorted::add(lib, &text, &fsutil::now_stamp()))
}

/// Turns an Unsorted entry into a task, page or project inside `parent`.
#[tauri::command]
async fn file_unsorted(
    state: State<'_, AppState>,
    entry: Entry,
    kind: Kind,
    parent: Option<String>,
) -> CmdResult<String> {
    write(&state, |lib| unsorted::file(lib, &entry, kind, parent.as_deref()))
}

#[tauri::command]
async fn remove_unsorted(state: State<'_, AppState>, entry: Entry) -> CmdResult<()> {
    write(&state, |lib| unsorted::remove(lib, &entry))
}

/// Puts an entry back (Undo after filing or removing).
#[tauri::command]
async fn restore_unsorted(state: State<'_, AppState>, entry: Entry) -> CmdResult<()> {
    write(&state, |lib| unsorted::restore(lib, &entry))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn lock<'a>(state: &'a State<'_, AppState>) -> CmdResult<MutexGuard<'a, Data>> {
    state
        .data
        .lock()
        .map_err(|_| "The app hit an internal error. Restart it.".to_owned())
}

/// Runs `f` with the library, loading it first if the cache is empty.
fn read<T>(state: &State<'_, AppState>, f: impl FnOnce(&Library) -> task_core::Result<T>) -> CmdResult<T> {
    let mut data = lock(state)?;
    if data.library.is_none() {
        let root = data.root.clone().ok_or("Choose a data folder")?;
        data.library = Some(Library::load(&root).map_err(|e| e.to_string())?);
    }
    f(data.library.as_ref().expect("just loaded")).map_err(|e| e.to_string())
}

/// Like `read`, but for commands that change files: drops the cache afterwards
/// (even if the command failed halfway) so the next read sees the new state.
fn write<T>(state: &State<'_, AppState>, f: impl FnOnce(&Library) -> task_core::Result<T>) -> CmdResult<T> {
    let result = read(state, f);
    let mut data = lock(state)?;
    data.library = None;
    data.last_write = Some(Instant::now());
    result
}

/// Switches to `root` and starts watching it.
fn open_folder(app: &AppHandle, data: &mut Data, root: PathBuf) {
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
    match watch::watch(&root, move |paths| {
        if let Ok(mut data) = handle.state::<AppState>().data.lock() {
            // Our own save, seen a moment later: the UI already reloaded right
            // after the command, so a second reload would only redo that work.
            if data.last_write.is_some_and(|at| at.elapsed() < OWN_WRITE_WINDOW) {
                return;
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

fn load_settings(path: &Path) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// The app used to be called "Task Manager" with the id
/// `com.xanderreyes.taskmanager`. Settings live in a folder named after the id,
/// so after the rename to Moss they'd be "lost" (you'd have to choose your data
/// folder again). On first start as Moss, copy the old settings file over.
/// Your pages and tasks never moved; this is only the settings file.
fn bring_over_old_settings(new_file: &Path) {
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

fn save_settings(path: &Path, settings: &Settings) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(
        path,
        serde_json::to_string_pretty(settings).expect("settings are plain data"),
    )
}

/// In development builds with no folder chosen yet, use a copy of the repo's
/// `sample-data/` so `npm run tauri dev` shows something right away. The copy
/// lives in the app's data folder, so playing with it never changes the repo.
fn dev_sample_folder(app: &AppHandle) -> Option<PathBuf> {
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

// ---------------------------------------------------------------------------
// Experimental 120fps
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_high_refresh(state: State<'_, AppState>) -> HighRefresh {
    HighRefresh {
        supported: high_refresh::SUPPORTED,
        enabled: load_settings(&state.settings_file).high_refresh,
    }
}

/// Saves the switch and applies it. The UI reloads the page afterwards so the
/// new frame rate takes effect.
#[tauri::command]
async fn set_high_refresh(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    enabled: bool,
) -> CmdResult<()> {
    let mut settings = load_settings(&state.settings_file);
    settings.high_refresh = enabled;
    save_settings(&state.settings_file, &settings).map_err(|e| e.to_string())?;

    // Commands run off the main thread, so it's fine to wait for the result here.
    let (tx, rx) = std::sync::mpsc::channel();
    high_refresh::apply(&window, enabled, move |result| {
        let _ = tx.send(result);
    });
    rx.recv_timeout(std::time::Duration::from_secs(3))
        .map_err(|_| "The web view didn't respond".to_owned())?
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // In-app updates: checks the latest GitHub release (see "updater" in
        // tauri.conf.json), and restarts into the new version.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Keep the plugin available for manual control through Settings.
        .plugin(tauri_plugin_macos_fps::init())
        .setup(|app| {
            let settings_file = app.path().app_config_dir()?.join("settings.json");
            bring_over_old_settings(&settings_file);
            let settings = load_settings(&settings_file);
            app.manage(AppState {
                settings_file,
                data: Mutex::new(Data::default()),
            });

            // Turn on 120fps before you start using the window, then reload so
            // the page picks it up. Only when you've switched it on.
            if settings.high_refresh && high_refresh::SUPPORTED {
                if let Some(window) = app.get_webview_window("main") {
                    let reload_target = window.clone();
                    high_refresh::apply(&window, true, move |result| match result {
                        Ok(()) => {
                            let _ = reload_target.reload();
                        }
                        Err(e) => eprintln!("120fps not applied: {e}"),
                    });
                }
            }

            let handle = app.handle().clone();
            let root = settings
                .data_folder
                .filter(|p| p.is_dir())
                .or_else(|| dev_sample_folder(&handle));
            if let Some(root) = root {
                let state = handle.state::<AppState>();
                let mut data = state.data.lock().expect("not poisoned at startup");
                open_folder(&handle, &mut data, root);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_data_folder,
            set_data_folder,
            suggested_data_folder,
            start_data_folder,
            load_library,
            create_item,
            rename_item,
            move_item,
            set_field,
            read_body,
            search_text,
            write_body,
            trash_item,
            restore_item,
            list_trash,
            delete_forever,
            empty_trash,
            reveal_in_finder,
            item_path,
            add_unsorted,
            file_unsorted,
            remove_unsorted,
            restore_unsorted,
            get_high_refresh,
            set_high_refresh,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
