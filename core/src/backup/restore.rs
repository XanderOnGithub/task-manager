//! Putting a backup back.
//!
//! The safest order, because this deletes what is in the data folder:
//!
//! 1. Read the zip and check every name. Nothing is touched if it isn't a Moss
//!    backup, or if any name would land outside the folder ("zip slip").
//! 2. Make a backup of what is there now ("before restore"). It stays.
//! 3. Unpack the zip next to the data folder, into a temporary folder.
//! 4. Only then replace the files: everything at the top of the data folder goes
//!    except `.git` (so sync keeps its history and remote), and the unpacked
//!    files move in.
//!
//! If step 3 fails, nothing has changed. If step 4 fails halfway, the "before
//! restore" backup has everything that was there.

use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};

use zip::ZipArchive;

use super::create::{create, zip_error};
use super::{Backup, Kind};
use crate::error::{Error, Result};
use crate::fsutil::check_inside;

/// Refuse a zip that unpacks to more than this (a backup of text files is small).
const MAX_UNPACKED_BYTES: u64 = 4 * 1024 * 1024 * 1024;
/// ...or has more files than this.
const MAX_FILES: usize = 500_000;

/// Replaces the contents of the data folder `root` with the backup `zip_path`.
/// Returns the "before restore" backup, saved in `backups_dir`.
pub fn restore(zip_path: &Path, root: &Path, backups_dir: &Path) -> Result<Backup> {
    let mut archive = ZipArchive::new(File::open(zip_path)?).map_err(zip_error)?;
    check_archive(&mut archive)?;

    let safety = create(root, backups_dir, Kind::BeforeRestore)?;

    let parent = root
        .parent()
        .ok_or_else(|| Error::NotAllowed("That folder can't be restored into.".into()))?;
    let temp = parent.join(format!(".moss-restore-{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp);
    fs::create_dir_all(&temp)?;
    if let Err(e) = unpack(&mut archive, &temp) {
        let _ = fs::remove_dir_all(&temp);
        return Err(e);
    }

    let swapped = swap(root, &temp);
    let _ = fs::remove_dir_all(&temp);
    swapped.map_err(|e| {
        Error::NotAllowed(format!(
            "Restoring stopped partway ({e}). Everything from before is in \"{}\".",
            safety.file_name
        ))
    })?;
    Ok(safety)
}

/// Looks at every entry before anything is written.
fn check_archive(archive: &mut ZipArchive<File>) -> Result<()> {
    let not_a_backup = || Error::NotAllowed("That isn't a Moss backup.".into());
    if archive.is_empty() || archive.len() > MAX_FILES {
        return Err(not_a_backup());
    }
    let mut unpacked = 0u64;
    let mut looks_like_moss = false;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(zip_error)?;
        let name = file.name().trim_end_matches('/');
        check_inside(name).map_err(|_| not_a_backup())?;
        unpacked = unpacked.saturating_add(file.size());
        looks_like_moss |= name == "unsorted.md" || name.starts_with("areas/");
    }
    if unpacked > MAX_UNPACKED_BYTES || !looks_like_moss {
        return Err(not_a_backup());
    }
    Ok(())
}

fn unpack(archive: &mut ZipArchive<File>, into: &Path) -> Result<()> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(zip_error)?;
        if file.is_dir() {
            continue;
        }
        let target = into.join(file.name()); // checked in `check_archive`
        if let Some(dir) = target.parent() {
            fs::create_dir_all(dir)?;
        }
        io::copy(&mut file, &mut File::create(target)?)?;
    }
    Ok(())
}

/// Clears the data folder (keeping `.git`) and moves the unpacked files in.
fn swap(root: &Path, unpacked: &Path) -> io::Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_name() == ".git" {
            continue;
        }
        let path: PathBuf = entry.path();
        if entry.file_type()?.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
    }
    for entry in fs::read_dir(unpacked)? {
        let entry = entry?;
        fs::rename(entry.path(), root.join(entry.file_name()))?;
    }
    Ok(())
}
