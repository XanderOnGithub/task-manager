//! Signing in with GitHub (the device flow, see core/src/github.rs).

use tauri::{AppHandle, Manager};

use task_core::github::{self, DeviceCode, Login};

use super::runtime::{blocking, changed};
use super::token;
use crate::state::{AppState, CmdResult};

/// The public id of Moss's GitHub App (device flow turned on). It is
/// not a secret. Set `MOSS_GITHUB_CLIENT_ID` when building; without it the UI
/// says sign-in isn't set up.
pub(super) const CLIENT_ID: &str = match option_env!("MOSS_GITHUB_CLIENT_ID") {
    Some(id) => id,
    None => "",
};

/// Step 1: GitHub gives a code to type at a web address. The UI shows the
/// code and opens the address.
#[tauri::command]
pub async fn github_login_start() -> CmdResult<DeviceCode> {
    if CLIENT_ID.is_empty() {
        return Err("Sign-in with GitHub isn't set up in this build.".into());
    }
    blocking(|| github::start_login(CLIENT_ID)).await
}

/// Step 2, repeated by the UI every few seconds. Returns "waiting",
/// "slow_down" or "done" (approved on GitHub; the token is now saved).
#[tauri::command]
pub async fn github_login_poll(app: AppHandle, device_code: String) -> CmdResult<&'static str> {
    let login = blocking(move || github::poll_login(CLIENT_ID, &device_code)).await?;
    match login {
        Login::Waiting => Ok("waiting"),
        Login::SlowDown => Ok("slow_down"),
        Login::Done(secret) => {
            token::set(&secret)?;
            {
                let state = app.state::<AppState>();
                let mut inner = state.sync.inner();
                inner.username = None;
                inner.error = None;
            }
            changed(&app);
            Ok("done")
        }
    }
}
