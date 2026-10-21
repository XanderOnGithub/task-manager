//! Backups of the data folder for the desktop app (the zip work is in `task-core`'s `backup`).
//!
//! Where backups live: the app's data folder, in `backups/<folder name>-<hash>/`,
//! one place per data folder, outside the folder itself so syncing the data
//! doesn't also sync its backups.
//!
//! One file per action:
//!
//! - `location`  where this data folder's backups are kept
//! - `list`      the backups and the automatic switch (`backups_get`, `backups_set_automatic`)
//! - `now`       "Back up now" (`backup_now`)
//! - `restore`   put a backup back (`backup_restore`)
//! - `reveal`    show the backups folder (`backups_reveal`)
//! - `schedule`  the background thread that makes a backup about once a day
//!
//! Commands are registered by path (`backup::list::backups_get`, ...), because
//! Tauri's command macro can't be re-exported.

pub(crate) mod list;
mod location;
pub(crate) mod now;
pub(crate) mod restore;
pub(crate) mod reveal;
mod schedule;

pub use schedule::start;
