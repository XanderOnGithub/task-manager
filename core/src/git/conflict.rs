//! Both computers changed the same file.
//!
//! Git can't decide whose text wins, and neither can Moss, so nothing is thrown
//! away:
//!
//! - **An item (task, page, ...):** this computer's version stays where it is.
//!   The other version is saved next to it as "Title (from other computer).md",
//!   or "... (from other computer 2).md" if that name is taken. It has no `id:`
//!   line, so the next load gives it a fresh id instead of reporting two items
//!   with the same id.
//! - **A folder's `_index.md`** (an area, project or milestone, or a page that
//!   has subpages): this computer's version stays, with the other computer's
//!   text added at the end under a divider. A second copy file would be a stray
//!   file in a folder that only holds items.
//! - **Anything else** (Moss's own `.gitattributes`): this computer's version.
//!
//! If saving the other version fails for any reason, nothing is resolved and the
//! caller undoes the merge. A copy is never skipped silently.

use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use super::command::{run, split_nul};
use crate::error::{Error, Result};
use crate::frontmatter;
use crate::fsutil::{check_inside, write_atomic};

/// Resolves every file Git left unmerged, keeping both sides. Returns the
/// copies made and the `_index.md` files that got the other side's text.
pub(super) fn resolve(dir: &Path, remote_ref: &str) -> Result<Vec<String>> {
    let unmerged = split_nul(&run(
        dir,
        None,
        &["diff", "--name-only", "-z", "--diff-filter=U"],
    )?);
    if unmerged.is_empty() {
        // The merge failed for some other reason (say, an untracked file in the way).
        return Err(Error::Git(
            "Couldn't combine the changes from the other computer.".into(),
        ));
    }

    // Copies made so far, to delete again if a later file fails.
    let mut made: Vec<PathBuf> = Vec::new();
    let result = resolve_all(dir, remote_ref, &unmerged, &mut made);
    if result.is_err() {
        for path in made {
            let _ = fs::remove_file(path);
        }
    }
    result
}

fn resolve_all(
    dir: &Path,
    remote_ref: &str,
    files: &[String],
    made: &mut Vec<PathBuf>,
) -> Result<Vec<String>> {
    let mut kept = Vec::new();
    for file in files {
        check_inside(file)?;
        // The other computer's version. None if it deleted the file there.
        let theirs = run(dir, None, &["show", &format!("{remote_ref}:{file}")]).ok();

        let name = Path::new(file).file_name().and_then(|n| n.to_str()).unwrap_or("");
        let is_markdown = name.ends_with(".md");
        let is_index = name == "_index.md";

        // 1. Save their version first, so a failure leaves our side untouched.
        if let (Some(theirs), true, false) = (&theirs, is_markdown, is_index) {
            let (rel, abs) = save_copy(dir, file, &without_id(theirs))?;
            made.push(abs);
            kept.push(rel);
        }

        // 2. Keep ours in place. If we deleted the file, it stays deleted.
        if run(dir, None, &["checkout", "--ours", "--", file]).is_ok() {
            if let (Some(theirs), true) = (&theirs, is_index) {
                if append_their_text(&dir.join(file), theirs)? {
                    kept.push(file.clone());
                }
            }
            run(dir, None, &["add", "--", file])?;
        } else {
            run(dir, None, &["rm", "-f", "--quiet", "--", file])?;
        }
    }
    // Copies are new files: they go into the merge commit too.
    for rel in &kept {
        run(dir, None, &["add", "--", rel])?;
    }
    run(dir, None, &["-c", "commit.gpgsign=false", "commit", "--no-edit"])?;
    Ok(kept)
}

/// Writes `text` as a new file next to `file`, named "<name> (from other
/// computer).md" (then " 2", " 3", ... if taken). Never replaces a file.
/// Returns the path relative to the data folder, and the full path.
fn save_copy(dir: &Path, file: &str, text: &str) -> Result<(String, PathBuf)> {
    let path = Path::new(file);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");
    for n in 1..1000 {
        let label = if n == 1 {
            "(from other computer)".to_owned()
        } else {
            format!("(from other computer {n})")
        };
        let rel = path.with_file_name(format!("{stem} {label}.md"));
        let abs = dir.join(&rel);
        match OpenOptions::new().write(true).create_new(true).open(&abs) {
            Ok(mut f) => {
                f.write_all(text.as_bytes())?;
                return Ok((rel.to_string_lossy().replace('\\', "/"), abs));
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(Error::Git("Too many copies from the other computer".into()))
}

/// The same file without its `id:` line (only the frontmatter's, never text in the body).
fn without_id(text: &str) -> String {
    match frontmatter::split(text) {
        Ok((mut fm, body)) => {
            fm.set("id", None);
            frontmatter::join(&fm, body)
        }
        Err(_) => text.to_owned(), // frontmatter never closed: keep every character as it is
    }
}

/// Adds the other computer's body text to the end of our `_index.md`, under a
/// divider, unless it has nothing new. Returns whether it did.
fn append_their_text(path: &Path, theirs: &str) -> Result<bool> {
    let ours = fs::read_to_string(path)?;
    let their_body = frontmatter::split(theirs).map_or(theirs, |(_, body)| body).trim();
    let our_body = frontmatter::split(&ours)
        .map_or(ours.as_str(), |(_, body)| body)
        .trim();
    if their_body.is_empty() || their_body == our_body || our_body.contains(their_body) {
        return Ok(false);
    }
    let merged = format!(
        "{}\n\n---\n\nFrom the other computer:\n\n{their_body}\n",
        ours.trim_end()
    );
    write_atomic(path, &merged)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_copy_loses_its_id_but_the_body_keeps_every_line() {
        let text = "---\nid: ABC1234567\nstatus: todo\n---\nid: not a field, just text\n";
        let copy = without_id(text);
        assert!(!copy.contains("ABC1234567") && copy.contains("status: todo"));
        assert!(copy.contains("id: not a field, just text"));
    }

    #[test]
    fn text_without_closed_frontmatter_is_kept_as_it_is() {
        let text = "---\nid: ABC1234567\nnever closed\n";
        assert_eq!(without_id(text), text);
    }

    #[test]
    fn copies_never_replace_each_other() {
        let dir = tempfile::tempdir().unwrap();
        let (one, _) = save_copy(dir.path(), "Tile.md", "first").unwrap();
        let (two, _) = save_copy(dir.path(), "Tile.md", "second").unwrap();
        assert_eq!(one, "Tile (from other computer).md");
        assert_eq!(two, "Tile (from other computer 2).md");
        assert_eq!(fs::read_to_string(dir.path().join(one)).unwrap(), "first");
    }

    #[test]
    fn their_index_text_is_added_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("_index.md");
        fs::write(&path, "---\nid: AAAAAAAAAA\n---\nOurs\n").unwrap();
        let theirs = "---\nid: AAAAAAAAAA\n---\nTheirs\n";
        assert!(append_their_text(&path, theirs).unwrap());
        let merged = fs::read_to_string(&path).unwrap();
        assert!(merged.contains("Ours") && merged.contains("From the other computer:\n\nTheirs"));
        // Already there: nothing more is added.
        assert!(!append_their_text(&path, theirs).unwrap());
        // Nothing to add when they wrote nothing.
        assert!(!append_their_text(&path, "---\nid: AAAAAAAAAA\n---\n").unwrap());
    }
}
