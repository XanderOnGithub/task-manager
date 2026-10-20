//! Git sync: keeps the data folder in a Git repository.
//!
//! This shells out to the `git` installed on the computer instead of linking a
//! Git library. That keeps this file small, and it means Git's own behavior
//! (merging, the `union` merge driver) is what runs.
//!
//! Signing in works through a token: when there is one, it is handed to Git for
//! that single command through environment variables (never written to a
//! config file, never put in the remote URL, never in the command line where
//! `ps` could show it).
//!
//! What a sync does, in order:
//! 1. commit everything that changed ("Moss: 3 changes")
//! 2. fetch what the other computers pushed
//! 3. merge it in. A real conflict never loses text: the local version stays,
//!    and the other version is saved next to it as "Title (from other computer).md"
//! 4. push

use std::fs;
use std::path::Path;
use std::process::Command;

use crate::error::{Error, Result};

/// The remote's name. Moss only ever uses one.
const REMOTE: &str = "origin";

/// `unsorted.md` is one line per capture. With `merge=union`, lines added on
/// two computers both survive instead of conflicting.
const GITATTRIBUTES: &str = "unsorted.md merge=union\n";

/// The trash is per computer, and Moss's own scratch files stay out of the repo.
const GITIGNORE: &str = ".trash/\n.DS_Store\n";

/// What one sync did.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    /// Changes from other computers came in.
    pub pulled: bool,
    /// Local changes went out.
    pub pushed: bool,
    /// Files whose other version was saved as "(from other computer)".
    pub conflicts: Vec<String>,
}

/// True if `git` can be run at all.
pub fn available() -> bool {
    git_command()
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// True if `dir` already has a repository of its own (not one in a parent folder).
pub fn is_repo(dir: &Path) -> bool {
    dir.join(".git").exists()
}

/// Turns `dir` into a repository that syncs with `url` (`branch` is the remote's
/// main branch). Safe to run on a folder that is already a repository.
///
/// If the remote already has content, it is merged with what's in the folder.
/// If it's empty, the folder's files become its first commit.
pub fn connect(dir: &Path, url: &str, branch: &str, token: Option<&str>) -> Result<Outcome> {
    if !is_repo(dir) {
        git(dir, token, &["init", "-b", branch])?;
    }
    write_if_missing(&dir.join(".gitattributes"), GITATTRIBUTES)?;
    write_if_missing(&dir.join(".gitignore"), GITIGNORE)?;

    // Point `origin` at the repo, whether or not it was set before.
    if git(dir, token, &["remote", "get-url", REMOTE]).is_ok() {
        git(dir, token, &["remote", "set-url", REMOTE, url])?;
    } else {
        git(dir, token, &["remote", "add", REMOTE, url])?;
    }
    sync(dir, branch, token, true)
}

/// Stops syncing: forgets the remote. The files and their history stay.
pub fn disconnect(dir: &Path) -> Result<()> {
    if git(dir, None, &["remote", "get-url", REMOTE]).is_ok() {
        git(dir, None, &["remote", "remove", REMOTE])?;
    }
    Ok(())
}

/// How many files differ from the last commit (changed, new or deleted).
pub fn pending_changes(dir: &Path) -> Result<usize> {
    let status = git(dir, None, &["status", "--porcelain"])?;
    Ok(status.lines().filter(|l| !l.trim().is_empty()).count())
}

/// Commits everything that changed. Returns false if there was nothing to commit.
pub fn commit_all(dir: &Path) -> Result<bool> {
    let changes = pending_changes(dir)?;
    if changes == 0 {
        return Ok(false);
    }
    git(dir, None, &["add", "-A"])?;
    let message = if changes == 1 {
        "Moss: 1 change".to_string()
    } else {
        format!("Moss: {changes} changes")
    };
    git(
        dir,
        None,
        &["-c", "commit.gpgsign=false", "commit", "-m", &message],
    )?;
    Ok(true)
}

/// Commits, brings in what other computers pushed, and pushes. `first` is true
/// when the folder is only now being connected, so its history may be unrelated
/// to the remote's.
pub fn sync(dir: &Path, branch: &str, token: Option<&str>, first: bool) -> Result<Outcome> {
    let mut outcome = Outcome::default();
    ensure_identity(dir)?;
    commit_all(dir)?;

    git(dir, token, &["fetch", REMOTE])?;
    let remote_ref = format!("{REMOTE}/{branch}");
    let remote_exists = git(dir, None, &["rev-parse", "--verify", "--quiet", &remote_ref]).is_ok();

    if remote_exists {
        // How far apart are we? Output is "<ahead>\t<behind>".
        let counts = git(
            dir,
            None,
            &[
                "rev-list",
                "--left-right",
                "--count",
                &format!("HEAD...{remote_ref}"),
            ],
        )?;
        let mut parts = counts.split_whitespace().map(|n| n.parse::<usize>().unwrap_or(0));
        let (ahead, behind) = (parts.next().unwrap_or(0), parts.next().unwrap_or(0));

        if behind > 0 || first {
            let before = git(dir, None, &["rev-parse", "HEAD"]).unwrap_or_default();
            outcome.conflicts = merge_remote(dir, &remote_ref, first)?;
            let after = git(dir, None, &["rev-parse", "HEAD"]).unwrap_or_default();
            outcome.pulled = before != after;
        }
        // Merging adds a commit when both sides had changes, so look again.
        let counts = git(
            dir,
            None,
            &[
                "rev-list",
                "--left-right",
                "--count",
                &format!("HEAD...{remote_ref}"),
            ],
        )?;
        let now_ahead = counts
            .split_whitespace()
            .next()
            .and_then(|n| n.parse::<usize>().ok())
            .unwrap_or(ahead);
        if now_ahead == 0 {
            return Ok(outcome);
        }
    }

    // Nothing to push in a repo with no commits at all.
    if git(dir, None, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return Ok(outcome);
    }
    let target = format!("HEAD:refs/heads/{branch}");
    git(dir, token, &["push", REMOTE, &target])?;
    outcome.pushed = true;
    Ok(outcome)
}

/// Merges `remote_ref` into the current branch. Returns the files that
/// conflicted (their other version was saved as a copy).
fn merge_remote(dir: &Path, remote_ref: &str, unrelated: bool) -> Result<Vec<String>> {
    let mut args = vec![
        "-c",
        "commit.gpgsign=false",
        "merge",
        "--no-edit",
        "-m",
        "Moss: sync",
    ];
    if unrelated {
        args.push("--allow-unrelated-histories");
    }
    args.push(remote_ref);
    if git(dir, None, &args).is_ok() {
        return Ok(Vec::new());
    }

    // The merge stopped. Which files could Git not combine?
    let unmerged = git(dir, None, &["diff", "--name-only", "--diff-filter=U"])?;
    let files: Vec<&str> = unmerged.lines().filter(|l| !l.is_empty()).collect();
    if files.is_empty() {
        // Failed for some other reason (say, an untracked file in the way).
        let _ = git(dir, None, &["merge", "--abort"]);
        return Err(Error::Git(
            "Couldn't combine the changes from the other computer.".into(),
        ));
    }

    let mut copies = Vec::new();
    for file in files {
        // 1. Keep their version as a copy, so nothing they wrote is lost.
        if let Some(copy) = save_their_version(dir, remote_ref, file) {
            copies.push(copy);
        }
        // 2. Keep ours in place. If we deleted the file, it stays deleted.
        if git(dir, None, &["checkout", "--ours", "--", file]).is_ok() {
            git(dir, None, &["add", "--", file])?;
        } else {
            git(dir, None, &["rm", "-f", "--quiet", "--", file])?;
        }
    }
    git(dir, None, &["-c", "commit.gpgsign=false", "commit", "--no-edit"])?;
    Ok(copies)
}

/// Writes the other computer's version of `file` next to it as
/// "<name> (from other computer).md". Returns the copy's path (relative to
/// `dir`), or None when there was nothing to save.
///
/// The copy has no `id:` line, so the next load gives it a fresh one instead of
/// reporting two items with the same id.
fn save_their_version(dir: &Path, remote_ref: &str, file: &str) -> Option<String> {
    let path = Path::new(file);
    // Only items. `_index.md` is a folder's own settings: ours wins, and a
    // copy named "_index (from other computer).md" would be a stray file.
    let stem = path.file_stem()?.to_str()?;
    if path.extension()? != "md" || stem == "_index" || file == "unsorted.md" {
        return None;
    }
    let theirs = git(dir, None, &["show", &format!("{remote_ref}:{file}")]).ok()?;
    let without_id: String = theirs
        .lines()
        .filter(|l| !l.starts_with("id:"))
        .collect::<Vec<_>>()
        .join("\n");
    let copy = path.with_file_name(format!("{stem} (from other computer).md"));
    fs::write(dir.join(&copy), without_id + "\n").ok()?;
    git(dir, None, &["add", "--", copy.to_str()?]).ok()?;
    Some(copy.to_string_lossy().into_owned())
}

/// A computer that never set up Git has no name to commit under (merges need
/// one too). Give this one repository a name, without touching the global config.
fn ensure_identity(dir: &Path) -> Result<()> {
    if git(dir, None, &["config", "user.email"]).map_or(true, |e| e.trim().is_empty()) {
        git(dir, None, &["config", "user.name", "Moss"])?;
        git(
            dir,
            None,
            &["config", "user.email", "moss@users.noreply.github.com"],
        )?;
    }
    Ok(())
}

fn write_if_missing(path: &Path, text: &str) -> Result<()> {
    if !path.exists() {
        fs::write(path, text)?;
    }
    Ok(())
}

/// A `git` command that doesn't flash a console window. On Windows, starting a
/// console program from an app with no console opens a window for it, and sync
/// runs Git every few seconds. `CREATE_NO_WINDOW` stops that. Other systems
/// have nothing to do.
fn git_command() -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Runs `git <args>` in `dir`. Returns what it printed, or its error message.
fn git(dir: &Path, token: Option<&str>, args: &[&str]) -> Result<String> {
    let mut cmd = git_command();
    cmd.current_dir(dir)
        .args(args)
        // Never stop to ask for a password on a terminal that isn't there.
        .env("GIT_TERMINAL_PROMPT", "0")
        // Keep Git's messages in English so we can show them.
        .env("LC_ALL", "C");
    if let Some(token) = token {
        // `GIT_CONFIG_*` adds one config entry for this command only.
        let credentials = base64(format!("x-access-token:{token}").as_bytes());
        cmd.env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader")
            .env(
                "GIT_CONFIG_VALUE_0",
                format!("Authorization: Basic {credentials}"),
            );
    }
    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            Error::Git("Install Git to use sync.".into())
        } else {
            Error::Io(e)
        }
    })?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if stderr.trim().is_empty() { stdout } else { stderr };
        Err(Error::Git(clean_message(&message)))
    }
}

/// Git's last line is the useful one ("fatal: ..."). Makes sure a token can
/// never end up in a message shown on screen.
fn clean_message(raw: &str) -> String {
    let line = raw
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("Git failed");
    line.trim()
        .trim_start_matches("fatal: ")
        .trim_start_matches("error: ")
        .to_string()
}

/// Base64, only needed for the one HTTP header above. Not worth a dependency.
fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_known_values() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"x-access-token:abc"), "eC1hY2Nlc3MtdG9rZW46YWJj");
    }

    #[test]
    fn git_messages_keep_the_useful_line() {
        let raw = "hint: something\nfatal: repository 'x' not found\n";
        assert_eq!(clean_message(raw), "repository 'x' not found");
    }
}
