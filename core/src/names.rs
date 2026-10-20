//! Titles are file and folder names, so they follow file-name rules.
//!
//! The data folder can be synced between a Mac and a Windows computer, so the
//! rules for **new** titles are the strict ones that both systems accept. Names
//! already on disk are only checked against the basics (`check_existing`),
//! so a folder made earlier never stops loading. A name that opens here but
//! Windows couldn't store shows up as an Issue (`portable_problem`).

use crate::error::{Error, Result};

/// Longest title allowed. File systems allow 255 bytes; this leaves room for
/// `.md` and keeps names readable in Finder.
pub const MAX_TITLE_CHARS: usize = 120;

/// Characters Windows can't have in a name (on top of `/`, `\\` and `:`).
const WINDOWS_INVALID: [char; 6] = ['<', '>', '"', '|', '?', '*'];

/// Names Windows keeps for devices, with or without an extension.
const WINDOWS_RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Checks that `title` can be used as the name of a **new** item: the basics
/// (`check_existing`) plus what Windows needs, so it syncs everywhere.
pub fn check_title(title: &str) -> Result<()> {
    check_existing(title)?;
    match portable_problem(title) {
        Some(reason) => Err(Error::InvalidName(reason)),
        None => Ok(()),
    }
}

/// What a name already on disk must satisfy to load: not empty, no path
/// separators, `:` or control characters, no leading `.`, not `_index`.
///
/// Blocked: `/` and `\` (path separators), `:` (macOS Finder shows it as `/`),
/// control characters, a leading `.` (hidden files), and the reserved name
/// `_index`.
pub fn check_existing(title: &str) -> Result<()> {
    let invalid = |reason: &str| Err(Error::InvalidName(reason.to_owned()));

    if title.trim().is_empty() {
        return invalid("Title can't be empty");
    }
    if title != title.trim() {
        return invalid("Title can't start or end with a space");
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return invalid("Title is too long");
    }
    if let Some(c) = title.chars().find(|c| matches!(c, '/' | '\\' | ':')) {
        return Err(Error::InvalidName(format!("Title can't contain \"{c}\"")));
    }
    if title.chars().any(char::is_control) {
        return invalid("Title can't contain line breaks or tabs");
    }
    if title.starts_with('.') {
        return invalid("Title can't start with \".\"");
    }
    if title.eq_ignore_ascii_case("_index") {
        return invalid("\"_index\" is reserved");
    }
    Ok(())
}

/// Why Windows couldn't store a file with this name, or None if it can.
/// Used for new titles, and to flag older names as an Issue.
pub fn portable_problem(title: &str) -> Option<String> {
    if let Some(c) = title.chars().find(|c| WINDOWS_INVALID.contains(c)) {
        return Some(format!("Title can't contain \"{c}\" (Windows doesn't allow it)"));
    }
    if title.ends_with('.') {
        return Some("Title can't end with \".\" (Windows doesn't allow it)".to_owned());
    }
    // "con", "Con.txt" and "CON" are all the console on Windows.
    let stem = title.split('.').next().unwrap_or(title);
    if WINDOWS_RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
        return Some(format!("\"{stem}\" is a reserved name on Windows"));
    }
    None
}

/// Turns free text (like an Unsorted line) into a usable title.
///
/// Returns the title, and `true` if anything had to change, so the caller can
/// keep the original text in the body.
pub fn title_from_text(text: &str) -> (String, bool) {
    // Replace blocked characters with a dash, and line breaks with spaces.
    // Characters only Windows blocks ("What is this?") are simply dropped.
    let cleaned: String = text
        .chars()
        .filter(|c| !WINDOWS_INVALID.contains(c))
        .map(|c| match c {
            '/' | '\\' | ':' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();

    // Collapse runs of spaces and trim, then drop leading dots.
    let mut title = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    title = title.trim_start_matches('.').trim().to_owned();

    // Cut long text at a word boundary.
    if title.chars().count() > MAX_TITLE_CHARS {
        let cut: String = title.chars().take(MAX_TITLE_CHARS).collect();
        title = match cut.rfind(' ') {
            Some(space) if space > MAX_TITLE_CHARS / 2 => cut[..space].to_owned(),
            _ => cut,
        };
    }
    // No trailing dots (Windows), and not a device name like "CON".
    title = title.trim_end_matches('.').trim().to_owned();
    if title.is_empty() || title.eq_ignore_ascii_case("_index") {
        title = "Untitled".to_owned();
    }
    if portable_problem(&title).is_some() {
        title.push_str(" note");
    }

    let changed = title != text.trim();
    (title, changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn good_titles_pass() {
        for t in [
            "Demo the sink",
            "Call Bob",
            "Q4 — plan",
            "Ünïcødé ok",
            "a.b",
            "Console",
            "Communicate",
        ] {
            assert!(check_title(t).is_ok(), "{t}");
        }
    }

    #[test]
    fn bad_titles_fail() {
        for t in [
            "",
            "  ",
            " lead",
            "a/b",
            "a:b",
            "a\\b",
            ".hidden",
            "_index",
            "line\nbreak",
            "Call Bob?",
            "a|b",
            "say \"hi\"",
            "<tag>",
            "all*",
            "ends with dot.",
            "CON",
            "con.txt",
            "Lpt1",
        ] {
            assert!(check_title(t).is_err(), "{t:?}");
        }
        assert!(check_title(&"x".repeat(MAX_TITLE_CHARS + 1)).is_err());
    }

    #[test]
    fn older_names_only_need_the_basics_to_load() {
        // Fine on a Mac, so it still loads; `portable_problem` flags it for Windows.
        assert!(check_existing("Call Bob?").is_ok());
        assert!(portable_problem("Call Bob?").is_some());
        assert!(check_existing("a/b").is_err());
        assert!(portable_problem("Call Bob").is_none());
    }

    #[test]
    fn text_is_cleaned_into_a_title() {
        assert_eq!(
            title_from_text("buy caulk for the sink"),
            ("buy caulk for the sink".into(), false)
        );
        assert_eq!(
            title_from_text("call Bob re: fridge"),
            ("call Bob re- fridge".into(), true)
        );
        assert_eq!(
            title_from_text("  .hidden   thing "),
            ("hidden thing".into(), true)
        );
        assert_eq!(title_from_text("What is this?"), ("What is this".into(), true));
        assert_eq!(title_from_text("Done."), ("Done".into(), true));
        assert_eq!(title_from_text("CON"), ("CON note".into(), true));
        assert_eq!(title_from_text("::"), ("--".into(), true));
        let long = "word ".repeat(60);
        let (title, changed) = title_from_text(&long);
        assert!(changed && title.chars().count() <= MAX_TITLE_CHARS && !title.ends_with(' '));
        assert!(check_title(&title).is_ok());
    }
}
