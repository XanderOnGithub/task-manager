//! Item ids.
//!
//! Every item gets an `id` in its frontmatter when it's created, and the id never
//! changes, even when the item is renamed or moved. Later, links between notes and
//! tasks will point at ids instead of paths, so links survive renames.
//!
//! An id is 10 characters of Crockford base32 (digits and capital letters without
//! I, L, O and U, so it's easy to read and can't spell words). That's 50 random
//! bits: with 100,000 items the chance of two matching is about 1 in 250,000, and
//! the loader catches duplicates anyway.

/// The 32 characters an id can use, in Crockford's order.
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Length of every id.
pub const ID_LEN: usize = 10;

/// Makes a new random id, like `01JA8ZK3Q7`.
pub fn new_id() -> String {
    let mut bytes = [0u8; ID_LEN];
    // Ask the operating system for random bytes. This only fails on very broken
    // systems, and an app that can't get randomness shouldn't keep going.
    getrandom::fill(&mut bytes).expect("the operating system couldn't provide random bytes");

    // Each byte becomes one character. `& 31` keeps the lowest 5 bits (0..=31),
    // which is exactly one position in the alphabet.
    bytes
        .iter()
        .map(|b| ALPHABET[(b & 31) as usize] as char)
        .collect()
}

/// Makes a new id that isn't already used. `taken` answers "is this id in use?".
pub fn new_unique_id(taken: impl Fn(&str) -> bool) -> String {
    loop {
        let id = new_id();
        if !taken(&id) {
            return id;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_have_the_right_shape() {
        for _ in 0..1000 {
            let id = new_id();
            assert_eq!(id.len(), ID_LEN);
            assert!(id.bytes().all(|b| ALPHABET.contains(&b)), "{id}");
        }
    }

    #[test]
    fn unique_ids_skip_taken_ones() {
        let first = new_id();
        let second = new_unique_id(|candidate| candidate == first);
        assert_ne!(first, second);
    }
}
