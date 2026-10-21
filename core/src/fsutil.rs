//! Small file-system helpers shared by the write operations.

use std::fs;
use std::io;
use std::path::Path;

use chrono::Local;

/// Writes a file so it's never half-written.
///
/// The text goes to a hidden temporary file next to the real one, which is then
/// renamed over it. A rename is a single step for the file system, so if the app
/// crashes or the laptop dies mid-save, you get the old file or the new one,
/// never a mix. Sync tools also see one clean change.
pub fn write_atomic(path: &Path, contents: &str) -> io::Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let temp = dir.join(format!(".{name}.tmp"));
    fs::write(&temp, contents)?;
    fs::rename(&temp, path)
}

/// Checks that `rel` is a path inside the data folder: relative, with `/`
/// separators and no `..`, `.` or empty parts. Paths come from the front end
/// (and ultimately from files someone else may have edited), so anything that
/// joins one onto the data folder checks it first.
pub fn check_inside(rel: &str) -> std::result::Result<(), crate::error::Error> {
    let ok = !rel.is_empty()
        && !rel.starts_with('/')
        && !rel.contains('\\')
        && !rel.contains(':')
        && rel
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..");
    if ok {
        Ok(())
    } else {
        Err(crate::error::Error::NotAllowed(
            "That isn't inside the data folder".into(),
        ))
    }
}

/// True if `dir` already has a file or folder with this title, ignoring case.
///
/// Case is ignored because macOS treats "Sink.md" and "sink.md" as the same
/// file. A file `X.md` and a folder `X` also count as the same title.
/// `except` is a name to skip (the item being renamed).
pub fn title_taken(dir: &Path, title: &str, except: Option<&str>) -> io::Result<bool> {
    if !dir.is_dir() {
        return Ok(false);
    }
    let wanted = title.to_lowercase();
    for entry in fs::read_dir(dir)? {
        let name = entry?.file_name().to_string_lossy().into_owned();
        if Some(name.as_str()) == except {
            continue;
        }
        let entry_title = name.strip_suffix(".md").unwrap_or(&name);
        if entry_title.to_lowercase() == wanted {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Today's date, in your time zone.
pub fn today_date() -> chrono::NaiveDate {
    Local::now().date_naive()
}

/// Today's date as `YYYY-MM-DD`, in your time zone.
pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// The current time as `YYYY-MM-DD HH:MM`, used in `unsorted.md`.
pub fn now_stamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_paths_inside_the_data_folder_pass() {
        for ok in [
            "areas/Home",
            "areas/Home/Sink.md",
            ".trash/20261016-223512-Sink.md",
        ] {
            assert!(check_inside(ok).is_ok(), "{ok}");
        }
        for bad in [
            "",
            "/etc/passwd",
            "../x",
            "areas/../../x",
            "areas//Home",
            "./areas",
            "a\\b",
            "C:/x",
        ] {
            assert!(check_inside(bad).is_err(), "{bad}");
        }
    }
}
