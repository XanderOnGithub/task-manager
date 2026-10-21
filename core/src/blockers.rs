//! Tasks that wait on other tasks: `blocked_by: ID1, ID2` in a task's frontmatter.
//!
//! The ids are other tasks' ids, so renaming or moving a task never breaks the
//! link. This is a reminder, not a lock: a task with an open blocker is shown as
//! blocked, but nothing stops you from finishing it.
//!
//! The file only holds ids (frontmatter is one value per line), joined with ", ".

use crate::error::{Error, Result};
use crate::library::Library;
use crate::model::Kind;

/// How many tasks one task may wait on. Keeps the line in the file short.
pub const MAX_BLOCKERS: usize = 20;

/// The ids in a `blocked_by` value. Blanks and repeats are dropped.
pub fn parse(raw: &str) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for id in raw.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        if !ids.iter().any(|seen| seen == id) {
            ids.push(id.to_owned());
        }
    }
    ids
}

/// Checks that `task` may wait on `blockers` and returns the text to store
/// (`None` for an empty list, which removes the line).
///
/// Refused: a blocker that isn't a task, a task waiting on itself, and a chain
/// that comes back around (A waits on B, B waits on A), which could never finish.
pub fn validate(lib: &Library, task: &str, blockers: &[String]) -> Result<Option<String>> {
    if blockers.len() > MAX_BLOCKERS {
        return Err(Error::NotAllowed(format!(
            "A task can wait on at most {MAX_BLOCKERS} others"
        )));
    }
    for id in blockers {
        let item = lib.get(id).ok_or_else(|| Error::NotFound(id.clone()))?;
        if item.kind != Kind::Task {
            return Err(Error::NotAllowed("Only a task can block a task".into()));
        }
        if id == task {
            return Err(Error::NotAllowed("A task can't wait on itself".into()));
        }
        if waits_on(lib, id, task) {
            return Err(Error::NotAllowed(format!(
                "\"{}\" already waits on this task",
                item.title
            )));
        }
    }
    Ok((!blockers.is_empty()).then(|| blockers.join(", ")))
}

/// True if `from` waits on `target`, directly or through other tasks.
fn waits_on(lib: &Library, from: &str, target: &str) -> bool {
    let mut seen: Vec<&str> = Vec::new();
    let mut stack = vec![from];
    while let Some(id) = stack.pop() {
        if id == target {
            return true;
        }
        if seen.contains(&id) {
            continue;
        }
        seen.push(id);
        if let Some(item) = lib.get(id) {
            stack.extend(item.blocked_by.iter().map(String::as_str));
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_drops_blanks_and_repeats() {
        assert_eq!(parse("A1, B2,,A1 , "), vec!["A1", "B2"]);
        assert!(parse("").is_empty());
    }
}
