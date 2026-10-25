//! Running `git`.

use std::path::Path;
use std::process::Command;

use crate::error::{Error, Result};

/// True if `git` can be run at all.
pub fn available() -> bool {
    command()
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// A `git` command that doesn't flash a console window. On Windows, starting a
/// console program from an app with no console opens a window for it, and sync
/// runs Git every few seconds. `CREATE_NO_WINDOW` stops that. Other systems
/// have nothing to do.
fn command() -> Command {
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
///
/// `token` (a GitHub sign-in) is given to Git for this one command only.
pub(super) fn run(dir: &Path, token: Option<&str>, args: &[&str]) -> Result<String> {
    let mut cmd = command();
    cmd.current_dir(dir)
        .args(args)
        // Never stop to ask for a password on a terminal that isn't there.
        .env("GIT_TERMINAL_PROMPT", "0")
        // Keep Git's messages in English so we can show them.
        .env("LC_ALL", "C")
        // Give up on a connection that has gone quiet (below 1 KB/s for 30
        // seconds). Without this a dropped network can leave `fetch` or `push`
        // waiting forever, and every later sync waits behind it.
        .env("GIT_HTTP_LOW_SPEED_LIMIT", "1000")
        .env("GIT_HTTP_LOW_SPEED_TIME", "30");
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

/// Like `run`, for questions where failing is just an answer (`true`/`false`).
pub(super) fn succeeds(dir: &Path, args: &[&str]) -> bool {
    run(dir, None, args).is_ok()
}

/// Splits Git's NUL-separated output (`-z`), which keeps names with accents
/// and spaces exactly as they are instead of quoting them.
pub(super) fn split_nul(output: &str) -> Vec<String> {
    output
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Git's last line is the useful one ("fatal: ..."). Also makes sure a token
/// can never end up in a message shown on screen.
fn clean_message(raw: &str) -> String {
    let line = raw
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("Git failed");
    let line = line
        .trim()
        .trim_start_matches("fatal: ")
        .trim_start_matches("error: ")
        .to_string();
    // Remote addresses can carry a token (https://user:token@host); show the host only.
    redact_credentials(&line)
}

/// "https://x-access-token:abc@github.com/a/b" → "https://github.com/a/b".
fn redact_credentials(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("://") {
        let (head, tail) = rest.split_at(start + 3);
        out.push_str(head);
        let end = tail
            .find(|c: char| c.is_whitespace() || c == '\'' || c == '"')
            .unwrap_or(tail.len());
        let (url, after) = tail.split_at(end);
        out.push_str(url.rsplit_once('@').map_or(url, |(_, host)| host));
        rest = after;
    }
    out.push_str(rest);
    out
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

    #[test]
    fn credentials_never_reach_a_message() {
        let raw = "fatal: unable to access 'https://x-access-token:ghp_secret@github.com/a/b.git/': 403";
        let shown = clean_message(raw);
        assert!(
            !shown.contains("ghp_secret") && shown.contains("github.com/a/b.git"),
            "{shown}"
        );
    }

    #[test]
    fn nul_separated_names_keep_accents_and_spaces() {
        assert_eq!(
            split_nul("areas/Café/Pick tile.md\0b.md\0"),
            ["areas/Café/Pick tile.md", "b.md"]
        );
    }
}
