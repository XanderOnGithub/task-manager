//! Searching inside the text of every item (the body under the frontmatter).
//!
//! Titles are searched in the app itself, from the snapshot it already has.
//! This module covers the part the app doesn't have in memory: the text.
//! It's a plain scan, file by file, stopping once it has enough hits. Fast
//! enough for thousands of files, and nothing to keep in sync.

use serde::Serialize;

use crate::library::Library;
use crate::ops;

/// One match: which item, and a short piece of text around the match.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Hit {
    pub id: String,
    pub snippet: String,
}

/// How much text to show on each side of the match.
const CONTEXT_CHARS: usize = 36;

/// Finds items whose text contains `query` (ignoring case), up to `limit`.
/// Blank queries find nothing.
pub fn search_text(lib: &Library, query: &str, limit: usize) -> Vec<Hit> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }
    let mut hits = Vec::new();
    for item in &lib.items {
        if hits.len() >= limit {
            break;
        }
        // Unreadable files are skipped; they show up as Issues elsewhere.
        let Ok(body) = ops::read_body(lib, &item.id) else {
            continue;
        };
        if let Some(snippet) = snippet_around(&body, &needle) {
            hits.push(Hit {
                id: item.id.clone(),
                snippet,
            });
        }
    }
    hits
}

/// The line containing the match, trimmed to a little context on each side,
/// with markdown symbols left as they are. `None` if there's no match.
fn snippet_around(body: &str, needle_lower: &str) -> Option<String> {
    for line in body.lines() {
        let lower = line.to_lowercase();
        // `find` gives a byte position in the lowercased line. Lowercasing can
        // change byte lengths for some letters, so count in characters.
        let Some(byte_at) = lower.find(needle_lower) else {
            continue;
        };
        let at = lower[..byte_at].chars().count();
        let len = needle_lower.chars().count();
        let chars: Vec<char> = line.trim_end().chars().collect();
        let start = at.saturating_sub(CONTEXT_CHARS);
        let end = (at + len + CONTEXT_CHARS).min(chars.len());
        let mut text: String = chars[start.min(chars.len())..end].iter().collect();
        text = text.trim().to_owned();
        if start > 0 {
            text.insert(0, '…');
        }
        if end < chars.len() {
            text.push('…');
        }
        return Some(text);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::snippet_around;

    #[test]
    fn snippet_shows_the_matching_line_with_context() {
        let body = "First line\nThe sink cutout is 33 x 22 in.\nLast";
        assert_eq!(
            snippet_around(body, "cutout").unwrap(),
            "The sink cutout is 33 x 22 in."
        );
        assert!(snippet_around(body, "missing").is_none());
    }

    #[test]
    fn long_lines_are_trimmed_with_ellipses() {
        let line = format!("{}needle{}", "a".repeat(80), "b".repeat(80));
        let s = snippet_around(&line, "needle").unwrap();
        assert!(s.starts_with('…') && s.ends_with('…'));
        assert!(s.contains("needle"));
    }
}
