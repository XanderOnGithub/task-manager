//! Talking to GitHub: sign in and list the repositories you let Moss use.
//!
//! Moss is a *GitHub App*, not a classic OAuth app. The difference matters for
//! privacy: a classic token with the `repo` scope can read and write every
//! repository you own. A GitHub App's token can only reach the repositories
//! you picked when you installed the app on your account, and only with the
//! permissions the app declares (Contents: read and write; Metadata: read).
//! Nothing here asks for more.
//!
//! Signing in uses GitHub's "device flow", made for apps with no web server:
//! 1. `start_login` asks GitHub for a short code and a web address.
//! 2. You open the address and type the code (the app opens it for you).
//! 3. Meanwhile the app calls `poll_login` every few seconds. When you have
//!    approved it there, GitHub hands back a token.
//!
//! The app needs no secret for this, only its public `client_id`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

use crate::error::{Error, Result};

const API: &str = "https://api.github.com";

/// What `start_login` returns: show `user_code` and open `verification_uri`.
///
/// GitHub sends these as `device_code`, `user_code`, ...; the UI gets them as
/// `deviceCode`, `userCode`, ... The `alias` lets one struct read the first and
/// write the second.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    #[serde(alias = "device_code")]
    pub device_code: String,
    #[serde(alias = "user_code")]
    pub user_code: String,
    #[serde(alias = "verification_uri")]
    pub verification_uri: String,
    /// Seconds to wait between polls.
    pub interval: u64,
    /// Seconds until the code stops working.
    #[serde(alias = "expires_in")]
    pub expires_in: u64,
}

/// Where a sign-in stands.
#[derive(Debug, PartialEq, Eq)]
pub enum Login {
    /// Not approved yet. Ask again after the interval.
    Waiting,
    /// GitHub asked us to poll less often.
    SlowDown,
    /// Approved. This is the token.
    Done(String),
}

/// A repository, as much of it as the app shows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    /// "owner/name"
    pub full_name: String,
    pub private: bool,
    pub default_branch: String,
    /// The https address Git uses.
    pub clone_url: String,
    /// True when nothing has been pushed to it yet.
    pub empty: bool,
}

/// Step 1 of signing in.
pub fn start_login(client_id: &str) -> Result<DeviceCode> {
    // No `scope`: a GitHub App's permissions come from the app itself.
    let body = post_form(
        "https://github.com/login/device/code",
        &[("client_id", client_id)],
    )?;
    serde_json::from_value(body.clone())
        .map_err(|_| Error::Git(github_error(&body, "Couldn't start signing in.")))
}

/// Step 3: has the code been approved yet?
pub fn poll_login(client_id: &str, device_code: &str) -> Result<Login> {
    let body = post_form(
        "https://github.com/login/oauth/access_token",
        &[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ],
    )?;
    if let Some(token) = body["access_token"].as_str() {
        return Ok(Login::Done(token.to_string()));
    }
    match body["error"].as_str() {
        Some("authorization_pending") => Ok(Login::Waiting),
        Some("slow_down") => Ok(Login::SlowDown),
        Some("expired_token") => Err(Error::Git("The code expired. Sign in again.".into())),
        Some("access_denied") => Err(Error::Git("Sign-in was cancelled on GitHub.".into())),
        _ => Err(Error::Git(github_error(&body, "Couldn't sign in."))),
    }
}

/// The signed-in account's username.
pub fn username(token: &str) -> Result<String> {
    let body = get(token, &format!("{API}/user"))?;
    body["login"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| Error::Git(github_error(&body, "Couldn't read the GitHub account.")))
}

/// The repositories you let Moss use, most recently pushed first.
///
/// "Let Moss use" means the ones the app is installed on. An empty list means
/// the app isn't installed yet, or no repository was picked: the UI then sends
/// the person to GitHub to choose (see `install_url` in src-tauri).
pub fn list_repos(token: &str) -> Result<Vec<Repo>> {
    let (status, installations) = call(
        token,
        "GET",
        &format!("{API}/user/installations?per_page=100"),
        None,
    )?;
    // Only a GitHub App's sign-in can list its installations. A token from the
    // old OAuth app (a build still using its client id) is refused here.
    if status == 403 || status == 404 {
        return Err(Error::Git(
            "This sign-in can't list repositories. Moss needs its GitHub App: set MOSS_GITHUB_CLIENT_ID to the App's client id (docs/SYNC.md), rebuild, and sign in again.".into(),
        ));
    }
    let Some(installations) = installations["installations"].as_array() else {
        return Err(Error::Git(github_error(
            &installations,
            "Couldn't list your repositories.",
        )));
    };
    let mut found = Vec::new();
    // One installation per account or organization that installed the app.
    for id in installations.iter().filter_map(|i| i["id"].as_u64()) {
        // Up to 300 repositories per installation (3 pages of 100).
        for page in 1..=3 {
            let body = get(
                token,
                &format!("{API}/user/installations/{id}/repositories?per_page=100&page={page}"),
            )?;
            let Some(list) = body["repositories"].as_array() else {
                return Err(Error::Git(github_error(
                    &body,
                    "Couldn't list your repositories.",
                )));
            };
            found.extend(list.iter().cloned());
            if list.len() < 100 {
                break;
            }
        }
    }
    Ok(repos_from(found))
}

/// Keeps the repositories you can push to and puts the most recently pushed
/// first. (This endpoint, unlike `/user/repos`, can't sort for us.)
fn repos_from(mut list: Vec<Value>) -> Vec<Repo> {
    // `pushed_at` is an ISO 8601 date, so comparing the text compares the dates.
    list.sort_by(|a, b| b["pushed_at"].as_str().cmp(&a["pushed_at"].as_str()));
    list.iter()
        .filter(|r| r["permissions"]["push"].as_bool().unwrap_or(true))
        .filter_map(repo_from)
        .collect()
}

fn repo_from(value: &Value) -> Option<Repo> {
    Some(Repo {
        full_name: value["full_name"].as_str()?.to_string(),
        private: value["private"].as_bool().unwrap_or(true),
        default_branch: value["default_branch"].as_str().unwrap_or("main").to_string(),
        clone_url: value["clone_url"].as_str()?.to_string(),
        // GitHub reports size 0 for a repository nothing was pushed to.
        empty: value["size"].as_u64() == Some(0),
    })
}

/// GitHub's own message if it sent one, otherwise `fallback`.
fn github_error(body: &Value, fallback: &str) -> String {
    let message = body["error_description"]
        .as_str()
        .or_else(|| body["message"].as_str());
    match message {
        Some(m) if m.contains("Bad credentials") => {
            "GitHub no longer accepts this sign-in. Sign in again.".into()
        }
        Some(m) => format!("{}{}", m.trim_end_matches('.'), "."),
        None => fallback.into(),
    }
}

// --- the HTTP plumbing ------------------------------------------------------

fn agent() -> ureq::Agent {
    // GitHub explains its errors in the body (and 4xx is a normal answer
    // while waiting for approval), so don't turn them into Rust errors.
    let config = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build();
    ureq::Agent::new_with_config(config)
}

fn post_form(url: &str, fields: &[(&str, &str)]) -> Result<Value> {
    let mut response = agent()
        .post(url)
        .header("Accept", "application/json")
        .header("User-Agent", "Moss")
        .send_form(fields.iter().copied())
        .map_err(network_error)?;
    response.body_mut().read_json().map_err(network_error)
}

fn get(token: &str, url: &str) -> Result<Value> {
    let mut response = agent()
        .get(url)
        .header("Authorization", &format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Moss")
        .call()
        .map_err(network_error)?;
    response.body_mut().read_json().map_err(network_error)
}

/// One call to GitHub's API with any method. Returns the status code and the
/// JSON answer (`Null` for an empty one), so the caller can tell "not found" or
/// "not a fast-forward" from a real failure. Used by the sync that has no `git`.
pub(crate) fn call(token: &str, method: &str, url: &str, json: Option<Value>) -> Result<(u16, Value)> {
    let agent = agent();
    let auth = format!("Bearer {token}");
    let mut response = match (method, json) {
        ("GET", _) => agent
            .get(url)
            .header("Authorization", &auth)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Moss")
            .call(),
        (method, json) => {
            let builder = match method {
                "POST" => agent.post(url),
                "PATCH" => agent.patch(url),
                _ => agent.put(url),
            }
            .header("Authorization", &auth)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Moss");
            match json {
                Some(json) => builder.send_json(json),
                None => builder.send_empty(),
            }
        }
    }
    .map_err(network_error)?;
    let status = response.status().as_u16();
    let text = response.body_mut().read_to_string().map_err(network_error)?;
    let body = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::Null)
    };
    Ok((status, body))
}

/// GitHub's own message for a failed call, or `fallback`.
pub(crate) fn failure(body: &Value, fallback: &str) -> Error {
    Error::Git(github_error(body, fallback))
}

fn network_error(e: ureq::Error) -> Error {
    Error::Git(format!("Couldn't reach GitHub ({e}). Check the connection."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_is_read_from_githubs_json() {
        let json = serde_json::json!({
            "full_name": "me/moss-data", "private": true, "default_branch": "main",
            "clone_url": "https://github.com/me/moss-data.git", "size": 0
        });
        let repo = repo_from(&json).unwrap();
        assert_eq!(repo.full_name, "me/moss-data");
        assert!(repo.empty && repo.private);
    }

    #[test]
    fn only_repositories_you_can_push_to_are_listed_newest_first() {
        let repo = |name: &str, pushed: &str, push: bool| {
            serde_json::json!({
                "full_name": name, "private": true, "default_branch": "main",
                "clone_url": format!("https://github.com/{name}.git"), "size": 10,
                "pushed_at": pushed, "permissions": { "push": push }
            })
        };
        let list = vec![
            repo("me/old", "2026-01-01T00:00:00Z", true),
            repo("me/read-only", "2026-09-01T00:00:00Z", false),
            repo("me/new", "2026-10-01T00:00:00Z", true),
        ];
        let names: Vec<_> = repos_from(list).into_iter().map(|r| r.full_name).collect();
        assert_eq!(names, ["me/new", "me/old"]);
    }

    #[test]
    fn the_device_code_is_read_as_githubs_sends_it() {
        // Exactly what github.com/login/device/code answers with.
        let json = serde_json::json!({
            "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
            "user_code": "WDJB-MJHT",
            "verification_uri": "https://github.com/login/device",
            "expires_in": 900,
            "interval": 5
        });
        let code: DeviceCode = serde_json::from_value(json).unwrap();
        assert_eq!(code.user_code, "WDJB-MJHT");
        assert_eq!(code.expires_in, 900);
        // ...and handed to the UI in camelCase.
        let out = serde_json::to_value(&code).unwrap();
        assert_eq!(out["userCode"], "WDJB-MJHT");
        assert_eq!(out["verificationUri"], "https://github.com/login/device");
    }

    #[test]
    fn errors_use_githubs_words() {
        let body = serde_json::json!({ "message": "Bad credentials" });
        assert!(github_error(&body, "x").contains("Sign in again"));
        let body = serde_json::json!({ "error_description": "The code is wrong" });
        assert_eq!(github_error(&body, "x"), "The code is wrong.");
        assert_eq!(github_error(&serde_json::json!({}), "Fallback."), "Fallback.");
    }
}
