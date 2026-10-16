//! Reading and writing the frontmatter block at the top of a markdown file:
//!
//! ```text
//! ---
//! id: 01JA8ZK3Q7
//! status: todo
//! ---
//! The body starts here.
//! ```
//!
//! This is a small hand-written parser instead of a full YAML library, on purpose:
//!
//! - Our fields are all flat `key: value` pairs, which is a tiny subset of YAML.
//! - It keeps every line it doesn't understand (comments, fields another app
//!   added) exactly as written, so saving a file never reshuffles it.
//! - It can stop reading at the closing `---`, so loading 10,000 files never
//!   reads their bodies.
//!
//! Limitation: nested YAML (lists, maps) isn't understood as data, but those lines
//! are still kept untouched when the file is saved.

use std::fs::File;
use std::io::{self, BufRead, BufReader};
use std::path::Path;

/// One line inside the frontmatter block.
#[derive(Debug, Clone, PartialEq)]
enum Line {
    /// A `key: value` line. `raw` is the original text, reused when saving so an
    /// unchanged line is written back byte for byte.
    Field { key: String, value: String, raw: String },
    /// Anything else: comments, blank lines, nested YAML.
    Other(String),
}

/// The parsed frontmatter of one file.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Frontmatter {
    lines: Vec<Line>,
}

/// Why a frontmatter block couldn't be read.
#[derive(Debug, Clone, PartialEq)]
pub enum ParseError {
    /// The file starts with `---` but there's no closing `---`.
    Unclosed,
}

impl Frontmatter {
    /// The value of `key`, or `None` if it's missing or blank (`due:`).
    pub fn get(&self, key: &str) -> Option<&str> {
        self.lines.iter().find_map(|line| match line {
            Line::Field { key: k, value, .. } if k == key && !value.is_empty() => Some(value.as_str()),
            _ => None,
        })
    }

    /// Sets `key` to `value`, or clears it with `None`.
    ///
    /// An existing line is updated in place; a new key goes at the end. A cleared
    /// key is removed entirely, so files don't fill up with empty `due:` lines.
    pub fn set(&mut self, key: &str, value: Option<&str>) {
        let position = self
            .lines
            .iter()
            .position(|line| matches!(line, Line::Field { key: k, .. } if k == key));

        match (value, position) {
            (Some(value), Some(i)) => self.lines[i] = field_line(key, value),
            (Some(value), None) => self.lines.push(field_line(key, value)),
            (None, Some(i)) => {
                self.lines.remove(i);
            }
            (None, None) => {}
        }
    }

    /// Like `set`, but a new key goes at the top. Used for `id`, so it's the
    /// first thing you see when you open a file.
    pub fn set_first(&mut self, key: &str, value: &str) {
        if self.get(key).is_some()
            || self
                .lines
                .iter()
                .any(|l| matches!(l, Line::Field { key: k, .. } if k == key))
        {
            self.set(key, Some(value));
        } else {
            self.lines.insert(0, field_line(key, value));
        }
    }

    /// True if there are no lines at all.
    pub fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }

    /// The block as text, including both `---` fences.
    pub fn render(&self) -> String {
        let mut out = String::from("---\n");
        for line in &self.lines {
            match line {
                Line::Field { raw, .. } | Line::Other(raw) => out.push_str(raw),
            }
            out.push('\n');
        }
        out.push_str("---\n");
        out
    }

    /// Parses the lines between the fences (fences not included).
    fn from_lines<'a>(lines: impl Iterator<Item = &'a str>) -> Frontmatter {
        Frontmatter {
            lines: lines.map(parse_line).collect(),
        }
    }
}

/// Splits a whole file into frontmatter and body.
///
/// A file with no frontmatter gives an empty `Frontmatter` and the whole text as
/// the body. Works with both `\n` and `\r\n` line endings.
pub fn split(text: &str) -> Result<(Frontmatter, &str), ParseError> {
    // A byte-order mark is invisible, but some Windows editors add one.
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);

    let Some(rest) = strip_fence(text) else {
        return Ok((Frontmatter::default(), text));
    };

    // Find the closing fence: a line that is exactly `---`.
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']) == "---" {
            let block = &rest[..offset];
            let body = &rest[offset + line.len()..];
            let fm = Frontmatter::from_lines(block.lines());
            return Ok((fm, body));
        }
        offset += line.len();
    }
    Err(ParseError::Unclosed)
}

/// Joins frontmatter and body back into file text.
pub fn join(fm: &Frontmatter, body: &str) -> String {
    let mut out = fm.render();
    out.push_str(body);
    out
}

/// Reads ONLY the frontmatter of a file, stopping at the closing `---`.
///
/// This is what makes loading fast: a note with a 50 KB body costs the same as
/// an empty one.
pub fn read_frontmatter(path: &Path) -> io::Result<Result<Frontmatter, ParseError>> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut line = String::new();

    // First line: is there frontmatter at all?
    if reader.read_line(&mut line)? == 0 {
        return Ok(Ok(Frontmatter::default())); // empty file
    }
    let first = line.trim_start_matches('\u{feff}').trim_end_matches(['\r', '\n']);
    if first != "---" {
        return Ok(Ok(Frontmatter::default()));
    }

    let mut block = Vec::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return Ok(Err(ParseError::Unclosed)); // hit the end without `---`
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed == "---" {
            break;
        }
        block.push(trimmed.to_owned());
    }
    Ok(Ok(Frontmatter::from_lines(block.iter().map(String::as_str))))
}

/// If `text` starts with a `---` line, returns everything after it.
fn strip_fence(text: &str) -> Option<&str> {
    text.strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))
        .or_else(|| (text == "---").then_some(""))
}

/// Turns one line of the block into a `Line`.
fn parse_line(raw: &str) -> Line {
    let raw = raw.trim_end_matches('\r');
    let other = || Line::Other(raw.to_owned());

    // Indented lines belong to nested YAML; comments start with `#`.
    if raw.starts_with([' ', '\t', '#']) || raw.is_empty() {
        return other();
    }
    let Some((key, value)) = raw.split_once(':') else {
        return other();
    };
    let key = key.trim();
    let is_simple_key = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !is_simple_key {
        return other();
    }

    Line::Field {
        key: key.to_owned(),
        value: unquote(value.trim()),
        raw: raw.to_owned(),
    }
}

/// Builds a fresh `key: value` line, adding quotes only when needed.
fn field_line(key: &str, value: &str) -> Line {
    let rendered = if needs_quotes(value) {
        let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
        format!("\"{escaped}\"")
    } else {
        value.to_owned()
    };
    Line::Field {
        key: key.to_owned(),
        value: value.to_owned(),
        raw: format!("{key}: {rendered}"),
    }
}

/// Removes YAML quotes: `"a0V"` → `a0V`, `'it''s'` → `it's`.
fn unquote(value: &str) -> String {
    let bytes = value.as_bytes();
    if value.len() >= 2 && bytes[0] == b'"' && bytes[value.len() - 1] == b'"' {
        let inner = &value[1..value.len() - 1];
        return inner.replace("\\\"", "\"").replace("\\\\", "\\");
    }
    if value.len() >= 2 && bytes[0] == b'\'' && bytes[value.len() - 1] == b'\'' {
        return value[1..value.len() - 1].replace("''", "'");
    }
    value.to_owned()
}

/// True if other YAML readers (like Obsidian) would misread `value` unquoted:
/// numbers, true/false, values with `: ` or ` #`, or a special first character.
fn needs_quotes(value: &str) -> bool {
    if value.is_empty() || value != value.trim() {
        return true;
    }
    let lower = value.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "true" | "false" | "yes" | "no" | "null" | "~" | "on" | "off"
    ) {
        return true;
    }
    if value.parse::<f64>().is_ok() {
        return true;
    }
    if value.contains(": ") || value.contains(" #") {
        return true;
    }
    value.starts_with(|c: char| "-?:,[]{}#&*!|>'\"%@`".contains(c))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str =
        "---\nid: 01JA8ZK3Q7\nstatus: todo\n# a comment\norder: \"a0V\"\ndue:\n---\nBody text.\n";

    #[test]
    fn reads_fields_and_body() {
        let (fm, body) = split(SAMPLE).unwrap();
        assert_eq!(fm.get("id"), Some("01JA8ZK3Q7"));
        assert_eq!(fm.get("status"), Some("todo"));
        assert_eq!(fm.get("order"), Some("a0V"));
        assert_eq!(fm.get("due"), None, "blank counts as missing");
        assert_eq!(fm.get("nope"), None);
        assert_eq!(body, "Body text.\n");
    }

    #[test]
    fn unchanged_files_round_trip_exactly() {
        let (fm, body) = split(SAMPLE).unwrap();
        assert_eq!(join(&fm, body), SAMPLE);
    }

    #[test]
    fn set_updates_in_place_and_keeps_other_lines() {
        let (mut fm, body) = split(SAMPLE).unwrap();
        fm.set("status", Some("done"));
        fm.set("due", None);
        fm.set("created", Some("2026-10-16"));
        let text = join(&fm, body);
        assert_eq!(
            text,
            "---\nid: 01JA8ZK3Q7\nstatus: done\n# a comment\norder: \"a0V\"\ncreated: 2026-10-16\n---\nBody text.\n"
        );
    }

    #[test]
    fn no_frontmatter_means_whole_file_is_body() {
        let (fm, body) = split("# Just a heading\n").unwrap();
        assert!(fm.is_empty());
        assert_eq!(body, "# Just a heading\n");
    }

    #[test]
    fn windows_line_endings_work() {
        let (fm, body) = split("---\r\nid: X1\r\n---\r\nhi\r\n").unwrap();
        assert_eq!(fm.get("id"), Some("X1"));
        assert_eq!(body, "hi\r\n");
    }

    #[test]
    fn unclosed_block_is_an_error() {
        assert_eq!(
            split("---\nid: X1\nno closing fence\n").unwrap_err(),
            ParseError::Unclosed
        );
    }

    #[test]
    fn values_that_need_quotes_get_them() {
        let mut fm = Frontmatter::default();
        fm.set("a", Some("123"));
        fm.set("b", Some("yes"));
        fm.set("c", Some("say \"hi\": now"));
        fm.set("d", Some("plain"));
        let text = fm.render();
        assert!(text.contains("a: \"123\""));
        assert!(text.contains("b: \"yes\""));
        assert!(text.contains("c: \"say \\\"hi\\\": now\""));
        assert!(text.contains("d: plain"));
        // And they read back as the original values.
        let (back, _) = split(&text).unwrap();
        assert_eq!(back.get("c"), Some("say \"hi\": now"));
    }

    #[test]
    fn reading_only_frontmatter_matches_full_parse() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");
        std::fs::write(&path, SAMPLE).unwrap();
        let fm = read_frontmatter(&path).unwrap().unwrap();
        assert_eq!(fm, split(SAMPLE).unwrap().0);
    }
}
