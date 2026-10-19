//! Git sync for the desktop app: sign in to GitHub, pick or create a repository,
//! and keep the data folder in it. The Git and GitHub work itself lives in
//! `task-core` (`git.rs`, `github.rs`); this file is the glue: where the token
//! is kept, when to sync, and what the UI is told.
//!
//! When it syncs:
//! - about a minute after the last change (one commit for everything since the last)
//! - when the app opens, when its window comes back to the front, and every few minutes
//! - when you press "Sync now"
//! - on quit it only commits (fast); the push happens at the next launch

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use task_core::git;
use task_core::github::{self, DeviceCode, Login, Repo};

use crate::{load_settings, save_settings, AppState, CmdResult, DATA_CHANGED};

/// The public id of Moss's OAuth app on GitHub (device flow turned on). It is
/// not a secret. Set `MOSS_GITHUB_CLIENT_ID` when building; without it the UI
/// says sign-in isn't set up.
const CLIENT_ID: &str = match option_env!("MOSS_GITHUB_CLIENT_ID") {
    Some(id) => id,
    None => "",
};

/// Where the token is kept: the system keychain (macOS Keychain, Windows
/// Credential Manager), not a file.
const KEYCHAIN_SERVICE: &str = "com.xanderreyes.moss";
const KEYCHAIN_USER: &str = "github";

/// Sent to the UI whenever the sync status changes.
const SYNC_CHANGED: &str = "sync-changed";

/// How long after your last change Moss commits and pushes.
const QUIET_BEFORE_COMMIT: Duration = Duration::from_secs(60);
/// How often it checks for changes from other computers.
const PULL_EVERY: Duration = Duration::from_secs(5 * 60);
/// A window coming to the front only pulls if the last sync was longer ago.
const FOCUS_PULL_AFTER: Duration = Duration::from_secs(30);
/// How often the background thread looks at things.
const TICK: Duration = Duration::from_secs(15);

/// What's saved in settings.json about sync.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// The data folder this belongs to. Sync stops if you switch to another one.
    pub folder: PathBuf,
    /// "owner/name"
    pub repo: String,
    pub branch: String,
    pub paused: bool,
}

/// What lives in memory while the app runs.
#[derive(Default)]
pub struct Runtime {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// The GitHub username, looked up once per sign-in.
    username: Option<String>,
    syncing: bool,
    /// Milliseconds since 1970 of the last successful sync.
    last_synced: Option<u64>,
    /// When Moss last tried (success or not), so a failing sync isn't retried every tick.
    last_attempt: Option<Instant>,
    error: Option<String>,
    /// Files that differ from the last commit.
    pending: usize,
}

/// What the Settings screen shows.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    git_available: bool,
    /// False in builds made without a GitHub OAuth app (see `CLIENT_ID`).
    login_available: bool,
    /// The signed-in GitHub username.
    username: Option<String>,
    /// The repository ("owner/name"), when this data folder is syncing.
    repo: Option<String>,
    paused: bool,
    syncing: bool,
    last_synced: Option<u64>,
    error: Option<String>,
    pending: usize,
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

fn keychain() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())
}

fn token() -> Option<String> {
    keychain().ok()?.get_password().ok()
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/// The config for the folder that's open, if it syncs.
fn config_for_open_folder(app: &AppHandle) -> Option<(Config, PathBuf)> {
    let state = app.state::<AppState>();
    let config = load_settings(&state.settings_file).sync?;
    let root = state.data.lock().ok()?.root.clone()?;
    (config.folder == root).then_some((config, root))
}

fn changed(app: &AppHandle) {
    let _ = app.emit(SYNC_CHANGED, ());
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

#[tauri::command]
pub async fn sync_state(app: AppHandle) -> CmdResult<Info> {
    // Looking up the username is a web request; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || info(&app))
        .await
        .map_err(|e| e.to_string())
}

fn info(app: &AppHandle) -> Info {
    let token = token();
    let state = app.state::<AppState>();
    let config = config_for_open_folder(app).map(|(config, _)| config);

    // Fetch the username once after signing in (or after a restart).
    let known = state.sync.inner.lock().ok().and_then(|i| i.username.clone());
    let username = match (&token, known) {
        (None, _) => None,
        (Some(_), Some(name)) => Some(name),
        (Some(token), None) => {
            let name = github::username(token).ok();
            if let Ok(mut inner) = state.sync.inner.lock() {
                inner.username = name.clone();
            }
            // Signed in, but GitHub didn't answer (offline): still signed in.
            name.or_else(|| Some("GitHub".to_string()))
        }
    };

    let inner = state.sync.inner.lock().expect("sync state is not poisoned");
    Info {
        git_available: git::available(),
        login_available: !CLIENT_ID.is_empty(),
        username,
        repo: config.as_ref().map(|c| c.repo.clone()),
        paused: config.as_ref().is_some_and(|c| c.paused),
        syncing: inner.syncing,
        last_synced: inner.last_synced,
        error: inner.error.clone(),
        pending: inner.pending,
    }
}

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

/// Step 1: GitHub gives a code to type at a web address. The UI shows the
/// code and opens the address.
#[tauri::command]
pub async fn github_login_start() -> CmdResult<DeviceCode> {
    if CLIENT_ID.is_empty() {
        return Err("Sign-in with GitHub isn't set up in this build.".into());
    }
    blocking(|| github::start_login(CLIENT_ID)).await
}

/// Step 2, repeated by the UI every few seconds: true once approved on GitHub.
/// Returns "waiting", "slow_down" or "done".
#[tauri::command]
pub async fn github_login_poll(app: AppHandle, device_code: String) -> CmdResult<&'static str> {
    let login = blocking(move || github::poll_login(CLIENT_ID, &device_code)).await?;
    match login {
        Login::Waiting => Ok("waiting"),
        Login::SlowDown => Ok("slow_down"),
        Login::Done(token) => {
            keychain()?
                .set_password(&token)
                .map_err(|e| format!("Couldn't save the sign-in: {e}"))?;
            if let Ok(mut inner) = app.state::<AppState>().sync.inner.lock() {
                inner.username = None;
                inner.error = None;
            }
            changed(&app);
            Ok("done")
        }
    }
}

/// Signs out: forgets the token and stops syncing this folder.
#[tauri::command]
pub async fn github_logout(app: AppHandle) -> CmdResult<()> {
    stop_syncing(&app)?;
    if let Ok(entry) = keychain() {
        let _ = entry.delete_credential();
    }
    if let Ok(mut inner) = app.state::<AppState>().sync.inner.lock() {
        inner.username = None;
    }
    changed(&app);
    Ok(())
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn github_repos() -> CmdResult<Vec<Repo>> {
    let token = token().ok_or("Sign in to GitHub first.")?;
    blocking(move || github::list_repos(&token)).await
}

/// Creates a repository (private by default in the UI) and returns it, ready
/// for `sync_connect`.
#[tauri::command]
pub async fn github_create_repo(name: String, private: bool) -> CmdResult<Repo> {
    let token = token().ok_or("Sign in to GitHub first.")?;
    blocking(move || github::create_repo(&token, name.trim(), private)).await
}

// ---------------------------------------------------------------------------
// Connecting and syncing
// ---------------------------------------------------------------------------

/// Starts syncing the open data folder with `repo`. If the repository already
/// has files, they are merged with the folder's.
#[tauri::command]
pub async fn sync_connect(app: AppHandle, repo: Repo) -> CmdResult<()> {
    let token = token().ok_or("Sign in to GitHub first.")?;
    let root = open_root(&app)?;

    set_syncing(&app, true);
    let (url, branch) = (repo.clone_url.clone(), repo.default_branch.clone());
    let folder = root.clone();
    let result = blocking(move || git::connect(&folder, &url, &branch, Some(&token))).await;
    set_syncing(&app, false);
    let outcome = result.inspect_err(|e| record(&app, Some(e.clone())))?;

    let state = app.state::<AppState>();
    let mut settings = load_settings(&state.settings_file);
    settings.sync = Some(Config {
        folder: root,
        repo: repo.full_name,
        branch: repo.default_branch,
        paused: false,
    });
    save_settings(&state.settings_file, &settings).map_err(|e| e.to_string())?;
    finished(&app, &outcome);
    Ok(())
}

/// "Sync now".
#[tauri::command]
pub async fn sync_now(app: AppHandle) -> CmdResult<()> {
    run_sync(&app).await
}

/// The window came back to the front: pull if it's been a while.
#[tauri::command]
pub async fn sync_nudge(app: AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let recent = state
        .sync
        .inner
        .lock()
        .ok()
        .and_then(|i| i.last_attempt)
        .is_some_and(|at| at.elapsed() < FOCUS_PULL_AFTER);
    let idle = quiet_for(&app) >= QUIET_BEFORE_COMMIT || pending(&app) == 0;
    if recent || !idle || config_for_open_folder(&app).is_none_or(|(c, _)| c.paused) {
        return Ok(());
    }
    run_sync(&app).await
}

#[tauri::command]
pub async fn sync_set_paused(app: AppHandle, paused: bool) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let mut settings = load_settings(&state.settings_file);
    if let Some(sync) = settings.sync.as_mut() {
        sync.paused = paused;
    }
    save_settings(&state.settings_file, &settings).map_err(|e| e.to_string())?;
    changed(&app);
    Ok(())
}

/// Stops syncing this folder. The files and their history stay.
#[tauri::command]
pub async fn sync_disconnect(app: AppHandle) -> CmdResult<()> {
    stop_syncing(&app)?;
    changed(&app);
    Ok(())
}

fn stop_syncing(app: &AppHandle) -> CmdResult<()> {
    if let Some((_, root)) = config_for_open_folder(app) {
        git::disconnect(&root).map_err(|e| e.to_string())?;
    }
    let state = app.state::<AppState>();
    let mut settings = load_settings(&state.settings_file);
    settings.sync = None;
    save_settings(&state.settings_file, &settings).map_err(|e| e.to_string())?;
    if let Ok(mut inner) = state.sync.inner.lock() {
        *inner = Inner {
            username: inner.username.take(),
            ..Inner::default()
        };
    }
    Ok(())
}

/// One sync of the open folder. Never runs two at once.
async fn run_sync(app: &AppHandle) -> CmdResult<()> {
    let Some((config, root)) = config_for_open_folder(app) else {
        return Ok(());
    };
    let token = token().ok_or("Sign in to GitHub to sync.")?;
    {
        let state = app.state::<AppState>();
        let mut inner = state
            .sync
            .inner
            .lock()
            .map_err(|_| "Sync hit an internal error.")?;
        if inner.syncing {
            return Ok(());
        }
        inner.syncing = true;
        inner.last_attempt = Some(Instant::now());
    }
    changed(app);

    let branch = config.branch.clone();
    let result = blocking(move || git::sync(&root, &branch, Some(&token), false)).await;
    set_syncing(app, false);
    match result {
        Ok(outcome) => {
            finished(app, &outcome);
            Ok(())
        }
        Err(e) => {
            record(app, Some(e.clone()));
            Err(e)
        }
    }
}

/// A sync went through: remember when, and show pulled files in the app.
fn finished(app: &AppHandle, outcome: &git::Outcome) {
    let state = app.state::<AppState>();
    if let Ok(mut inner) = state.sync.inner.lock() {
        inner.last_synced = Some(now_ms());
        inner.error = None;
        inner.pending = 0;
    }
    if outcome.pulled || !outcome.conflicts.is_empty() {
        // Pulled files are outside changes. The watcher would report them too,
        // but may skip them as our own writes, so say it directly.
        if let Ok(mut data) = state.data.lock() {
            data.library = None;
        }
        let _ = app.emit(DATA_CHANGED, outcome.conflicts.clone());
    }
    changed(app);
}

fn record(app: &AppHandle, error: Option<String>) {
    if let Ok(mut inner) = app.state::<AppState>().sync.inner.lock() {
        inner.error = error;
    }
    changed(app);
}

fn set_syncing(app: &AppHandle, syncing: bool) {
    if let Ok(mut inner) = app.state::<AppState>().sync.inner.lock() {
        inner.syncing = syncing;
    }
    changed(app);
}

fn open_root(app: &AppHandle) -> CmdResult<PathBuf> {
    app.state::<AppState>()
        .data
        .lock()
        .map_err(|_| "The app hit an internal error. Restart it.".to_string())?
        .root
        .clone()
        .ok_or_else(|| "Choose a data folder first.".to_string())
}

/// How long since anything changed in the data folder (by you or from outside).
fn quiet_for(app: &AppHandle) -> Duration {
    app.state::<AppState>()
        .data
        .lock()
        .ok()
        .and_then(|d| d.last_activity)
        .map_or(Duration::MAX, |at| at.elapsed())
}

fn pending(app: &AppHandle) -> usize {
    app.state::<AppState>().sync.inner.lock().map_or(0, |i| i.pending)
}

/// Runs blocking work (Git, web requests) off the async runtime's threads.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> task_core::Result<T> + Send + 'static,
) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// The background thread
// ---------------------------------------------------------------------------

/// Starts the thread that syncs on its own. Called once at startup.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        // A few seconds after launch, so the window comes up first.
        std::thread::sleep(Duration::from_secs(3));
        let mut first = true;
        loop {
            tick(&app, first);
            first = false;
            std::thread::sleep(TICK);
        }
    });
}

fn tick(app: &AppHandle, first: bool) {
    let Some((config, root)) = config_for_open_folder(app) else {
        return;
    };
    if config.paused || token().is_none() || !git::available() {
        return;
    }
    // How many files differ from the last commit? Shown in Settings.
    let changes = git::pending_changes(&root).unwrap_or(0);
    let (syncing, since_attempt) = {
        let state = app.state::<AppState>();
        let Ok(mut inner) = state.sync.inner.lock() else {
            return;
        };
        let before = inner.pending;
        inner.pending = changes;
        if before != changes {
            drop(inner);
            changed(app);
            let inner = state.sync.inner.lock().expect("sync state is not poisoned");
            (inner.syncing, inner.last_attempt.map(|at| at.elapsed()))
        } else {
            (inner.syncing, inner.last_attempt.map(|at| at.elapsed()))
        }
    };
    if syncing {
        return;
    }

    // With unsaved-to-Git changes, wait until you stop for a minute. Without,
    // just check for news every few minutes (or right away at launch).
    let due = if changes > 0 {
        quiet_for(app) >= QUIET_BEFORE_COMMIT && since_attempt.is_none_or(|t| t >= QUIET_BEFORE_COMMIT)
    } else {
        first || since_attempt.is_none_or(|t| t >= PULL_EVERY)
    };
    if due {
        // `run_sync` is async; this thread isn't, so wait for it here.
        let _ = tauri::async_runtime::block_on(run_sync(app));
    }
}

/// On quit: commit what's pending (quick, local), so nothing is left
/// uncommitted. The push happens at the next launch.
pub fn on_exit(app: &AppHandle) {
    if let Some((config, root)) = config_for_open_folder(app) {
        if !config.paused {
            let _ = git::commit_all(&root);
        }
    }
}
