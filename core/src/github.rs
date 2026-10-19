//! Talking to GitHub: sign in, list your repositories, create one.
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

/// What Moss asks to do: read and write repositories you can see.
const SCOPE: &str = "repo";

/// What `start_login` returns: show `user_code` and open `verification_uri`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    /// Seconds to wait between polls.
    pub interval: u64,
    /// Seconds until the code stops working.
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
    let body = post_form(
        "https://github.com/login/device/code",
        &[("client_id", client_id), ("scope", SCOPE)],
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

/// The repositories you can push to, most recently pushed first.
pub fn list_repos(token: &str) -> Result<Vec<Repo>> {
    let mut repos = Vec::new();
    // Up to 300 repositories (3 pages of 100). More than that, use the search.
    for page in 1..=3 {
        let body = get(
            token,
            &format!("{API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page={page}"),
        )?;
        let Some(list) = body.as_array() else {
            return Err(Error::Git(github_error(
                &body,
                "Couldn't list your repositories.",
            )));
        };
        repos.extend(
            list.iter()
                .filter(|r| r["permissions"]["push"].as_bool().unwrap_or(true))
                .filter_map(repo_from),
        );
        if list.len() < 100 {
            break;
        }
    }
    Ok(repos)
}

/// Creates a repository under your account (private unless told otherwise).
pub fn create_repo(token: &str, name: &str, private: bool) -> Result<Repo> {
    let body = send(
        agent()
            .post(&format!("{API}/user/repos"))
            .header("Authorization", &format!("Bearer {token}"))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "Moss"),
        Some(serde_json::json!({
            "name": name,
            "private": private,
            "description": "Moss: tasks and pages",
        })),
    )?;
    repo_from(&body).ok_or_else(|| {
        // GitHub's "name already exists" arrives as errors[0].message.
        let reason = body["errors"][0]["message"]
            .as_str()
            .map(|m| format!("Couldn't create the repository: {m}."));
        Error::Git(reason.unwrap_or_else(|| github_error(&body, "Couldn't create the repository.")))
    })
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

type Request = ureq::RequestBuilder<ureq::typestate::WithBody>;

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

fn send(request: Request, json: Option<Value>) -> Result<Value> {
    let mut response = match json {
        Some(json) => request.send_json(json),
        None => request.send_empty(),
    }
    .map_err(network_error)?;
    response.body_mut().read_json().map_err(network_error)
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
    fn errors_use_githubs_words() {
        let body = serde_json::json!({ "message": "Bad credentials" });
        assert!(github_error(&body, "x").contains("Sign in again"));
        let body = serde_json::json!({ "error_description": "The code is wrong" });
        assert_eq!(github_error(&body, "x"), "The code is wrong.");
        assert_eq!(github_error(&serde_json::json!({}), "Fallback."), "Fallback.");
    }
}
