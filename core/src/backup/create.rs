//! Making a backup.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use super::list::describe;
use super::{Backup, Kind, PREFIX};
use crate::error::{Error, Result};

/// Zips the data folder `root` into a new file in `dir` (made if needed) and
/// returns it. The zip is written under a temporary name and renamed when
/// finished, so a half-written backup never looks like a real one.
pub fn create(root: &Path, dir: &Path, kind: Kind) -> Result<Backup> {
    fs::create_dir_all(dir)?;
    let stamp = chrono::Local::now().format("%Y-%m-%d %H-%M-%S");
    let name = format!("{PREFIX}{stamp}{}.zip", kind.suffix());
    let target = dir.join(&name);
    if target.exists() {
        // Two backups in the same second: the second one waits its turn.
        return Err(Error::NotAllowed(
            "A backup was just made. Try again in a moment.".into(),
        ));
    }
    let temp = dir.join(format!(".{name}.tmp"));

    let result = write_zip(root, &temp);
    if let Err(e) = result {
        let _ = fs::remove_file(&temp);
        return Err(e);
    }
    fs::rename(&temp, &target)?;
    describe(&target).ok_or_else(|| Error::NotFound(name))
}

fn write_zip(root: &Path, temp: &Path) -> Result<()> {
    let mut zip = ZipWriter::new(File::create(temp)?);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    add_folder(&mut zip, root, "", options)?;
    zip.finish().map_err(zip_error)?.flush()?;
    Ok(())
}

/// Adds everything inside `folder`, naming entries `prefix` + their path.
fn add_folder(
    zip: &mut ZipWriter<File>,
    folder: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<()> {
    let mut entries: Vec<_> = fs::read_dir(folder)?.collect::<io::Result<_>>()?;
    entries.sort_by_key(|e| e.file_name()); // the same folder always makes the same zip
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        if skip(&name, prefix.is_empty()) {
            continue;
        }
        let file_type = entry.file_type()?;
        let inside = format!("{prefix}{name}");
        if file_type.is_dir() {
            add_folder(zip, &entry.path(), &format!("{inside}/"), options)?;
        } else if file_type.is_file() {
            zip.start_file(inside, options).map_err(zip_error)?;
            io::copy(&mut File::open(entry.path())?, zip)?;
        }
        // Anything else (a link, a socket) isn't part of a data folder.
    }
    Ok(())
}

/// What a backup leaves out: `.git` at the top, Finder's `.DS_Store`, and the
/// hidden temporary files Moss writes while saving (`.name.tmp`).
fn skip(name: &str, at_top: bool) -> bool {
    (at_top && name == ".git") || name == ".DS_Store" || (name.starts_with('.') && name.ends_with(".tmp"))
}

pub(super) fn zip_error(e: zip::result::ZipError) -> Error {
    match e {
        zip::result::ZipError::Io(io) => Error::Io(io),
        other => Error::NotAllowed(format!("The backup file couldn't be used: {other}")),
    }
}
