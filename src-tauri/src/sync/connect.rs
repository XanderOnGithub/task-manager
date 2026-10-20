//! Starting to sync the open data folder with a repository.

use tauri::{AppHandle, Manager};

use task_core::git;
use task_core::github::Repo;

use super::config::{self, Config};
use super::run::finished;
use super::runtime::{blocking, update};
use super::token;
use crate::state::{AppState, CmdResult};

/// Starts syncing the open data folder with `repo`. If the repository already
/// has files, they are merged with the folder's.
#[tauri::command]
pub async fn sync_connect(app: AppHandle, repo: Repo) -> CmdResult<()> {
    let token = token::get().ok_or("Sign in to GitHub first.")?;
    let root = open_root(&app)?;
    // Built here from the name instead of trusting an address from the front end.
    let url = remote_url(&repo.full_name)?;
    let branch = repo.default_branch.clone();

    update(&app, |inner| inner.syncing = true);
    let (work, folder) = (app.clone(), root.clone());
    let result = blocking(move || {
        let state = work.state::<AppState>();
        let _only_one = state.sync.lock_exclusive();
        git::connect(&folder, &url, &branch, Some(&token), || state.lock_folder())
    })
    .await;
    update(&app, |inner| inner.syncing = false);
    let outcome = result.inspect_err(|e| update(&app, |inner| inner.error = Some(e.clone())))?;

    config::save(
        &app,
        Some(Config {
            folder: root,
            repo: repo.full_name,
            branch: repo.default_branch,
            paused: false,
        }),
    )?;
    finished(&app, &outcome);
    Ok(())
}

fn open_root(app: &AppHandle) -> CmdResult<std::path::PathBuf> {
    app.state::<AppState>()
        .data()?
        .root
        .clone()
        .ok_or_else(|| "Choose a data folder first.".to_string())
}

/// "owner/name" → "https://github.com/owner/name.git". Only plain GitHub names
/// pass; nothing else can end up in a Git command.
fn remote_url(full_name: &str) -> CmdResult<String> {
    let plain = |part: &str| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    match full_name.split_once('/') {
        Some((owner, name)) if plain(owner) && plain(name) => {
            Ok(format!("https://github.com/{owner}/{name}.git"))
        }
        _ => Err("That isn't a GitHub repository name.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::remote_url;

    #[test]
    fn only_plain_github_names_become_addresses() {
        assert_eq!(
            remote_url("me/moss-data").unwrap(),
            "https://github.com/me/moss-data.git"
        );
        assert_eq!(
            remote_url("my-org/a.b_c").unwrap(),
            "https://github.com/my-org/a.b_c.git"
        );
        for bad in [
            "",
            "me",
            "me/",
            "/x",
            "../x",
            "me/..",
            "a/b/c",
            "--upload-pack=x/y",
            "me/na me",
            "me/x;rm",
        ] {
            assert!(remote_url(bad).is_err(), "{bad}");
        }
    }
}
