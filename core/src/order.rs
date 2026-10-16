//! Manual sort order, stored as `order: "V"` in frontmatter.
//!
//! The problem: when you drag a task between two others, we want to write ONE
//! file, not renumber every sibling. Numbers like 1, 2, 3 don't allow that, because
//! there's nothing between 1 and 2 without renumbering.
//!
//! The trick is "fractional indexing": keys are strings compared character by
//! character, like words in a dictionary. Between "A" and "B" there's "AV"; between
//! "A" and "AV" there's "AF"; there's always room. Keys only get longer when you
//! keep dropping into the same gap, and even then slowly.
//!
//! The characters are 0-9, A-Z, a-z, which are already in increasing order in
//! ASCII, so plain string comparison sorts them correctly. A key never ends in "0",
//! because "A" and "A0" would mean the same position and leave no room between.
//!
//! This is a port of the midpoint step from David Greenspan's
//! "Implementing Fractional Indexing" (observablehq.com/@dgreensp).

/// The 62 digits, smallest first.
const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Position of a character in DIGITS. Only call with valid characters.
fn digit(c: u8) -> usize {
    DIGITS
        .iter()
        .position(|&d| d == c)
        .expect("invalid order character")
}

/// True if `key` can be used as an order key.
pub fn is_valid(key: &str) -> bool {
    !key.is_empty() && key.bytes().all(|c| DIGITS.contains(&c)) && !key.ends_with('0')
}

/// Returns a key that sorts after `before` and before `after`.
///
/// - `key_between(None, None)` is the first key in an empty list.
/// - `key_between(Some(last), None)` adds to the end.
/// - `key_between(None, Some(first))` adds to the start.
///
/// Both inputs must be valid keys with `before < after`. If they aren't (say,
/// a hand-edited file), this falls back to a key after `before`, so it never
/// panics.
pub fn key_between(before: Option<&str>, after: Option<&str>) -> String {
    let before = before.filter(|k| is_valid(k));
    let after = after.filter(|k| is_valid(k));
    let after = match (before, after) {
        (Some(b), Some(a)) if b >= a => None,
        (_, a) => a,
    };
    let bytes = midpoint(before.unwrap_or("").as_bytes(), after.map(str::as_bytes));
    String::from_utf8(bytes).expect("keys are ASCII")
}

/// Returns `count` keys in increasing order, all after `start`.
/// Used to give order keys to files that don't have one yet.
pub fn keys_after(start: Option<&str>, count: usize) -> Vec<String> {
    let mut keys = Vec::with_capacity(count);
    let mut previous = start.map(str::to_owned);
    for _ in 0..count {
        let key = key_between(previous.as_deref(), None);
        previous = Some(key.clone());
        keys.push(key);
    }
    keys
}

/// The core step. Think of `a` and `b` as fractions after a decimal point
/// ("V" is 31/62, about 0.5). `a` can be empty (meaning 0); `b` can be None
/// (meaning 1). Returns a fraction strictly between them.
fn midpoint(a: &[u8], b: Option<&[u8]>) -> Vec<u8> {
    if let Some(b) = b {
        // Skip the characters both keys share. Missing characters in `a` count
        // as "0", the same way 0.5 and 0.50 are the same number.
        let mut n = 0;
        while n < b.len() && a.get(n).copied().unwrap_or(b'0') == b[n] {
            n += 1;
        }
        if n > 0 {
            let mut out = b[..n].to_vec();
            let rest_of_a = a.get(n..).unwrap_or(&[]);
            out.extend(midpoint(rest_of_a, Some(&b[n..])));
            return out;
        }
    }

    // Now the first characters differ (or `a` is empty / `b` is None).
    let digit_a = a.first().map(|&c| digit(c)).unwrap_or(0);
    let digit_b = b.map(|b| digit(b[0])).unwrap_or(DIGITS.len());

    if digit_b > digit_a + 1 {
        // There's a whole digit between them: use the middle one.
        vec![DIGITS[(digit_a + digit_b).div_ceil(2)]]
    } else if let Some(b) = b.filter(|b| b.len() > 1) {
        // The first digits are neighbours, but `b` is longer, so `b`'s first
        // digit alone is still smaller than `b` and bigger than `a`.
        vec![b[0]]
    } else {
        // No room at this position: keep `a`'s digit and go one level deeper.
        let mut out = vec![DIGITS[digit_a]];
        out.extend(midpoint(a.get(1..).unwrap_or(&[]), None));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_key_is_in_the_middle() {
        assert_eq!(key_between(None, None), "V");
    }

    #[test]
    fn keys_sort_between_their_neighbours() {
        let cases = [
            (None, Some("V")),
            (Some("V"), None),
            (Some("A"), Some("B")),
            (Some("A"), Some("A1")),
            (Some("Az"), Some("B")),
            (Some("a0V"), Some("a1")),
            (Some("zzz"), None),
            (None, Some("01")),
        ];
        for (before, after) in cases {
            let key = key_between(before, after);
            assert!(is_valid(&key), "{key} is not valid");
            if let Some(b) = before {
                assert!(b < key.as_str(), "{b} < {key}");
            }
            if let Some(a) = after {
                assert!(key.as_str() < a, "{key} < {a}");
            }
        }
    }

    #[test]
    fn repeatedly_inserting_into_the_same_gap_keeps_working() {
        // Simulates dragging a task to the top of a list 500 times.
        let mut first = key_between(None, None);
        for _ in 0..500 {
            let new_first = key_between(None, Some(&first));
            assert!(new_first < first);
            first = new_first;
        }
        // And between two neighbours 500 times.
        let low = "V".to_string();
        let mut high = "W".to_string();
        for _ in 0..500 {
            let mid = key_between(Some(&low), Some(&high));
            assert!(low < mid && mid < high, "{low} < {mid} < {high}");
            high = mid;
        }
        assert!(high.len() < 100, "keys stay reasonably short: {}", high.len());
    }

    #[test]
    fn bad_input_never_panics() {
        // Reversed, invalid or equal neighbours fall back to "after `before`".
        let key = key_between(Some("B"), Some("A"));
        assert!(key.as_str() > "B");
        let key = key_between(Some("hello world"), Some("A0"));
        assert!(is_valid(&key));
    }

    #[test]
    fn keys_after_are_increasing() {
        let keys = keys_after(Some("V"), 50);
        assert!(keys.windows(2).all(|w| w[0] < w[1]));
        assert!(keys[0].as_str() > "V");
    }
}
