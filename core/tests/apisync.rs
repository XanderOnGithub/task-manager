//! Sync without `git` (the Android path), against a pretend GitHub that lives in
//! memory. Each "device" is a folder; the pretend remote keeps one list of
//! commits, like a real repository does.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use task_core::apisync::{git_name, pending_changes, sync, Change, Head, Remote};
use task_core::error::{Error, Result};

/// A repository: every commit's files, newest last.
#[derive(Default)]
struct Fake {
    commits: Mutex<Vec<BTreeMap<String, Vec<u8>>>>,
    /// Files another device commits just before our next push lands.
    intruder: Mutex<Option<Vec<Change>>>,
    /// Makes the next push fail like a dropped connection.
    fail_next_push: AtomicBool,
    pushes: Mutex<usize>,
}

impl Fake {
    fn files(&self) -> BTreeMap<String, String> {
        let commits = self.commits.lock().unwrap();
        commits
            .last()
            .map(|c| {
                c.iter()
                    .map(|(p, b)| (p.clone(), String::from_utf8_lossy(b).into_owned()))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn commit(&self, changes: &[Change]) {
        let mut commits = self.commits.lock().unwrap();
        let mut files = commits.last().cloned().unwrap_or_default();
        for change in changes {
            match &change.content {
                Some(bytes) => files.insert(change.path.clone(), bytes.clone()),
                None => files.remove(&change.path),
            };
        }
        commits.push(files);
    }

    fn put(&self, path: &str, text: &str) {
        self.commit(&[Change {
            path: path.into(),
            content: Some(text.as_bytes().to_vec()),
        }]);
    }
}

impl Remote for Fake {
    fn head(&self) -> Result<Option<Head>> {
        let n = self.commits.lock().unwrap().len();
        Ok((n > 0).then(|| Head {
            commit: n.to_string(),
            tree: n.to_string(),
        }))
    }

    fn list(&self, head: &Head) -> Result<BTreeMap<String, String>> {
        let commits = self.commits.lock().unwrap();
        let files = &commits[head.commit.parse::<usize>().unwrap() - 1];
        Ok(files.iter().map(|(p, b)| (p.clone(), git_name(b))).collect())
    }

    fn read(&self, blob: &str) -> Result<Vec<u8>> {
        let commits = self.commits.lock().unwrap();
        commits
            .iter()
            .flat_map(|c| c.values())
            .find(|b| git_name(b) == blob)
            .cloned()
            .ok_or_else(|| Error::Git("no such file".into()))
    }

    fn push(&self, head: Option<&Head>, changes: &[Change], _message: &str) -> Result<Option<Head>> {
        if self.fail_next_push.swap(false, Ordering::SeqCst) {
            return Err(Error::Git("Couldn't reach GitHub.".into()));
        }
        if let Some(other) = self.intruder.lock().unwrap().take() {
            self.commit(&other);
        }
        let now = self.commits.lock().unwrap().len();
        if head.map_or(0, |h| h.commit.parse::<usize>().unwrap()) != now {
            return Ok(None); // the branch moved: not a fast-forward
        }
        self.commit(changes);
        *self.pushes.lock().unwrap() += 1;
        Ok(Some(Head {
            commit: (now + 1).to_string(),
            tree: (now + 1).to_string(),
        }))
    }
}

fn device(tmp: &Path, name: &str) -> PathBuf {
    let path = tmp.join(name);
    fs::create_dir_all(&path).unwrap();
    path
}

fn write(dir: &Path, file: &str, text: &str) {
    let path = dir.join(file);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn read(dir: &Path, file: &str) -> String {
    fs::read_to_string(dir.join(file)).unwrap()
}

fn run(dir: &Path, remote: &Fake) -> task_core::git::Outcome {
    sync(dir, remote, || ()).unwrap()
}

/// What is in a folder, apart from hidden files.
fn listing(dir: &Path) -> BTreeMap<String, String> {
    fn walk(dir: &Path, prefix: &str, out: &mut BTreeMap<String, String>) {
        for entry in fs::read_dir(dir.join(prefix)).unwrap() {
            let entry = entry.unwrap();
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let path = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            if entry.file_type().unwrap().is_dir() {
                walk(dir, &path, out);
            } else {
                out.insert(path.clone(), fs::read_to_string(dir.join(&path)).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(dir, "", &mut out);
    out
}

#[test]
fn the_first_sync_sends_the_folder_and_a_second_device_gets_it() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    let a = device(tmp.path(), "a");
    write(&a, "unsorted.md", "- 2026-10-15 22:42 milk\n");
    write(&a, "areas/Home/_index.md", "---\nid: aaaaaaaaaa\n---\n");
    write(&a, ".trash/old.md", "deleted\n");

    let out = run(&a, &remote);
    assert!(out.pushed && !out.pulled);
    // The trash and other hidden files stay on the device.
    assert_eq!(
        remote.files().keys().collect::<Vec<_>>(),
        ["areas/Home/_index.md", "unsorted.md"]
    );

    let b = device(tmp.path(), "b");
    let out = run(&b, &remote);
    assert!(out.pulled && !out.pushed);
    assert_eq!(listing(&b), listing(&a));
    // Nothing more to do on either side.
    assert!(!run(&a, &remote).pushed);
    let quiet = run(&b, &remote);
    assert!(!quiet.pulled && !quiet.pushed);
}

#[test]
fn changes_and_deletions_travel_both_ways_and_empty_folders_go() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    let a = device(tmp.path(), "a");
    let b = device(tmp.path(), "b");
    write(&a, "areas/Home/Sink/_index.md", "---\nid: aaaaaaaaaa\n---\n");
    write(&a, "areas/Home/Sink/Caulk.md", "---\nid: bbbbbbbbbb\n---\n");
    run(&a, &remote);
    run(&b, &remote);

    // A changes one file and deletes another; B adds one.
    write(
        &a,
        "areas/Home/Sink/Caulk.md",
        "---\nid: bbbbbbbbbb\nstatus: done\n---\n",
    );
    write(&b, "areas/Home/Tile.md", "---\nid: cccccccccc\n---\n");
    run(&a, &remote);
    run(&b, &remote);
    run(&a, &remote);
    assert_eq!(listing(&a), listing(&b));
    assert!(read(&b, "areas/Home/Sink/Caulk.md").contains("status: done"));
    assert!(a.join("areas/Home/Tile.md").exists());

    // B deletes the whole milestone; A follows, and no empty folder is left behind.
    fs::remove_dir_all(b.join("areas/Home/Sink")).unwrap();
    run(&b, &remote);
    run(&a, &remote);
    assert!(
        !a.join("areas/Home/Sink").exists(),
        "an empty folder would show as a milestone without details"
    );
    assert!(a.join("areas/Home").exists());
}

#[test]
fn a_real_conflict_keeps_ours_and_saves_theirs_as_a_copy() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    let a = device(tmp.path(), "a");
    let b = device(tmp.path(), "b");
    write(&a, "areas/Home/Tile.md", "---\nid: aaaaaaaaaa\n---\nbase\n");
    run(&a, &remote);
    run(&b, &remote);

    write(&a, "areas/Home/Tile.md", "---\nid: aaaaaaaaaa\n---\nfrom A\n");
    write(&b, "areas/Home/Tile.md", "---\nid: aaaaaaaaaa\n---\nfrom B\n");
    run(&a, &remote);
    let out = run(&b, &remote);

    // B keeps its own text; A's version sits beside it, without an id of its own.
    assert!(read(&b, "areas/Home/Tile.md").contains("from B"));
    assert_eq!(out.conflicts, ["areas/Home/Tile (from other computer).md"]);
    let copy = read(&b, "areas/Home/Tile (from other computer).md");
    assert!(copy.contains("from A") && !copy.contains("aaaaaaaaaa"));
    // Both are on GitHub, and A receives the copy.
    assert!(remote
        .files()
        .contains_key("areas/Home/Tile (from other computer).md"));
    run(&a, &remote);
    assert_eq!(listing(&a), listing(&b));
    // It settles: no new copies on the next rounds.
    run(&b, &remote);
    run(&a, &remote);
    assert_eq!(listing(&a).len(), 2);
}

#[test]
fn unsorted_lines_added_on_both_devices_all_survive_and_an_index_keeps_both_texts() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    let a = device(tmp.path(), "a");
    let b = device(tmp.path(), "b");
    write(&a, "unsorted.md", "- 2026-10-15 22:42 milk\n");
    write(&a, "areas/Home/_index.md", "---\nid: aaaaaaaaaa\n---\nbase\n");
    run(&a, &remote);
    run(&b, &remote);

    write(
        &a,
        "unsorted.md",
        "- 2026-10-15 22:42 milk\n- 2026-10-16 08:00 eggs\n",
    );
    write(
        &b,
        "unsorted.md",
        "- 2026-10-15 22:42 milk\n- 2026-10-16 09:00 bread\n",
    );
    write(&a, "areas/Home/_index.md", "---\nid: aaaaaaaaaa\n---\nA's text\n");
    write(&b, "areas/Home/_index.md", "---\nid: aaaaaaaaaa\n---\nB's text\n");
    run(&a, &remote);
    run(&b, &remote);
    run(&a, &remote);

    for dir in [&a, &b] {
        let unsorted = read(dir, "unsorted.md");
        assert!(
            unsorted.contains("milk") && unsorted.contains("eggs") && unsorted.contains("bread"),
            "{unsorted}"
        );
        assert_eq!(unsorted.matches("milk").count(), 1);
        let index = read(dir, "areas/Home/_index.md");
        assert!(
            index.contains("A's text") && index.contains("B's text"),
            "{index}"
        );
    }
    assert_eq!(listing(&a), listing(&b));
}

#[test]
fn a_failed_send_is_retried_without_making_a_second_copy() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    let a = device(tmp.path(), "a");
    let b = device(tmp.path(), "b");
    write(&a, "areas/Home/Tile.md", "---\nid: aaaaaaaaaa\n---\nbase\n");
    run(&a, &remote);
    run(&b, &remote);
    write(&a, "areas/Home/Tile.md", "---\nid: aaaaaaaaaa\n---\nfrom A\n");
    write(&b, "areas/Home/Tile.md", "---\nid: aaaaaaaaaa\n---\nfrom B\n");
    run(&a, &remote);

    // The connection drops while B is sending.
    remote.fail_next_push.store(true, Ordering::SeqCst);
    assert!(sync(&b, &remote, || ()).is_err());
    // The next try sends what B has and makes no further copy.
    run(&b, &remote);
    let copies = remote
        .files()
        .keys()
        .filter(|p| p.contains("from other computer"))
        .count();
    assert_eq!(copies, 1, "{:?}", remote.files().keys().collect::<Vec<_>>());
    assert!(read(&b, "areas/Home/Tile.md").contains("from B"));
}

#[test]
fn when_another_device_pushes_at_the_same_moment_the_sync_starts_again() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    let a = device(tmp.path(), "a");
    write(&a, "areas/Home/One.md", "---\nid: aaaaaaaaaa\n---\n");
    run(&a, &remote);

    write(&a, "areas/Home/Two.md", "---\nid: bbbbbbbbbb\n---\n");
    *remote.intruder.lock().unwrap() = Some(vec![Change {
        path: "areas/Home/Three.md".into(),
        content: Some(b"---\nid: cccccccccc\n---\n".to_vec()),
    }]);
    let out = run(&a, &remote);
    assert!(out.pushed && out.pulled);
    assert!(
        a.join("areas/Home/Three.md").exists(),
        "the other device's file came in"
    );
    assert!(remote.files().contains_key("areas/Home/Two.md"), "ours went out");
}

#[test]
fn nothing_from_the_network_can_write_outside_the_folder_or_into_hidden_places() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    remote.put("areas/Home/_index.md", "---\nid: aaaaaaaaaa\n---\n");
    remote.put(".git/hooks/post-merge", "#!/bin/sh\nrm -rf ~\n");
    remote.put("../escaped.md", "x");
    remote.put("/abs.md", "x");
    remote.put(".trash/a.md", "x");
    let a = device(tmp.path(), "a");
    run(&a, &remote);
    assert_eq!(listing(&a).keys().collect::<Vec<_>>(), ["areas/Home/_index.md"]);
    assert!(!a.join(".git").exists() && !tmp.path().join("escaped.md").exists());
    // And what GitHub holds in hidden places is left as it is.
    assert!(remote.files().contains_key(".git/hooks/post-merge"));
}

#[test]
fn pending_changes_counts_what_differs_from_the_last_sync() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = Fake::default();
    let a = device(tmp.path(), "a");
    write(&a, "areas/Home/One.md", "one");
    write(&a, "areas/Home/Two.md", "two");
    assert_eq!(pending_changes(&a).unwrap(), 2);
    run(&a, &remote);
    assert_eq!(pending_changes(&a).unwrap(), 0);
    write(&a, "areas/Home/One.md", "changed");
    fs::remove_file(a.join("areas/Home/Two.md")).unwrap();
    write(&a, "areas/Home/Three.md", "three");
    assert_eq!(pending_changes(&a).unwrap(), 3);
}
