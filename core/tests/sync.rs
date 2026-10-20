//! Git sync end to end: two "computers" (folders) sharing one bare repository
//! on disk, standing in for GitHub. Needs `git` installed, like the app does.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use task_core::git;

const BRANCH: &str = "main";

/// A bare repository to push to, and its address.
fn remote(dir: &Path) -> String {
    let path = dir.join("remote.git");
    let status = Command::new("git")
        .args(["init", "--bare", "-b", BRANCH])
        .arg(&path)
        .output()
        .unwrap();
    assert!(status.status.success());
    path.display().to_string()
}

fn computer(dir: &Path, name: &str) -> PathBuf {
    let path = dir.join(name);
    fs::create_dir_all(&path).unwrap();
    path
}

fn write(root: &Path, file: &str, text: &str) {
    let path = root.join(file);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn read(root: &Path, file: &str) -> String {
    fs::read_to_string(root.join(file)).unwrap()
}

#[test]
fn first_connect_pushes_the_folder_and_a_second_computer_gets_it() {
    let tmp = tempfile::tempdir().unwrap();
    let url = remote(tmp.path());
    let a = computer(tmp.path(), "a");
    write(&a, "unsorted.md", "- 2026-10-15 22:42 milk\n");
    write(&a, "areas/Home/_index.md", "---\nid: aaaaaaaaaa\n---\n");
    write(&a, ".trash/old.md", "deleted\n");

    let out = git::connect(&a, &url, BRANCH, None).unwrap();
    assert!(out.pushed);

    // A new computer with an empty folder connects to the same repository.
    let b = computer(tmp.path(), "b");
    let out = git::connect(&b, &url, BRANCH, None).unwrap();
    assert!(out.pulled);
    assert_eq!(read(&b, "unsorted.md"), "- 2026-10-15 22:42 milk\n");
    assert!(b.join("areas/Home/_index.md").exists());
    // The trash stays on the computer it was made on.
    assert!(!b.join(".trash").exists());
}

#[test]
fn changes_travel_both_ways() {
    let tmp = tempfile::tempdir().unwrap();
    let url = remote(tmp.path());
    let a = computer(tmp.path(), "a");
    write(&a, "areas/Home/_index.md", "---\nid: aaaaaaaaaa\n---\n");
    git::connect(&a, &url, BRANCH, None).unwrap();
    let b = computer(tmp.path(), "b");
    git::connect(&b, &url, BRANCH, None).unwrap();

    write(&a, "areas/Home/Sink.md", "---\nid: bbbbbbbbbb\n---\n");
    assert_eq!(git::pending_changes(&a).unwrap(), 1);
    assert!(git::sync(&a, BRANCH, None, false).unwrap().pushed);
    assert_eq!(git::pending_changes(&a).unwrap(), 0);

    let out = git::sync(&b, BRANCH, None, false).unwrap();
    assert!(out.pulled && !out.pushed);
    assert!(b.join("areas/Home/Sink.md").exists());

    // Nothing changed: nothing happens.
    let out = git::sync(&b, BRANCH, None, false).unwrap();
    assert!(!out.pulled && !out.pushed);
}

#[test]
fn unsorted_lines_added_on_both_computers_survive() {
    let tmp = tempfile::tempdir().unwrap();
    let url = remote(tmp.path());
    let a = computer(tmp.path(), "a");
    write(&a, "unsorted.md", "- 2026-10-15 22:42 milk\n");
    git::connect(&a, &url, BRANCH, None).unwrap();
    let b = computer(tmp.path(), "b");
    git::connect(&b, &url, BRANCH, None).unwrap();

    write(
        &a,
        "unsorted.md",
        "- 2026-10-15 22:42 milk\n- 2026-10-16 09:00 from the computer\n",
    );
    write(
        &b,
        "unsorted.md",
        "- 2026-10-15 22:42 milk\n- 2026-10-16 09:05 from the phone\n",
    );
    git::sync(&a, BRANCH, None, false).unwrap();
    let out = git::sync(&b, BRANCH, None, false).unwrap();

    assert!(out.conflicts.is_empty());
    let merged = read(&b, "unsorted.md");
    assert!(merged.contains("from the computer") && merged.contains("from the phone"));
    // And the other computer receives the merge.
    git::sync(&a, BRANCH, None, false).unwrap();
    assert_eq!(read(&a, "unsorted.md"), merged);
}

#[test]
fn a_real_conflict_keeps_ours_and_saves_theirs_as_a_copy() {
    let tmp = tempfile::tempdir().unwrap();
    let url = remote(tmp.path());
    let a = computer(tmp.path(), "a");
    write(&a, "areas/Home/Sink.md", "---\nid: bbbbbbbbbb\n---\nOriginal\n");
    git::connect(&a, &url, BRANCH, None).unwrap();
    let b = computer(tmp.path(), "b");
    git::connect(&b, &url, BRANCH, None).unwrap();

    write(
        &a,
        "areas/Home/Sink.md",
        "---\nid: bbbbbbbbbb\n---\nWritten on A\n",
    );
    write(
        &b,
        "areas/Home/Sink.md",
        "---\nid: bbbbbbbbbb\n---\nWritten on B\n",
    );
    git::sync(&a, BRANCH, None, false).unwrap();
    let out = git::sync(&b, BRANCH, None, false).unwrap();

    // B keeps its text; A's text is next to it, with no id of its own yet.
    assert!(read(&b, "areas/Home/Sink.md").contains("Written on B"));
    assert_eq!(out.conflicts, vec!["areas/Home/Sink (from other computer).md"]);
    let copy = read(&b, "areas/Home/Sink (from other computer).md");
    assert!(copy.contains("Written on A") && !copy.contains("id:"));
    // The merge is pushed, so A ends up with both too.
    assert!(out.pushed);
    git::sync(&a, BRANCH, None, false).unwrap();
    assert!(a.join("areas/Home/Sink (from other computer).md").exists());
}

#[test]
fn disconnect_keeps_the_files() {
    let tmp = tempfile::tempdir().unwrap();
    let url = remote(tmp.path());
    let a = computer(tmp.path(), "a");
    write(&a, "unsorted.md", "- x\n");
    git::connect(&a, &url, BRANCH, None).unwrap();
    git::disconnect(&a).unwrap();
    assert_eq!(read(&a, "unsorted.md"), "- x\n");
    // Syncing without a remote fails with a message instead of panicking.
    assert!(git::sync(&a, BRANCH, None, false).is_err());
}
