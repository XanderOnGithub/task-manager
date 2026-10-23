//! The repositories you let Moss use, and where to change that list.

use task_core::github::{self, Repo};

use super::runtime::blocking;
use super::token;
use crate::state::CmdResult;

/// The short name of Moss's GitHub App, the part after `github.com/apps/`.
/// Not a secret. Set `MOSS_GITHUB_APP_SLUG` when building; without it the
/// address below falls back to the page that lists all of your installed apps.
const APP_SLUG: &str = match option_env!("MOSS_GITHUB_APP_SLUG") {
    Some(slug) => slug,
    None => "",
};

/// Only the repositories the app is installed on (see core/src/github.rs).
#[tauri::command]
pub async fn github_repos() -> CmdResult<Vec<Repo>> {
    let token = token::get().ok_or("Sign in to GitHub first.")?;
    blocking(move || github::list_repos(&token)).await
}

/// Where the person chooses which repositories Moss can use. On GitHub this
/// page installs the app the first time and edits the choice afterwards.
#[tauri::command]
pub fn github_install_url() -> String {
    install_url(APP_SLUG)
}

fn install_url(slug: &str) -> String {
    if slug.is_empty() {
        "https://github.com/settings/installations".to_string()
    } else {
        format!("https://github.com/apps/{slug}/installations/new")
    }
}

#[cfg(test)]
mod tests {
    use super::install_url;

    #[test]
    fn the_install_page_comes_from_the_app_name() {
        assert_eq!(
            install_url("moss-notes"),
            "https://github.com/apps/moss-notes/installations/new"
        );
        // Built without a name: the list of installed apps still lets you edit the choice.
        assert_eq!(install_url(""), "https://github.com/settings/installations");
    }
}
