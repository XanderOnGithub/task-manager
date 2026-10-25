//! Repairs the issues that are safe to fix without asking.
//!
//! These are all about ids: a file someone made in Finder has no `id:`, a copied
//! file has the same id as the original, a folder has no `_index.md`. The loader
//! already picked the new ids, so fixing just writes them down.
//!
//! This is the only time the app writes to files you didn't ask it to change,
//! so it is careful: the issues were found when the folder was loaded, and a
//! sync or an editor may have changed a file since. Each repair checks the file
//! as it is *now* and does nothing if the problem is already gone.

use crate::error::{Error, Result};
use crate::frontmatter::Frontmatter;
use crate::fsutil::modify_atomic;
use crate::issues::Issue;
use crate::library::{Library, INDEX_FILE};
use crate::ops::update_frontmatter;

/// Writes every fixable issue in `lib`. Returns how many files were changed.
/// Load the library again afterwards to see the result.
pub fn apply(lib: &Library) -> Result<usize> {
    let mut fixed = 0;
    for issue in &lib.issues {
        match issue {
            Issue::MissingId { path, id } => {
                // Only if there still is no id: one that arrived since (say, from
                // a sync) is the real one, and replacing it would break links.
                update_frontmatter(&lib.abs(path), |fm| {
                    if fm.get("id").is_none() {
                        fm.set_first("id", id);
                    }
                })?;
                fixed += 1;
            }
            Issue::DuplicateId { path, id } => {
                update_frontmatter(&lib.abs(path), |fm| fm.set_first("id", id))?;
                fixed += 1;
            }
            Issue::MissingIndex { path, id, kind } => {
                let mut fm = Frontmatter::default();
                fm.set("id", Some(id));
                if let Some(status) = kind.default_status() {
                    fm.set("status", Some(status));
                }
                // Only create it: if an `_index.md` showed up since the load, it
                // stays exactly as it is.
                modify_atomic(&lib.abs(&format!("{path}/{INDEX_FILE}")), |text| {
                    Ok::<_, Error>(if text.is_empty() {
                        fm.render()
                    } else {
                        text.to_owned()
                    })
                })?;
                fixed += 1;
            }
            _ => {}
        }
    }
    Ok(fixed)
}
