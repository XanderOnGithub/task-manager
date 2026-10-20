//! Every command the UI can call, one file per job. Each is a thin wrapper:
//! find the data folder, call into `task-core`, turn errors into plain strings.
//! The matching TypeScript wrappers are in `src/lib/api.ts`; keep them in sync.
//! The list the app registers is in `../lib.rs`.

pub mod body;
pub mod display;
pub mod folder;
pub mod items;
pub mod library;
pub mod reveal;
pub mod trash;
pub mod unsorted;
