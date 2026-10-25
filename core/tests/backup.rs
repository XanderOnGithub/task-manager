//! Backups: zip the data folder, restore it, and never write outside it.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use task_core::backup::{self, Kind};

/// A data folder with a few files, a `.git` folder and some noise.
fn data_folder(dir: &Path) -> PathBuf {
    let root = dir.join("data");
    fs::create_dir_all(root.join("areas/Home/Bath")).unwrap();
    fs::create_dir_all(root.join(".git")).unwrap();
    fs::write(root.join("unsorted.md"), "- 2026-10-15 22:42 milk\n").unwrap();
    fs::write(root.join("areas/Home/_index.md"), "---\nid: AAAAAAAAAA\n---\n").unwrap();
    fs::write(
        root.join("areas/Home/Bath/Tile.md"),
        "---\nid: BBBBBBBBBB\n---\nGrout too\n",
    )
    .unwrap();
    fs::write(root.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
    fs::write(root.join(".DS_Store"), "x").unwrap();
    fs::write(root.join("areas/Home/.Tile.md.tmp"), "half a save").unwrap();
    root
}

fn names(zip: &Path) -> Vec<String> {
    let mut archive = zip::ZipArchive::new(File::open(zip).unwrap()).unwrap();
    let mut out: Vec<String> = (0..archive.len())
        .map(|i| archive.by_index(i).unwrap().name().to_owned())
        .collect();
    out.sort();
    out
}

#[test]
fn a_backup_holds_the_files_but_not_git_or_temporary_files() {
    let tmp = tempfile::tempdir().unwrap();
    let root = data_folder(tmp.path());
    let backups = tmp.path().join("backups");

    let made = backup::create(&root, &backups, Kind::Manual).unwrap();
    assert!(made.file_name.ends_with("(manual).zip"), "{}", made.file_name);
    assert!(made.bytes > 0);
    assert_eq!(
        names(&made.path),
        ["areas/Home/Bath/Tile.md", "areas/Home/_index.md", "unsorted.md"]
    );

    let listed = backup::list(&backups);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].kind, Kind::Manual);
    assert_eq!(listed[0].file_name, made.file_name);
    // No half-written leftovers.
    assert!(fs::read_dir(&backups).unwrap().all(|e| !e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .ends_with(".tmp")));
}

#[test]
fn restoring_brings_the_files_back_keeps_git_and_saves_what_was_there() {
    let tmp = tempfile::tempdir().unwrap();
    let root = data_folder(tmp.path());
    let backups = tmp.path().join("backups");
    let made = backup::create(&root, &backups, Kind::Manual).unwrap();

    // Things go wrong afterwards: an edit, a deletion, a new file.
    fs::write(
        root.join("areas/Home/Bath/Tile.md"),
        "---\nid: BBBBBBBBBB\n---\nOops\n",
    )
    .unwrap();
    fs::remove_file(root.join("unsorted.md")).unwrap();
    fs::write(root.join("areas/Home/Extra.md"), "added later").unwrap();

    let safety = backup::restore(&made.path, &root, &backups).unwrap();

    assert_eq!(
        fs::read_to_string(root.join("unsorted.md")).unwrap(),
        "- 2026-10-15 22:42 milk\n"
    );
    assert!(fs::read_to_string(root.join("areas/Home/Bath/Tile.md"))
        .unwrap()
        .contains("Grout too"));
    assert!(
        !root.join("areas/Home/Extra.md").exists(),
        "files that weren't in the backup go"
    );
    assert_eq!(
        fs::read_to_string(root.join(".git/HEAD")).unwrap(),
        "ref: refs/heads/main\n",
        ".git stays"
    );
    // What was there before is saved, so even a restore can be undone.
    assert_eq!(safety.kind, Kind::BeforeRestore);
    assert!(names(&safety.path).contains(&"areas/Home/Extra.md".to_string()));
    // No temporary folder left beside the data folder.
    assert!(fs::read_dir(tmp.path()).unwrap().all(|e| !e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".moss-restore")));
}

/// A zip with the given entries, written by hand.
fn zip_with(path: &Path, entries: &[(&str, &str)]) {
    let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
    for (name, text) in entries {
        zip.start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(text.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
}

#[test]
fn a_zip_that_is_not_a_backup_or_reaches_outside_the_folder_changes_nothing() {
    let tmp = tempfile::tempdir().unwrap();
    let root = data_folder(tmp.path());
    let backups = tmp.path().join("backups");
    let before = fs::read_to_string(root.join("unsorted.md")).unwrap();

    for (label, entries) in [
        ("some other zip", vec![("notes.txt", "hello")]),
        ("zip slip", vec![("unsorted.md", "x"), ("../escaped.md", "bad")]),
        (
            "absolute path",
            vec![("unsorted.md", "x"), ("/tmp/escaped.md", "bad")],
        ),
        (
            "git hook",
            vec![("unsorted.md", "x"), (".git/hooks/post-checkout", "#!/bin/sh")],
        ),
        ("nested git folder", vec![("areas/Home/.git/config", "[core]")]),
        ("empty", vec![]),
    ] {
        let zip = tmp.path().join("odd.zip");
        zip_with(&zip, &entries);
        assert!(backup::restore(&zip, &root, &backups).is_err(), "{label}");
        assert_eq!(
            fs::read_to_string(root.join("unsorted.md")).unwrap(),
            before,
            "{label}: untouched"
        );
        assert!(
            backup::list(&backups).is_empty(),
            "{label}: no safety backup for a refused zip"
        );
    }
    assert!(!tmp.path().join("escaped.md").exists());
    // A file that isn't a zip at all is an error, not a crash.
    let junk = tmp.path().join("junk.zip");
    fs::write(&junk, "not a zip").unwrap();
    assert!(backup::restore(&junk, &root, &backups).is_err());
}

#[test]
fn pruning_keeps_the_newest_and_never_touches_manual_backups_or_other_files() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    for day in 1..=20 {
        fs::write(
            dir.join(format!("Moss backup 2026-09-{day:02} 10-00-00.zip")),
            "x",
        )
        .unwrap();
    }
    for day in 1..=8 {
        fs::write(
            dir.join(format!(
                "Moss backup 2026-08-{day:02} 10-00-00 (before restore).zip"
            )),
            "x",
        )
        .unwrap();
    }
    fs::write(dir.join("Moss backup 2026-01-01 10-00-00 (manual).zip"), "x").unwrap();
    fs::write(dir.join("holiday photos.zip"), "x").unwrap();
    fs::write(dir.join("Moss backup nonsense.zip"), "x").unwrap();

    let removed = backup::prune(dir).unwrap();
    assert_eq!(removed, 6 + 3);
    let left: Vec<_> = backup::list(dir);
    assert_eq!(left.iter().filter(|b| b.kind == Kind::Automatic).count(), 14);
    assert_eq!(left.iter().filter(|b| b.kind == Kind::BeforeRestore).count(), 5);
    assert_eq!(left.iter().filter(|b| b.kind == Kind::Manual).count(), 1);
    // The oldest automatic ones are the ones that went.
    assert!(!dir.join("Moss backup 2026-09-01 10-00-00.zip").exists());
    assert!(dir.join("Moss backup 2026-09-20 10-00-00.zip").exists());
    assert!(dir.join("holiday photos.zip").exists());
    assert!(dir.join("Moss backup nonsense.zip").exists());
}

#[test]
fn listing_a_missing_folder_is_empty_and_the_newest_comes_first() {
    let tmp = tempfile::tempdir().unwrap();
    assert!(backup::list(&tmp.path().join("nope")).is_empty());
    fs::write(tmp.path().join("Moss backup 2026-10-01 08-00-00.zip"), "x").unwrap();
    fs::write(tmp.path().join("Moss backup 2026-10-02 08-30-00.zip"), "x").unwrap();
    let listed = backup::list(tmp.path());
    assert_eq!(listed[0].when, "2026-10-02 08:30");
    assert_eq!(listed[1].when, "2026-10-01 08:00");
}
