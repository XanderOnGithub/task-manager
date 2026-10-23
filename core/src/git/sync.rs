//! The sync itself: commit, fetch, merge, push.

use std::path::Path;

use super::command::run;
use super::commit::commit_all;
use super::merge::merge_remote;
use super::repo::{ahead_behind, ensure_settings, head, remote_branch_exists, REMOTE};
use super::Outcome;
use crate::error::{Error, Result};

/// Commits, brings in what other computers pushed, and pushes. `first` is true
/// when the folder is only now being connected, so its history may be unrelated
/// to the remote's.
///
/// `lock` is held while this changes the working folder (commit and merge), so
/// the app's own saves can't run at the same moment. Fetch and push, which can
/// take seconds, run without it.
pub fn sync<G>(
    dir: &Path,
    branch: &str,
    token: Option<&str>,
    first: bool,
    lock: impl Fn() -> G,
) -> Result<Outcome> {
    let mut outcome = Outcome::default();
    ensure_settings(dir)?;
    {
        let _held = lock();
        commit_all(dir)?;
    }

    let remote_ref = format!("{REMOTE}/{branch}");
    // A push can be refused because another computer pushed a moment ago. Fetch
    // and merge again, once, instead of giving up.
    for attempt in 0..2 {
        run(dir, token, &["fetch", REMOTE])?;

        if remote_branch_exists(dir, &remote_ref) {
            let (_, behind) = ahead_behind(dir, &remote_ref)?;
            if behind > 0 || (first && attempt == 0) {
                let _held = lock();
                // Something may have been saved since the commit above.
                commit_all(dir)?;
                let merged = merge_remote(dir, &remote_ref, first)?;
                outcome.pulled |= merged.pulled;
                outcome.conflicts.extend(merged.conflicts);
                outcome.changed.extend(merged.changed);
            }
            if ahead_behind(dir, &remote_ref)?.0 == 0 {
                return Ok(outcome);
            }
        }

        // Nothing to push in a repository with no commits at all.
        if head(dir).is_none() {
            return Ok(outcome);
        }
        match run(
            dir,
            token,
            &["push", REMOTE, &format!("HEAD:refs/heads/{branch}")],
        ) {
            Ok(_) => {
                outcome.pushed = true;
                return Ok(outcome);
            }
            Err(Error::Git(message)) if attempt == 0 && is_rejection(&message) => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(outcome)
}

/// Does Git's message say the push lost a race with another computer?
fn is_rejection(message: &str) -> bool {
    let m = message.to_lowercase();
    m.contains("rejected") || m.contains("non-fast-forward") || m.contains("fetch first")
}
