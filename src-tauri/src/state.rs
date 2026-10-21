//! What the app keeps in memory between commands, and the two helpers every
//! command uses to read and change the data folder.
//!
//! The loaded `Library` is cached between commands so clicking around never
//! touches the disk. The cache is dropped whenever files change, either because
//! a command wrote something or because the watcher saw an outside change. The
//! UI hears about outside changes through the `data-changed` event and calls
//! `load_library` again.
//!
//! Two locks, always taken in this order (folder first):
//!
//! - `folder`: held while anything changes files in the data folder (a command's
//!   save, the housekeeping in `load_library`, Git sync's commit and merge). So
//!   a save can never land in the middle of a merge.
//! - `data`: the cached library and the folder watcher. Quick to take.

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use task_core::watch::Watcher;
use task_core::Library;

use crate::sync;

/// Name of the event sent to the UI when files change outside the app.
pub const DATA_CHANGED: &str = "data-changed";

/// How long after one of our own writes the watcher treats changes as ours.
/// The watcher reports a batch once things have been quiet for
/// `watch::QUIET_PERIOD` (250ms), so our writes show up about then. The
/// window is generous so a busy disk doesn't slip past it.
///
/// The trade-off: an outside change landing in that same second (say, your
/// phone adding to Unsorted) isn't shown until the next change of any kind.
pub const OWN_WRITE_WINDOW: Duration = Duration::from_millis(1000);

/// Commands return `Result<T, String>`: the string is shown to you as-is.
pub type CmdResult<T> = Result<T, String>;

/// Everything the app keeps in memory between commands.
pub struct AppState {
    /// Where `settings.json` lives (the app's config folder).
    pub settings_file: PathBuf,
    pub data: Mutex<Data>,
    /// Held while files in the data folder change. See the module docs.
    pub folder: Mutex<()>,
    /// Git sync status. See sync/.
    pub sync: sync::Runtime,
}

#[derive(Default)]
pub struct Data {
    /// The data folder you picked.
    pub root: Option<PathBuf>,
    /// Cached library. `None` means "load it next time it's needed".
    pub library: Option<Library>,
    /// Keeps the folder watcher running. Replaced when the folder changes.
    pub watcher: Option<Watcher>,
    /// When a command last wrote files. The watcher sees those writes too, a
    /// moment later; this lets it tell them apart from outside changes.
    pub last_write: Option<Instant>,
    /// When anything in the folder last changed, by us or from outside. Git
    /// sync waits for a quiet minute after this before committing.
    pub last_activity: Option<Instant>,
}

impl AppState {
    pub fn new(settings_file: PathBuf) -> Self {
        AppState {
            settings_file,
            data: Mutex::new(Data::default()),
            folder: Mutex::new(()),
            sync: sync::Runtime::default(),
        }
    }

    /// The cached data. A poisoned lock (a panic elsewhere) is an app error, not a crash.
    pub fn data(&self) -> CmdResult<MutexGuard<'_, Data>> {
        self.data
            .lock()
            .map_err(|_| "The app hit an internal error. Restart it.".to_owned())
    }

    /// Waits for any running Git operation and holds the right to run one, so
    /// something that rewrites the whole folder (a restore) can't overlap a sync.
    pub fn sync_exclusive(&self) -> std::sync::MutexGuard<'_, ()> {
        self.sync.lock_exclusive()
    }

    /// Takes the folder lock: hold it while files in the data folder change.
    pub fn lock_folder(&self) -> MutexGuard<'_, ()> {
        // The guard holds no data, so a lock poisoned by a panic is still safe to use.
        self.folder.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Runs `f` with the library, loading it first if the cache is empty.
pub fn read<T>(state: &AppState, f: impl FnOnce(&Library) -> task_core::Result<T>) -> CmdResult<T> {
    let mut data = state.data()?;
    if data.library.is_none() {
        let root = data.root.clone().ok_or("Choose a data folder")?;
        data.library = Some(Library::load(&root).map_err(|e| e.to_string())?);
    }
    f(data.library.as_ref().expect("just loaded")).map_err(|e| e.to_string())
}

/// Like `read`, but for commands that change files: holds the folder lock,
/// and drops the cache afterwards (even if the command failed halfway) so the
/// next read sees the new state.
pub fn write<T>(state: &AppState, f: impl FnOnce(&Library) -> task_core::Result<T>) -> CmdResult<T> {
    let _folder = state.lock_folder();
    let result = read(state, f);
    let mut data = state.data()?;
    data.library = None;
    data.last_write = Some(Instant::now());
    data.last_activity = data.last_write;
    result
}
