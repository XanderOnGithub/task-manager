//! The status Settings and the sidebar show.

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use task_core::github;

use super::{config, engine, login::CLIENT_ID, token};
use crate::state::{AppState, CmdResult};

/// How long to wait before asking GitHub for the username again after a failure.
const USERNAME_RETRY: Duration = Duration::from_secs(60);

/// What the Settings screen shows.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    git_available: bool,
    /// False in builds made without a GitHub App (see `CLIENT_ID`).
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

#[tauri::command]
pub async fn sync_state(app: AppHandle) -> CmdResult<Info> {
    // Looking up the username is a web request; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || info(&app))
        .await
        .map_err(|e| e.to_string())
}

fn info(app: &AppHandle) -> Info {
    let token = token::get();
    let state = app.state::<AppState>();
    let config = config::for_open_folder(app).map(|(config, _)| config);

    // Fetch the username once after signing in (or after a restart).
    let known = state.sync.inner().username.clone();
    let username = match (&token, known) {
        (None, _) => None,
        (Some(_), Some(name)) => Some(name),
        (Some(token), None) => {
            let due = state
                .sync
                .inner()
                .username_tried
                .is_none_or(|at| at.elapsed() >= USERNAME_RETRY);
            let name = if due {
                let name = github::username(token).ok();
                let mut inner = state.sync.inner();
                inner.username_tried = Some(Instant::now());
                inner.username = name.clone();
                name
            } else {
                None
            };
            // Signed in, but GitHub didn't answer (offline): still signed in.
            name.or_else(|| Some("GitHub".to_string()))
        }
    };

    let inner = state.sync.inner();
    Info {
        git_available: engine::available(),
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
