//! Watching the data folder for changes made outside the app: your phone adding
//! to Unsorted, Finder renames, a sync tool pulling changes.
//!
//! The operating system reports every tiny file event, and one save can be
//! several events. A "debouncer" waits until things are quiet for a moment, then
//! reports one batch. The app reacts by loading the library again.

use std::path::{Path, PathBuf};
use std::time::Duration;

use notify::RecommendedWatcher;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};

/// How long things must be quiet before a batch is reported.
pub const QUIET_PERIOD: Duration = Duration::from_millis(250);

/// Keeps watching for as long as this value is alive. Drop it to stop.
pub type Watcher = Debouncer<RecommendedWatcher>;

/// Starts watching `root` and everything inside it. `on_change` gets the changed
/// paths (relative to `root`, with `/`) once per quiet period.
///
/// Temporary files from atomic saves (`.name.tmp`) are filtered out, but the
/// final rename still shows up, so the app's own saves trigger a reload too.
/// That's intended: the files are the single source of truth.
pub fn watch(root: &Path, on_change: impl Fn(Vec<String>) + Send + 'static) -> notify::Result<Watcher> {
    let base: PathBuf = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let base_for_events = base.clone();

    let mut debouncer = new_debouncer(QUIET_PERIOD, move |result: DebounceEventResult| {
        let Ok(events) = result else { return };
        let mut paths: Vec<String> = events
            .into_iter()
            .filter_map(|event| {
                let rel = event.path.strip_prefix(&base_for_events).ok()?;
                let rel = rel.to_string_lossy().replace('\\', "/");
                let name = rel.rsplit('/').next().unwrap_or(&rel);
                let is_temp = name.starts_with('.') && name.ends_with(".tmp");
                (!is_temp && !rel.is_empty()).then_some(rel)
            })
            .collect();
        paths.sort();
        paths.dedup();
        if !paths.is_empty() {
            on_change(paths);
        }
    })?;

    debouncer
        .watcher()
        .watch(&base, notify::RecursiveMode::Recursive)?;
    Ok(debouncer)
}
