//! # task-core
//!
//! The file format of the task app, with no UI in it. Everything here works on a
//! plain folder of markdown files, so it can be tested without the app.
//!
//! How the pieces fit:
//!
//! - `library`     loads the data folder into memory (frontmatter only) → `Library`
//! - `migrate`     moves an older data folder (tasks/ + notes/) to the current layout
//! - `example`     the example folder offered on first launch (only into an empty folder)
//! - `issues`      problems found while loading, shown instead of crashing
//! - `fix`         writes ids for files that are missing one
//! - `search`      find text inside items (titles are searched by the app)
//! - `trash`       the Trash: what was deleted, from where; restore or delete for good
//! - `ops`         create / rename / move / set field / body / trash (and emptying old trash)
//! - `unsorted`    the `unsorted.md` capture list
//! - `apisync`     sync with GitHub's web API, for devices with no `git` (Android)
//! - `git`         Git sync: commit, merge and push the data folder (shells out to `git`)
//! - `github`      signing in to GitHub, listing and creating repositories
//! - `watch`       notices changes made outside the app
//! - `frontmatter` reads and writes the `---` block at the top of a file
//! - `backup`      zip backups of the data folder: create, list, prune, restore
//! - `blockers`   tasks that wait on other tasks (`blocked_by`)
//! - `repeat`      repeating tasks: "weekly", "every 2 weeks", and the next due date
//! - `order`       sort keys that let you reorder by changing one file
//! - `id`, `names`, `model`, `fsutil`, `error`: small building blocks
//!
//! A typical session in the app:
//!
//! ```no_run
//! use task_core::{fix, ops, Kind, Library};
//!
//! let lib = Library::load("/Users/me/Tasks")?;
//! if fix::apply(&lib)? > 0 {
//!     // ids were written; load again so the library matches the files
//! }
//! let lib = Library::load("/Users/me/Tasks")?;
//! let home = lib.children(None, false)[0]; // the first area
//! ops::create(&lib, Kind::Project, Some(&home.id), "Paint the fence", "")?;
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

pub mod apisync;
pub mod backup;
pub mod blockers;
pub mod error;
pub mod example;
pub mod fix;
pub mod frontmatter;
pub mod fsutil;
pub mod git;
pub mod github;
pub mod id;
pub mod issues;
pub mod library;
pub mod migrate;
pub mod model;
pub mod names;
pub mod ops;
pub mod order;
pub mod repeat;
pub mod search;
pub mod trash;
pub mod unsorted;
pub mod watch;

// The names the app uses most, available as `task_core::Library` etc.
pub use error::{Error, Result};
pub use issues::{Issue, IssueView};
pub use library::Library;
pub use model::{Item, Kind, MILESTONE_COLORS};
