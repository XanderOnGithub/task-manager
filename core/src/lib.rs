//! # task-core
//!
//! The file format of the task app, with no UI in it. Everything here works on a
//! plain folder of markdown files, so it can be tested without the app.
//!
//! How the pieces fit:
//!
//! - `library`     loads the data folder into memory (frontmatter only) → `Library`
//! - `issues`      problems found while loading, shown instead of crashing
//! - `fix`         writes ids for files that are missing one
//! - `ops`         create / rename / move / set field / body / trash
//! - `unsorted`    the `unsorted.md` capture list
//! - `watch`       notices changes made outside the app
//! - `frontmatter` reads and writes the `---` block at the top of a file
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
//! let home = lib.children(None, false)[0];
//! ops::create(&lib, Kind::Project, Some(&home.id), "Paint the fence", "")?;
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

pub mod error;
pub mod fix;
pub mod frontmatter;
pub mod fsutil;
pub mod id;
pub mod issues;
pub mod library;
pub mod model;
pub mod names;
pub mod ops;
pub mod order;
pub mod unsorted;
pub mod watch;

// The names the app uses most, available as `task_core::Library` etc.
pub use error::{Error, Result};
pub use issues::Issue;
pub use library::Library;
pub use model::{Item, Kind, MILESTONE_COLORS};
