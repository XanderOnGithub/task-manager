//! How long does loading take with a big data folder?
//!
//! Run it with:
//!
//! ```sh
//! cargo run --release -p task-core --example bench
//! cargo run --release -p task-core --example bench -- 50000   # other sizes
//! ```
//!
//! It builds a fake data folder in a temp directory (areas → projects →
//! milestones → tasks, plus pages with long bodies), then times `Library::load`.
//! The numbers include the operating system's file cache being warm, which is
//! the normal case for an app you open more than once.

use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

use task_core::{ops, Kind, Library};

fn main() {
    let tasks: usize = std::env::args()
        .nth(1)
        .and_then(|n| n.parse().ok())
        .unwrap_or(10_000);
    let dir = tempfile::tempdir().expect("temp dir");
    let root = dir.path();

    let start = Instant::now();
    let (files, folders) = generate(root, tasks);
    println!(
        "Generated {files} files in {folders} folders in {:?}",
        start.elapsed()
    );

    // Load several times and report the typical (median) and worst run.
    let mut runs: Vec<Duration> = (0..7)
        .map(|_| {
            let start = Instant::now();
            let lib = Library::load(root).expect("load");
            let took = start.elapsed();
            assert!(
                lib.issues.is_empty(),
                "{:?}",
                &lib.issues[..lib.issues.len().min(3)]
            );
            took
        })
        .collect();
    runs.sort();
    let lib = Library::load(root).unwrap();
    println!("Loaded {} items", lib.items.len());
    println!("  median: {:?}", runs[runs.len() / 2]);
    println!("  slowest: {:?}", runs[runs.len() - 1]);

    // The app reloads after every change, so time a full change + reload too.
    let milestone = lib
        .items
        .iter()
        .find(|i| i.kind == Kind::Milestone)
        .unwrap()
        .id
        .clone();
    let start = Instant::now();
    ops::create(&lib, Kind::Task, Some(&milestone), "One more task", "").unwrap();
    let _ = Library::load(root).unwrap();
    println!("Create a task + reload: {:?}", start.elapsed());
}

/// Writes `tasks` task files, spread as 10 areas × 10 projects × N milestones,
/// plus one page with a 20 KB body for every 10 tasks (in the first area). Returns (files, folders).
fn generate(root: &Path, tasks: usize) -> (usize, usize) {
    let per_milestone = 10;
    let milestones_total = tasks.div_ceil(per_milestone);
    let per_project = milestones_total.div_ceil(100).max(1);
    let long_body = "Lorem ipsum dolor sit amet. ".repeat(700); // ~20 KB
    let keys = task_core::order::keys_after(None, per_milestone);

    let mut files = 0;
    let mut folders = 0;
    let mut written = 0;
    let mut n = 0;
    let mut next_id = || {
        n += 1;
        format!("B{n:09}")
    };

    'areas: for a in 0..10 {
        let area = root.join(format!("areas/Area {a}"));
        index(&area, &next_id(), None);
        (files, folders) = (files + 1, folders + 1);
        for p in 0..10 {
            let project = area.join(format!("Project {p}"));
            index(&project, &next_id(), Some("active"));
            (files, folders) = (files + 1, folders + 1);
            for m in 0..per_project {
                let milestone = project.join(format!("Milestone {m}"));
                index(&milestone, &next_id(), Some("open"));
                (files, folders) = (files + 1, folders + 1);
                for (t, key) in keys.iter().enumerate() {
                    let text = format!(
                        "---\nid: {}\nstatus: todo\norder: {}\ncreated: 2026-10-16\n---\nA short description.\n",
                        next_id(),
                        key
                    );
                    fs::write(milestone.join(format!("Task {t}.md")), text).unwrap();
                    files += 1;
                    written += 1;
                    if written == tasks {
                        break 'areas;
                    }
                }
            }
        }
    }

    let pages = root.join("areas/Area 0/Pages");
    fs::create_dir_all(&pages).unwrap();
    folders += 1;
    for i in 0..tasks / 10 {
        let text = format!("---\nid: {}\ncreated: 2026-10-16\n---\n{long_body}\n", next_id());
        fs::write(pages.join(format!("Page {i}.md")), text).unwrap();
        files += 1;
    }
    (files, folders)
}

fn index(folder: &Path, id: &str, status: Option<&str>) {
    fs::create_dir_all(folder).unwrap();
    let status = status.map(|s| format!("status: {s}\n")).unwrap_or_default();
    fs::write(folder.join("_index.md"), format!("---\nid: {id}\n{status}---\n")).unwrap();
}
