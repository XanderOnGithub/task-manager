//! Your repositories: list them, or make a new one.

use task_core::github::{self, Repo};

use super::runtime::blocking;
use super::token;
use crate::state::CmdResult;

#[tauri::command]
pub async fn github_repos() -> CmdResult<Vec<Repo>> {
    let token = token::get().ok_or("Sign in to GitHub first.")?;
    blocking(move || github::list_repos(&token)).await
}

/// Creates a repository (private by default in the UI) and returns it, ready
/// for `sync_connect`.
#[tauri::command]
pub async fn github_create_repo(name: String, private: bool) -> CmdResult<Repo> {
    let token = token::get().ok_or("Sign in to GitHub first.")?;
    blocking(move || github::create_repo(&token, name.trim(), private)).await
}
