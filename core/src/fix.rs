//! Repairs the issues that are safe to fix without asking.
//!
//! These are all about ids: a file someone made in Finder has no `id:`, a copied
//! file has the same id as the original, a folder has no `_index.md`. The loader
//! already picked the new ids, so fixing just writes them down.
//!
//! This is the only time the app writes to files you didn't ask it to change.

use crate::error::Result;
use crate::frontmatter::Frontmatter;
use crate::fsutil::write_atomic;
use crate::issues::Issue;
use crate::library::{Library, INDEX_FILE};
use crate::ops::update_frontmatter;

/// Writes every fixable issue in `lib`. Returns how many files were changed.
/// Load the library again afterwards to see the result.
pub fn apply(lib: &Library) -> Result<usize> {
    let mut fixed = 0;
    for issue in &lib.issues {
        match issue {
            Issue::MissingId { path, id } | Issue::DuplicateId { path, id } => {
                update_frontmatter(&lib.abs(path), |fm| fm.set_first("id", id))?;
                fixed += 1;
            }
            Issue::MissingIndex { path, id, kind } => {
                let mut fm = Frontmatter::default();
                fm.set("id", Some(id));
                if let Some(status) = kind.default_status() {
                    fm.set("status", Some(status));
                }
                write_atomic(&lib.abs(&format!("{path}/{INDEX_FILE}")), &fm.render())?;
                fixed += 1;
            }
            _ => {}
        }
    }
    Ok(fixed)
}
