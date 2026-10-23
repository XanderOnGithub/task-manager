//! What the sync needs from "the other side", and GitHub's answer to it.
//!
//! The engine in `mod.rs` never talks to GitHub itself. It asks a `Remote`
//! these four questions. That keeps the merging logic testable with a fake
//! remote that lives in memory (see the tests in `mod.rs`).

use std::collections::BTreeMap;

use serde_json::{json, Value};

use crate::error::{Error, Result};
use crate::github::{call, failure};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;

/// The newest commit on the branch, and the folder tree that commit holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Head {
    pub commit: String,
    pub tree: String,
}

/// One file to send: its new content, or `None` to delete it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Change {
    /// Path inside the data folder, with `/`.
    pub path: String,
    pub content: Option<Vec<u8>>,
}

pub trait Remote: Sync {
    /// The branch's newest commit, or `None` if the repository has no commits yet.
    fn head(&self) -> Result<Option<Head>>;

    /// Every file in that commit: path → the file's Git name (its SHA-1).
    fn list(&self, head: &Head) -> Result<BTreeMap<String, String>>;

    /// The content of the file with this Git name.
    fn read(&self, blob: &str) -> Result<Vec<u8>>;

    /// Makes a new commit on top of `head` that applies `changes`, and moves the
    /// branch to it. Returns the new head, or `None` if someone else moved the
    /// branch first (the caller then starts again from the newer commit).
    fn push(&self, head: Option<&Head>, changes: &[Change], message: &str) -> Result<Option<Head>>;
}

// --- GitHub ---------------------------------------------------------------

/// A repository on GitHub, reached over its web API with the person's token.
pub struct GithubRemote {
    token: String,
    /// "owner/name"
    repo: String,
    branch: String,
}

impl GithubRemote {
    pub fn new(token: &str, repo: &str, branch: &str) -> GithubRemote {
        GithubRemote {
            token: token.to_owned(),
            repo: repo.to_owned(),
            branch: branch.to_owned(),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("https://api.github.com/repos/{}/{path}", self.repo)
    }

    /// A call that must work: anything but a 2xx answer is an error.
    fn ok(&self, method: &str, path: &str, body: Option<Value>, fallback: &str) -> Result<Value> {
        let (status, answer) = call(&self.token, method, &self.url(path), body)?;
        if (200..300).contains(&status) {
            Ok(answer)
        } else {
            Err(failure(&answer, fallback))
        }
    }

    /// Makes the first commit in an empty repository. GitHub's lower-level
    /// calls refuse an empty repository, but its "create a file" call works.
    fn first_commit(&self, change: &Change, message: &str) -> Result<()> {
        let Some(content) = &change.content else {
            return Ok(()); // nothing to delete in an empty repository
        };
        self.ok(
            "PUT",
            &format!("contents/{}", encode_path(&change.path)),
            Some(json!({
                "message": message,
                "content": BASE64.encode(content),
                "branch": self.branch,
            })),
            "Couldn't write to the repository.",
        )?;
        Ok(())
    }
}

impl Remote for GithubRemote {
    fn head(&self) -> Result<Option<Head>> {
        let (status, answer) = call(
            &self.token,
            "GET",
            &self.url(&format!("git/ref/heads/{}", self.branch)),
            None,
        )?;
        // 404: no such branch. 409: the repository has no commits at all.
        if status == 404 || status == 409 {
            return Ok(None);
        }
        if !(200..300).contains(&status) {
            return Err(failure(&answer, "Couldn't reach the repository."));
        }
        let commit = answer["object"]["sha"]
            .as_str()
            .ok_or_else(|| Error::Git("GitHub's answer wasn't understood.".into()))?;
        let commit_info = self.ok(
            "GET",
            &format!("git/commits/{commit}"),
            None,
            "Couldn't read the repository.",
        )?;
        let tree = commit_info["tree"]["sha"]
            .as_str()
            .ok_or_else(|| Error::Git("GitHub's answer wasn't understood.".into()))?;
        Ok(Some(Head {
            commit: commit.to_owned(),
            tree: tree.to_owned(),
        }))
    }

    fn list(&self, head: &Head) -> Result<BTreeMap<String, String>> {
        let answer = self.ok(
            "GET",
            &format!("git/trees/{}?recursive=1", head.tree),
            None,
            "Couldn't list the repository's files.",
        )?;
        if answer["truncated"].as_bool() == Some(true) {
            // GitHub cuts a listing off at about 100,000 files.
            return Err(Error::Git(
                "The repository is too big to sync on this device.".into(),
            ));
        }
        let mut files = BTreeMap::new();
        for entry in answer["tree"].as_array().into_iter().flatten() {
            // Folders and links are not files of ours.
            if entry["type"].as_str() != Some("blob") || entry["mode"].as_str() == Some("120000") {
                continue;
            }
            if let (Some(path), Some(sha)) = (entry["path"].as_str(), entry["sha"].as_str()) {
                files.insert(path.to_owned(), sha.to_owned());
            }
        }
        Ok(files)
    }

    fn read(&self, blob: &str) -> Result<Vec<u8>> {
        let answer = self.ok(
            "GET",
            &format!("git/blobs/{blob}"),
            None,
            "Couldn't read a file from the repository.",
        )?;
        let text: String = answer["content"]
            .as_str()
            .unwrap_or("")
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect();
        BASE64
            .decode(text)
            .map_err(|_| Error::Git("GitHub sent a file that couldn't be read.".into()))
    }

    fn push(&self, head: Option<&Head>, changes: &[Change], message: &str) -> Result<Option<Head>> {
        let Some(head) = head else {
            // An empty repository: the first file makes the first commit, then
            // the rest goes on top of it the usual way.
            let Some(first) = changes.iter().find(|c| c.content.is_some()) else {
                return Ok(None);
            };
            self.first_commit(first, message)?;
            let Some(now) = self.head()? else {
                return Err(Error::Git("Couldn't start the repository.".into()));
            };
            let rest: Vec<Change> = changes.iter().filter(|c| c.path != first.path).cloned().collect();
            return if rest.is_empty() {
                Ok(Some(now))
            } else {
                self.push(Some(&now), &rest, message)
            };
        };

        // 1. Each new or changed file becomes a blob on GitHub.
        let mut entries: Vec<Value> = Vec::new();
        for change in changes {
            match &change.content {
                Some(content) => {
                    let blob = self.ok(
                        "POST",
                        "git/blobs",
                        Some(json!({ "content": BASE64.encode(content), "encoding": "base64" })),
                        "Couldn't send a file to the repository.",
                    )?;
                    entries.push(
                        json!({ "path": change.path, "mode": "100644", "type": "blob", "sha": blob["sha"] }),
                    );
                }
                // A null sha removes the file from the tree.
                None => entries.push(
                    json!({ "path": change.path, "mode": "100644", "type": "blob", "sha": Value::Null }),
                ),
            }
        }
        // 2. A new tree: the old one with those entries changed.
        let tree = self.ok(
            "POST",
            "git/trees",
            Some(json!({ "base_tree": head.tree, "tree": entries })),
            "Couldn't update the repository.",
        )?;
        let tree_sha = tree["sha"].as_str().unwrap_or_default().to_owned();
        // 3. A commit holding that tree, on top of the current one.
        let commit = self.ok(
            "POST",
            "git/commits",
            Some(json!({ "message": message, "tree": tree_sha, "parents": [head.commit] })),
            "Couldn't update the repository.",
        )?;
        let commit_sha = commit["sha"].as_str().unwrap_or_default().to_owned();
        // 4. Move the branch. Without `force`, GitHub refuses if it moved meanwhile.
        let (status, answer) = call(
            &self.token,
            "PATCH",
            &self.url(&format!("git/refs/heads/{}", self.branch)),
            Some(json!({ "sha": commit_sha, "force": false })),
        )?;
        if status == 422 {
            return Ok(None); // "Update is not a fast forward": another computer pushed first
        }
        if !(200..300).contains(&status) {
            return Err(failure(&answer, "Couldn't update the repository."));
        }
        Ok(Some(Head {
            commit: commit_sha,
            tree: tree_sha,
        }))
    }
}

/// A file path for a web address: each part encoded, the slashes kept.
fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|part| {
            part.bytes()
                .map(|b| match b {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                        (b as char).to_string()
                    }
                    _ => format!("%{b:02X}"),
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_encoded_part_by_part() {
        assert_eq!(
            encode_path("areas/Home/Pick tile (1).md"),
            "areas/Home/Pick%20tile%20%281%29.md"
        );
        assert_eq!(encode_path("a/Café.md"), "a/Caf%C3%A9.md");
    }
}
