//! `unsorted.md`: raw capture, one item per line.
//!
//! ```text
//! - 2026-10-15 22:42 buy caulk for the sink
//! - 2026-10-15 21:15 look into Syncthing for the notes folder
//! call about the fridge warranty
//! ```
//!
//! It's a plain text file on purpose, so a phone notes app or a shortcut can
//! append to it without knowing anything about this app. Lines added that way
//! may have no `- ` or timestamp; `stamp_missing` adds them the first time the
//! app sees the file.

use std::fs;
use std::io::ErrorKind;

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::fsutil::modify_atomic;
use crate::library::{Library, UNSORTED_FILE};
use crate::model::Kind;
use crate::names::title_from_text;
use crate::ops;

/// One line of `unsorted.md`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Line number in the file (0-based). Used with `raw` to find the line again.
    pub line: usize,
    /// The whole line exactly as it is in the file.
    pub raw: String,
    /// When it was added, `YYYY-MM-DD HH:MM`, if the line has a timestamp.
    pub added: Option<String>,
    /// The text you typed.
    pub text: String,
}

/// Parses the file's text. Blank lines are skipped.
pub fn parse(text: &str) -> Vec<Entry> {
    text.lines()
        .enumerate()
        .filter(|(_, raw)| !raw.trim().is_empty())
        .map(|(line, raw)| {
            let content = raw.trim().strip_prefix("- ").unwrap_or(raw.trim());
            let (added, text) = split_stamp(content);
            Entry {
                line,
                raw: raw.to_owned(),
                added,
                text: text.to_owned(),
            }
        })
        .collect()
}

/// Reads the entries from the data folder. A missing file means no entries.
pub fn read(lib: &Library) -> Result<Vec<Entry>> {
    Ok(parse(&read_text(lib)?))
}

/// Adds a line to the end. `now` is `YYYY-MM-DD HH:MM` (see `fsutil::now_stamp`).
pub fn add(lib: &Library, text: &str, now: &str) -> Result<Entry> {
    // One item is one line: line breaks in pasted text become spaces.
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return Err(Error::InvalidName("Item can't be empty".into()));
    }
    let raw = format!("- {now} {text}");
    // Redone from the file's newest text if it changed while we were adding
    // (a phone appending a line, say), so that line is kept.
    let mut line = 0;
    modify_atomic(&lib.abs(UNSORTED_FILE), |current| {
        let mut file = current.to_owned();
        if !file.is_empty() && !file.ends_with('\n') {
            file.push('\n');
        }
        line = file.lines().count();
        file.push_str(&raw);
        file.push('\n');
        Ok::<_, Error>(file)
    })?;
    Ok(Entry {
        line,
        raw,
        added: Some(now.to_owned()),
        text,
    })
}

/// Adds `- ` and a timestamp to lines that don't have them (lines appended by
/// a phone, for example). Returns how many lines changed; 0 writes nothing.
///
/// This is the one edit that rewrites the whole file, and the file is the one a
/// phone appends to, so it goes through `modify_atomic` like every other edit:
/// if a line arrives while we are working, we start again from the new text and
/// that line is kept.
pub fn stamp_missing(lib: &Library, now: &str) -> Result<usize> {
    let path = lib.abs(UNSORTED_FILE);
    if !path.exists() {
        return Ok(0); // nothing to stamp (and no empty file to create)
    }
    let mut changed = 0;
    modify_atomic(&path, |text| {
        changed = 0; // counted again if the text had to be redone
        let lines: Vec<String> = text
            .lines()
            .map(|raw| {
                if raw.trim().is_empty() {
                    return raw.to_owned();
                }
                let content = raw.trim().strip_prefix("- ").unwrap_or(raw.trim());
                let (added, body) = split_stamp(content);
                let fixed = format!("- {} {body}", added.as_deref().unwrap_or(now));
                if fixed != raw {
                    changed += 1;
                }
                fixed
            })
            .collect();
        // Nothing to stamp: hand back the text as it is, byte for byte.
        if changed == 0 {
            return Ok::<_, Error>(text.to_owned());
        }
        Ok(lines.join("\n") + "\n")
    })?;
    Ok(changed)
}

/// Removes one entry. Fails with `Changed` if that line isn't in the file
/// anymore (it was edited elsewhere), so the wrong line is never deleted.
pub fn remove(lib: &Library, entry: &Entry) -> Result<()> {
    modify_atomic(&lib.abs(UNSORTED_FILE), |text| {
        let mut lines: Vec<&str> = text.lines().collect();

        // Usually the line is where we left it; if lines were added above it, look
        // for the same text elsewhere.
        let position = if lines.get(entry.line) == Some(&entry.raw.as_str()) {
            Some(entry.line)
        } else {
            lines.iter().position(|l| *l == entry.raw)
        };
        let Some(position) = position else {
            return Err(Error::Changed("Unsorted".into()));
        };
        lines.remove(position);

        let mut out = lines.join("\n");
        if !out.is_empty() {
            out.push('\n');
        }
        Ok(out)
    })
}

/// Puts a removed entry back at its old line (the Undo after filing).
pub fn restore(lib: &Library, entry: &Entry) -> Result<()> {
    modify_atomic(&lib.abs(UNSORTED_FILE), |text| {
        let mut lines: Vec<&str> = text.lines().collect();
        let at = entry.line.min(lines.len());
        lines.insert(at, &entry.raw);
        Ok::<_, Error>(lines.join("\n") + "\n")
    })
}

/// Turns an entry into a task, page or project inside `parent`, then removes it
/// from Unsorted. Returns the new item's id.
///
/// The text becomes the title. If it had to change (too long, or it contained
/// `:` or `/`), the original text is kept as the body so nothing is lost.
pub fn file(lib: &Library, entry: &Entry, kind: Kind, parent: Option<&str>) -> Result<String> {
    file_with(lib, entry, kind, parent, &FileOptions::default())
}

/// Extras for filing an entry. The app fills these in when it understood a
/// date in the text ("call Bob friday").
#[derive(Debug, Default)]
pub struct FileOptions {
    /// The text to make the title from, instead of the entry's own (the same
    /// text without the date words). The entry's full text is kept as the body.
    pub text: Option<String>,
    /// A due date, `YYYY-MM-DD`. Only for tasks.
    pub due: Option<String>,
}

/// Like `file`, with `FileOptions`.
pub fn file_with(
    lib: &Library,
    entry: &Entry,
    kind: Kind,
    parent: Option<&str>,
    options: &FileOptions,
) -> Result<String> {
    let source = options.text.as_deref().unwrap_or(&entry.text);
    let (title, changed) = title_from_text(source);
    // Whenever the title isn't exactly what was typed, what was typed is kept.
    let body = if changed || source != entry.text {
        format!("{}\n", entry.text)
    } else {
        String::new()
    };
    // A date only means something for a task.
    let due = options.due.as_deref().filter(|_| kind == Kind::Task);
    let id = ops::create_with_due(lib, kind, parent, &title, &body, due)?;
    remove(lib, entry)?;
    Ok(id)
}

/// Splits `2026-10-15 22:42 text` into the stamp and the text.
fn split_stamp(content: &str) -> (Option<String>, &str) {
    // A stamp is exactly 16 characters: YYYY-MM-DD HH:MM.
    let is_stamp = |s: &str| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").is_ok();
    if content.len() >= 16 && content.is_char_boundary(16) && is_stamp(&content[..16]) {
        let rest = content[16..].trim_start();
        return (Some(content[..16].to_owned()), rest);
    }
    (None, content)
}

fn read_text(lib: &Library) -> Result<String> {
    match fs::read_to_string(lib.abs(UNSORTED_FILE)) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_stamped_and_plain_lines() {
        let entries = parse("- 2026-10-15 22:42 buy caulk\n\nplain line\n- no stamp here\n");
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].added.as_deref(), Some("2026-10-15 22:42"));
        assert_eq!(entries[0].text, "buy caulk");
        assert_eq!(entries[1].line, 2);
        assert_eq!(entries[1].added, None);
        assert_eq!(entries[1].text, "plain line");
        assert_eq!(entries[2].text, "no stamp here");
    }

    #[test]
    fn stamping_keeps_every_line_and_writes_nothing_when_done() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(UNSORTED_FILE);
        fs::write(
            &path,
            "plain line\n- 2026-10-15 22:42 stamped\nadded by a phone\n",
        )
        .unwrap();
        let lib = Library::load(dir.path()).unwrap();

        assert_eq!(stamp_missing(&lib, "2026-10-23 09:00").unwrap(), 2);
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "- 2026-10-23 09:00 plain line\n- 2026-10-15 22:42 stamped\n- 2026-10-23 09:00 added by a phone\n"
        );
        // Stamped already: the file is left alone.
        assert_eq!(stamp_missing(&lib, "2026-10-23 09:05").unwrap(), 0);
        // No file: nothing to do, and no empty file appears.
        fs::remove_file(&path).unwrap();
        assert_eq!(stamp_missing(&lib, "2026-10-23 09:05").unwrap(), 0);
        assert!(!path.exists());
    }

    #[test]
    fn text_that_starts_with_a_date_but_not_a_stamp_is_kept() {
        let entries = parse("- 2026-10-15 dentist\n");
        assert_eq!(entries[0].added, None);
        assert_eq!(entries[0].text, "2026-10-15 dentist");
    }
}
