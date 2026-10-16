//! Titles are file and folder names, so they follow file-name rules.

use crate::error::{Error, Result};

/// Longest title allowed. File systems allow 255 bytes; this leaves room for
/// `.md` and keeps names readable in Finder.
pub const MAX_TITLE_CHARS: usize = 120;

/// Checks that `title` can be used as a file or folder name.
///
/// Blocked: `/` and `\` (path separators), `:` (macOS Finder shows it as `/`),
/// control characters, a leading `.` (hidden files), and the reserved name
/// `_index`.
pub fn check_title(title: &str) -> Result<()> {
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

/// Turns free text (like an Unsorted line) into a usable title.
///
/// Returns the title, and `true` if anything had to change, so the caller can
/// keep the original text in the body.
pub fn title_from_text(text: &str) -> (String, bool) {
    // Replace blocked characters with a dash, and line breaks with spaces.
    let cleaned: String = text
        .chars()
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
    if title.is_empty() || title.eq_ignore_ascii_case("_index") {
        title = "Untitled".to_owned();
    }

    let changed = title != text.trim();
    (title, changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn good_titles_pass() {
        for t in ["Demo the sink", "Call Bob?", "Q4 — plan", "Ünïcødé ok", "a.b"] {
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
        ] {
            assert!(check_title(t).is_err(), "{t:?}");
        }
        assert!(check_title(&"x".repeat(MAX_TITLE_CHARS + 1)).is_err());
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
        assert_eq!(title_from_text("::"), ("--".into(), true));
        let long = "word ".repeat(60);
        let (title, changed) = title_from_text(&long);
        assert!(changed && title.chars().count() <= MAX_TITLE_CHARS && !title.ends_with(' '));
        assert!(check_title(&title).is_ok());
    }
}
