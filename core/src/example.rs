//! The example data folder: a small home renovation (the same one as
//! `sample-data/` in the repo), offered when you first open Moss.
//!
//! The app ships a copy of it and calls `add_example` with where that copy is
//! and the folder you picked. It's only ever added to an empty folder, so it
//! can never mix into, or overwrite, your own files.

use std::fs;
use std::io;
use std::path::Path;

/// Copies the example from `source` into `target` if `target` is empty (or
/// doesn't exist yet). Returns true if it was added.
pub fn add_example(source: &Path, target: &Path) -> io::Result<bool> {
    if !is_empty(target)? {
        return Ok(false);
    }
    copy_dir(source, target)?;
    Ok(true)
}

/// True if the folder doesn't exist or has nothing in it but hidden files
/// (like macOS's `.DS_Store`).
pub fn is_empty(dir: &Path) -> io::Result<bool> {
    if !dir.exists() {
        return Ok(true);
    }
    for entry in fs::read_dir(dir)? {
        if !entry?.file_name().to_string_lossy().starts_with('.') {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Copies a folder and everything in it. Hidden files are left out.
fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}
