//! Backups of the data folder: plain `.zip` files you can open with anything.
//!
//! One file per action:
//!
//! - `create`   zip the data folder
//! - `list`     the backups in a folder, newest first
//! - `prune`    delete old automatic backups
//! - `restore`  put a backup back (after making a backup of what is there now)
//!
//! A backup holds the same plain markdown files as the data folder. It leaves
//! out `.git` (the history lives on GitHub when sync is on, and can be large) and
//! the hidden temporary files Moss writes while saving.
//!
//! Three kinds, told apart by their file names:
//!
//! ```text
//! Moss backup 2026-10-20 09-57-32.zip                   automatic: made daily, the newest 14 are kept
//! Moss backup 2026-10-20 09-57-32 (manual).zip          you pressed "Back up now": kept until you delete it
//! Moss backup 2026-10-20 09-57-32 (before restore).zip  made just before a restore: the newest 5 are kept
//! ```

mod create;
mod list;
mod prune;
mod restore;

use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;

pub use create::create;
pub use list::list;
pub use prune::prune;
pub use restore::restore;

/// How many automatic backups are kept.
pub const KEEP_AUTOMATIC: usize = 14;
/// How many "before restore" backups are kept.
pub const KEEP_BEFORE_RESTORE: usize = 5;
/// How long after one backup the next automatic one is due.
pub const AUTOMATIC_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

/// Why a backup was made.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Automatic,
    Manual,
    BeforeRestore,
}

impl Kind {
    /// The words in the file name after the time ("" for automatic).
    fn suffix(self) -> &'static str {
        match self {
            Kind::Automatic => "",
            Kind::Manual => " (manual)",
            Kind::BeforeRestore => " (before restore)",
        }
    }
}

/// One backup file, as the app lists it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub kind: Kind,
    /// The file's full path (the app needs it to restore or reveal).
    pub path: PathBuf,
    pub file_name: String,
    /// `YYYY-MM-DD HH:MM`, read from the name.
    pub when: String,
    /// Milliseconds since 1970, from the file, for "made 3 hours ago".
    pub made_at: u64,
    pub bytes: u64,
}

const PREFIX: &str = "Moss backup ";
