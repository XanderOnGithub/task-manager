//! Sync with GitHub without the `git` program, for devices that have none
//! (Android). It talks to GitHub's web API instead (`remote.rs`).
//!
//! It keeps the same promises as the Git sync in `git/`:
//!
//! - **Nothing is thrown away.** If both sides changed the same file, this
//!   device's version stays and the other is saved next to it as
//!   "Title (from other computer).md". A folder's `_index.md` gets the other
//!   text added at the end. Lines added to `unsorted.md` on both sides all stay.
//! - **One sync is: look, bring in, send.** What the other side changed is
//!   brought in, then what this side changed is sent as one commit.
//!
//! How it knows what changed: after every sync it remembers each file's Git name
//! (its SHA-1, the same name Git gives it) in `.moss-sync.json` inside the data
//! folder. That is the "base", what both sides agreed on. Next time, for every
//! file, it compares three things:
//!
//! ```text
//!   base    what both sides had after the last sync
//!   local   what is in the folder now
//!   remote  what is on GitHub now
//! ```
//!
//! - local == remote: nothing to do.
//! - local == base: only GitHub changed it: bring it in.
//! - remote == base: only this device changed it: send it.
//! - neither: both changed it: keep both (above).
//!
//! Hidden files (a name starting with ".") are never synced here: `.git`,
//! `.trash`, `.gitignore`, this state file. They stay on GitHub as they are.

mod remote;

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::error::{Error, Result};
use crate::fsutil::{check_inside, write_atomic};
use crate::git::conflict::{append_their_text, save_copy, without_id};
use crate::git::Outcome;

pub use remote::{Change, GithubRemote, Head, Remote};

/// Where the base is kept, inside the data folder (hidden, so it is not an item).
const STATE_FILE: &str = ".moss-sync.json";
/// A bigger file isn't synced from a phone (GitHub's own limit is 100 MB).
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
/// How many files are fetched at once.
const PARALLEL: usize = 8;

/// What is remembered between syncs.
#[derive(Debug, Default, Serialize, Deserialize)]
struct State {
    /// path → Git name, as both sides had it after the last sync.
    base: BTreeMap<String, String>,
    /// path → what was seen last time, so a file that hasn't changed isn't read
    /// and hashed again (a folder of thousands of files is checked in a moment).
    seen: BTreeMap<String, Seen>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Seen {
    size: u64,
    modified_ns: u128,
    sha: String,
}

/// What to do about one file.
#[derive(Debug, PartialEq, Eq)]
enum Step {
    /// Only GitHub changed it (or deleted it): make this device match.
    Take(String),
    /// Only this device changed it (or deleted it): make GitHub match.
    Send(String),
    /// Both changed it, differently.
    Both(String),
}

/// Compares base, local and remote for every file (see the top of this file).
fn plan(
    base: &BTreeMap<String, String>,
    local: &BTreeMap<String, String>,
    remote: &BTreeMap<String, String>,
) -> Vec<Step> {
    let paths: BTreeSet<&String> = base.keys().chain(local.keys()).chain(remote.keys()).collect();
    let mut steps = Vec::new();
    for path in paths {
        let (b, l, r) = (base.get(path), local.get(path), remote.get(path));
        if l == r {
            continue; // the same on both sides (or gone from both)
        }
        steps.push(if l == b {
            Step::Take(path.clone())
        } else if r == b {
            Step::Send(path.clone())
        } else {
            Step::Both(path.clone())
        });
    }
    steps
}

/// One sync. `lock` is held while the folder's files are looked at and changed,
/// not while waiting for the network, so saves in the app only wait a moment.
///
/// If another device pushed at the very same moment, it starts again once.
pub fn sync<G>(dir: &Path, remote: &dyn Remote, lock: impl Fn() -> G) -> Result<Outcome> {
    for attempt in 0..2 {
        if let Some(outcome) = once(dir, remote, &lock)? {
            return Ok(outcome);
        }
        if attempt == 1 {
            break;
        }
    }
    Err(Error::Git(
        "Another device pushed at the same time. Try again.".into(),
    ))
}

/// How many files differ from the last sync (changed, new or deleted here).
pub fn pending_changes(dir: &Path) -> Result<usize> {
    let state = load_state(dir);
    let (local, _) = scan(dir, &state.seen)?;
    let paths: BTreeSet<&String> = state.base.keys().chain(local.keys()).collect();
    Ok(paths
        .into_iter()
        .filter(|p| state.base.get(*p) != local.get(*p))
        .count())
}

/// Stops syncing: forgets the base. The files stay. (Connecting again treats
/// every file that differs from GitHub's as a conflict and keeps both.)
pub fn forget(dir: &Path) {
    let _ = fs::remove_file(dir.join(STATE_FILE));
}

/// `Ok(None)` means "GitHub moved while we were sending": start again.
fn once<G>(dir: &Path, remote: &dyn Remote, lock: &impl Fn() -> G) -> Result<Option<Outcome>> {
    let mut state = load_state(dir);
    let head = remote.head()?;
    let remote_files: BTreeMap<String, String> = match &head {
        Some(head) => remote
            .list(head)?
            .into_iter()
            .filter(|(path, _)| is_ours(path))
            .collect(),
        None => BTreeMap::new(),
    };

    // Fetch what is probably needed before taking the lock: the network is slow
    // and the app's saves shouldn't wait for it. A first look at the folder says
    // which of GitHub's files are new to this device.
    let (first_look, _) = scan(dir, &state.seen)?;
    let wanted: BTreeSet<&String> = remote_files
        .iter()
        .filter(|(path, sha)| state.base.get(*path) != Some(*sha) && first_look.get(*path) != Some(*sha))
        .map(|(_, sha)| sha)
        .collect();
    let fetched = fetch_all(remote, wanted.into_iter().cloned().collect())?;

    // Look, bring in, with the folder held still.
    let applied = {
        let _held = lock();
        let (local, seen) = scan(dir, &state.seen)?;
        let steps = plan(&state.base, &local, &remote_files);
        let mut work = Work {
            dir,
            remote,
            fetched,
            outcome: Outcome::default(),
            uploads: BTreeMap::new(),
            base: state.base.clone(),
        };
        for step in &steps {
            work.apply(step, &local, &remote_files)?;
        }
        state.seen = seen;
        state.base = work.base.clone();
        // Saved before sending: brought-in files and kept conflicts count as seen,
        // so if sending fails they are not brought in (or copied) a second time.
        save_state(dir, &state)?;
        work
    };
    let Work {
        mut outcome,
        uploads,
        mut base,
        ..
    } = applied;

    // Send.
    if !uploads.is_empty() {
        let changes: Vec<Change> = uploads
            .iter()
            .map(|(path, content)| Change {
                path: path.clone(),
                content: content.clone(),
            })
            .collect();
        let message = if changes.len() == 1 {
            "Moss: 1 change".to_owned()
        } else {
            format!("Moss: {} changes", changes.len())
        };
        if remote.push(head.as_ref(), &changes, &message)?.is_none() {
            return Ok(None);
        }
        outcome.pushed = true;
        // What was sent is now what both sides have. (Not the folder as it is now:
        // a save made while sending hasn't been sent, and must stay a change.)
        for (path, content) in &uploads {
            match content {
                Some(bytes) => base.insert(path.clone(), git_name(bytes)),
                None => base.remove(path),
            };
        }
        state.base = base;
        save_state(dir, &state)?;
    }
    Ok(Some(outcome))
}

/// The work of one sync's "bring in" step, and what it leaves to send.
struct Work<'a> {
    dir: &'a Path,
    remote: &'a dyn Remote,
    /// Files already fetched, by Git name.
    fetched: HashMap<String, Vec<u8>>,
    outcome: Outcome,
    /// What to send: the new content, or `None` to delete.
    uploads: BTreeMap<String, Option<Vec<u8>>>,
    /// The base as it will be once this step is done.
    base: BTreeMap<String, String>,
}

impl Work<'_> {
    fn content(&mut self, sha: &str) -> Result<Vec<u8>> {
        if let Some(bytes) = self.fetched.get(sha) {
            return Ok(bytes.clone());
        }
        let bytes = self.remote.read(sha)?;
        self.fetched.insert(sha.to_owned(), bytes.clone());
        Ok(bytes)
    }

    fn apply(
        &mut self,
        step: &Step,
        local: &BTreeMap<String, String>,
        remote: &BTreeMap<String, String>,
    ) -> Result<()> {
        match step {
            Step::Take(path) => {
                match remote.get(path) {
                    Some(sha) => {
                        let bytes = self.content(sha)?;
                        write_file(self.dir, path, &bytes)?;
                        self.base.insert(path.clone(), sha.clone());
                    }
                    None => {
                        delete_file(self.dir, path)?;
                        self.base.remove(path);
                    }
                }
                self.outcome.pulled = true;
                self.outcome.changed.push(path.clone());
            }
            Step::Send(path) => {
                let content = match local.get(path) {
                    Some(_) => Some(fs::read(self.dir.join(path))?),
                    None => None,
                };
                self.uploads.insert(path.clone(), content);
            }
            Step::Both(path) => self.both(path, local.contains_key(path), remote.get(path))?,
        }
        Ok(())
    }

    /// Both sides changed `path`. This device's version stays; the other one is
    /// kept too, the way `git/conflict.rs` does it.
    fn both(&mut self, path: &str, ours_exists: bool, theirs: Option<&String>) -> Result<()> {
        let name = path.rsplit('/').next().unwrap_or(path);
        let is_markdown = name.ends_with(".md");
        let is_index = name == "_index.md";
        let abs = self.dir.join(path);

        let Some(theirs_sha) = theirs else {
            // They deleted it, we changed it: ours stays.
            self.base.remove(path);
            self.uploads.insert(path.to_owned(), Some(fs::read(&abs)?));
            return Ok(());
        };
        let their_bytes = self.content(theirs_sha)?;
        let their_text = String::from_utf8_lossy(&their_bytes).into_owned();
        // We have now seen their version: if sending fails, the next sync sees
        // only our change and doesn't make a second copy.
        self.base.insert(path.to_owned(), theirs_sha.clone());
        self.outcome.pulled = true;

        if !ours_exists {
            // We deleted it, they changed it: it stays deleted here, and theirs
            // is kept as a copy (for items, as git does).
            if is_markdown && !is_index {
                self.keep_copy(path, &their_text)?;
            }
            self.uploads.insert(path.to_owned(), None);
            return Ok(());
        }

        if path == "unsorted.md" {
            // One line per capture: lines added on both sides all stay.
            let merged = union_lines(&fs::read_to_string(&abs)?, &their_text);
            write_atomic(&abs, &merged)?;
            self.outcome.changed.push(path.to_owned());
        } else if is_index {
            if append_their_text(&abs, &their_text)? {
                self.outcome.changed.push(path.to_owned());
                self.outcome.conflicts.push(path.to_owned());
            }
        } else if is_markdown {
            self.keep_copy(path, &their_text)?;
        }
        // Anything else: this device's file stays as it is.
        self.uploads.insert(path.to_owned(), Some(fs::read(&abs)?));
        Ok(())
    }

    /// Saves their text as "<name> (from other computer).md" next to `path`, to be sent too.
    fn keep_copy(&mut self, path: &str, their_text: &str) -> Result<()> {
        let text = without_id(their_text);
        let (rel, _) = save_copy(self.dir, path, &text)?;
        self.uploads.insert(rel.clone(), Some(text.into_bytes()));
        self.outcome.changed.push(rel.clone());
        self.outcome.conflicts.push(rel);
        Ok(())
    }
}

/// `ours`, then the lines of `theirs` that `ours` doesn't have.
fn union_lines(ours: &str, theirs: &str) -> String {
    let have: BTreeSet<&str> = ours.lines().collect();
    let mut out = ours.to_owned();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    for line in theirs.lines() {
        if !line.trim().is_empty() && !have.contains(line) {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

// --- Looking at the folder -------------------------------------------------

/// Every file that syncs: path → Git name. Also the updated `seen` memory.
fn scan(
    dir: &Path,
    seen: &BTreeMap<String, Seen>,
) -> Result<(BTreeMap<String, String>, BTreeMap<String, Seen>)> {
    let mut found = BTreeMap::new();
    let mut now_seen = BTreeMap::new();
    let now = SystemTime::now();
    walk(dir, "", seen, now, &mut found, &mut now_seen)?;
    Ok((found, now_seen))
}

fn walk(
    dir: &Path,
    prefix: &str,
    seen: &BTreeMap<String, Seen>,
    now: SystemTime,
    found: &mut BTreeMap<String, String>,
    now_seen: &mut BTreeMap<String, Seen>,
) -> Result<()> {
    let entries = match fs::read_dir(dir.join(prefix)) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for entry in entries {
        let entry = entry?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') {
            continue; // hidden: never synced here
        }
        let path = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        let kind = entry.file_type()?;
        if kind.is_dir() {
            walk(dir, &path, seen, now, found, now_seen)?;
        } else if kind.is_file() {
            let meta = entry.metadata()?;
            if meta.len() > MAX_FILE_BYTES {
                continue;
            }
            let modified = meta.modified().ok();
            let modified_ns = modified
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_nanos());
            // A file written in the last couple of seconds could change again
            // within the clock's resolution without its time moving: look inside.
            let recent =
                modified.is_none_or(|t| now.duration_since(t).unwrap_or_default() < Duration::from_secs(2));
            let sha = match seen.get(&path) {
                Some(s) if !recent && s.size == meta.len() && s.modified_ns == modified_ns => s.sha.clone(),
                _ => git_name(&fs::read(dir.join(&path))?),
            };
            now_seen.insert(
                path.clone(),
                Seen {
                    size: meta.len(),
                    modified_ns,
                    sha: sha.clone(),
                },
            );
            found.insert(path, sha);
        }
        // Links and other odd things are not part of a data folder.
    }
    Ok(())
}

/// The name Git gives a file's content: SHA-1 of "blob <length>", a zero byte, then the bytes.
pub fn git_name(content: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", content.len()).as_bytes());
    hasher.update(content);
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// A path that comes from GitHub is only used if it stays inside the data folder
/// and isn't hidden: nothing from the network may write `.git/hooks/...` or `../x`.
fn is_ours(path: &str) -> bool {
    check_inside(path).is_ok() && !path.split('/').any(|part| part.starts_with('.'))
}

// --- Changing the folder ---------------------------------------------------

fn write_file(dir: &Path, path: &str, bytes: &[u8]) -> Result<()> {
    check_inside(path)?;
    let target = dir.join(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    crate::fsutil::write_atomic_bytes(&target, bytes)?;
    Ok(())
}

/// Deletes a file and the folders it leaves empty (an empty folder would show up
/// as a project without details).
fn delete_file(dir: &Path, path: &str) -> Result<()> {
    check_inside(path)?;
    match fs::remove_file(dir.join(path)) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    let mut parent = Path::new(path).parent();
    while let Some(folder) = parent.filter(|p| !p.as_os_str().is_empty()) {
        // `remove_dir` only removes an empty folder, so this can't delete anything.
        if fs::remove_dir(dir.join(folder)).is_err() {
            break;
        }
        parent = folder.parent();
    }
    Ok(())
}

/// Fetches several files at once, by Git name.
fn fetch_all(remote: &dyn Remote, shas: Vec<String>) -> Result<HashMap<String, Vec<u8>>> {
    let next = AtomicUsize::new(0);
    let done: Mutex<HashMap<String, Vec<u8>>> = Mutex::new(HashMap::new());
    let failure: Mutex<Option<Error>> = Mutex::new(None);
    std::thread::scope(|scope| {
        for _ in 0..PARALLEL.min(shas.len()) {
            scope.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                let Some(sha) = shas.get(i) else { break };
                if failure.lock().is_ok_and(|f| f.is_some()) {
                    break;
                }
                match remote.read(sha) {
                    Ok(bytes) => {
                        if let Ok(mut map) = done.lock() {
                            map.insert(sha.clone(), bytes);
                        }
                    }
                    Err(e) => {
                        if let Ok(mut f) = failure.lock() {
                            f.get_or_insert(e);
                        }
                    }
                }
            });
        }
    });
    if let Some(e) = failure.into_inner().ok().flatten() {
        return Err(e);
    }
    Ok(done.into_inner().unwrap_or_default())
}

// --- The remembered base ---------------------------------------------------

fn load_state(dir: &Path) -> State {
    fs::read_to_string(dir.join(STATE_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_state(dir: &Path, state: &State) -> Result<()> {
    let text = serde_json::to_string(state).map_err(|e| Error::Git(e.to_string()))?;
    write_atomic(&dir.join(STATE_FILE), &text)?;
    Ok(())
}
