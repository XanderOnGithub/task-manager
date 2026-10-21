//! Small file-system helpers shared by the write operations.

use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

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
    // A name of its own, so two saves of the same file (or a save and a sync)
    // never write into the same temporary file. Still `.name.<n>.tmp`, which
    // the watcher and the backups both ignore.
    let temp = dir.join(format!(
        ".{name}.{}-{}.tmp",
        std::process::id(),
        TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    let result = (|| {
        let mut file = fs::File::create(&temp)?;
        file.write_all(contents.as_bytes())?;
        // Without this, a power cut right after the rename can leave the new
        // name pointing at a file whose contents never reached the disk: empty.
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
        return result;
    }
    // Make the rename itself survive a power cut too (Unix only; best effort).
    #[cfg(unix)]
    if let Ok(dir) = fs::File::open(dir) {
        let _ = dir.sync_all();
    }
    Ok(())
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Reads a file (`""` if it doesn't exist yet), lets `change` turn its text into
/// the new text, and saves that atomically, unless the file changed on disk in
/// the meantime (an editor, a sync): then it starts again from the new text, so
/// an outside edit is not overwritten with a change based on the old one.
/// After a few tries it gives up with an error instead of overwriting.
pub fn modify_atomic<E: From<io::Error>>(
    path: &Path,
    mut change: impl FnMut(&str) -> Result<String, E>,
) -> Result<(), E> {
    let read = || match fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e),
    };
    for _ in 0..3 {
        let before = read()?;
        let after = change(&before)?;
        if read()? == before {
            write_atomic(path, &after)?;
            return Ok(());
        }
    }
    Err(io::Error::other("The file keeps changing. Try again in a moment.").into())
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

#[cfg(test)]
mod atomic_tests {
    use super::*;

    #[test]
    fn a_save_leaves_only_the_file_and_never_a_temporary() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Task.md");
        write_atomic(&path, "one").unwrap();
        write_atomic(&path, "two").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "two");
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![std::ffi::OsString::from("Task.md")]);
    }

    #[test]
    fn a_failed_save_leaves_the_old_file_and_no_temporary() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Task.md");
        fs::write(&path, "keep me").unwrap();
        // A folder can't be replaced by a file: the rename fails.
        let blocked = dir.path().join("Folder");
        fs::create_dir(&blocked).unwrap();
        assert!(write_atomic(&blocked, "x").is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "keep me");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2);
    }

    #[test]
    fn a_change_made_elsewhere_during_an_edit_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Task.md");
        fs::write(&path, "a").unwrap();
        let mut calls = 0;
        modify_atomic(&path, |text| {
            calls += 1;
            if calls == 1 {
                // An editor saves while we are working on the old text.
                fs::write(&path, "a + typed elsewhere").unwrap();
            }
            Ok::<_, io::Error>(format!("{text}!"))
        })
        .unwrap();
        assert_eq!(calls, 2);
        assert_eq!(fs::read_to_string(&path).unwrap(), "a + typed elsewhere!");
    }

    #[test]
    fn a_file_that_never_stops_changing_is_an_error_not_an_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Task.md");
        fs::write(&path, "0").unwrap();
        let mut n = 0;
        let result = modify_atomic(&path, |text| {
            n += 1;
            fs::write(&path, format!("{n}")).unwrap();
            Ok::<_, io::Error>(format!("{text}x"))
        });
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "3");
    }
}
