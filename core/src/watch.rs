//! Watching the data folder for changes made outside the app: your phone adding
//! to Unsorted, Finder renames, a sync tool pulling changes.
//!
//! The operating system reports every tiny file event, and one save can be
//! several events. So events are collected until things are quiet for a
//! moment, then reported as one batch. The app reacts by loading the library
//! again.
//!
//! Reading a file is not a change. Linux reports every time a file is opened,
//! even just to read it, and loading the library opens every file. If those
//! counted, each load would set off another load, forever. So "access" events
//! are dropped before anything else.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

use notify::event::{AccessKind, AccessMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher as _};

/// How long things must be quiet before a batch is reported.
pub const QUIET_PERIOD: Duration = Duration::from_millis(250);

/// Longest a batch waits while changes keep coming (a big sync), so the app
/// doesn't fall behind forever.
const LONGEST_WAIT: Duration = Duration::from_secs(2);

/// Keeps watching for as long as this value is alive. Drop it to stop.
pub type Watcher = RecommendedWatcher;

/// Starts watching `root` and everything inside it. `on_change` gets the changed
/// paths (relative to `root`, with `/`) once things are quiet.
///
/// Temporary files from atomic saves (`.name.tmp`) are filtered out, but the
/// final rename still shows up, so the app's own saves are reported too. The
/// app skips those itself (see `OWN_WRITE_WINDOW` in src-tauri).
pub fn watch(root: &Path, on_change: impl Fn(Vec<String>) + Send + 'static) -> notify::Result<Watcher> {
    let base: PathBuf = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());

    // 1. The operating system's events arrive here, one at a time. Changed
    //    paths go into a channel (a queue between two threads).
    let (sender, receiver) = mpsc::channel::<PathBuf>();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let Ok(event) = result else { return };
        if is_read_only(&event.kind) {
            return;
        }
        for path in event.paths {
            let _ = sender.send(path);
        }
    })?;
    watcher.watch(&base, RecursiveMode::Recursive)?;

    // 2. A small thread empties the queue in batches. When the watcher is
    //    dropped, the sender goes with it, `recv` fails and the thread ends.
    std::thread::spawn(move || {
        while let Ok(first) = receiver.recv() {
            let started = Instant::now();
            let mut batch = vec![first];
            loop {
                match receiver.recv_timeout(QUIET_PERIOD) {
                    Ok(path) => {
                        batch.push(path);
                        if started.elapsed() > LONGEST_WAIT {
                            break;
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            let paths = relative_paths(&base, batch);
            if !paths.is_empty() {
                on_change(paths);
            }
        }
    });

    Ok(watcher)
}

/// True for events that only mean "someone looked at this file". Closing a
/// file that was open for writing does count: it's the end of a save.
fn is_read_only(kind: &EventKind) -> bool {
    matches!(kind, EventKind::Access(access) if *access != AccessKind::Close(AccessMode::Write))
}

/// Paths relative to the data folder, with `/`, sorted, no repeats, no temp files.
fn relative_paths(base: &Path, batch: Vec<PathBuf>) -> Vec<String> {
    let mut paths: Vec<String> = batch
        .into_iter()
        .filter_map(|path| {
            let rel = path.strip_prefix(base).ok()?;
            let rel = rel.to_string_lossy().replace('\\', "/");
            let name = rel.rsplit('/').next().unwrap_or(&rel);
            let is_temp = name.starts_with('.') && name.ends_with(".tmp");
            // Git sync keeps its bookkeeping in `.git`; checking status
            // alone rewrites files there, which isn't a change to your data.
            let is_git = rel == ".git" || rel.starts_with(".git/");
            (!is_temp && !is_git && !rel.is_empty()).then_some(rel)
        })
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_bookkeeping_and_temp_files_are_not_changes() {
        let base = Path::new("/data");
        let batch = [
            "/data/.git/index",
            "/data/.git",
            "/data/.x.md.tmp",
            "/data/.gitignore",
            "/data/unsorted.md",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        assert_eq!(relative_paths(base, batch), vec![".gitignore", "unsorted.md"]);
    }
}
