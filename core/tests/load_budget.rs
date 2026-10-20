//! A speed limit for loading, so a change that makes it much slower fails a test
//! instead of being noticed months later. The real numbers come from
//! `cargo run --release -p task-core --example bench` (about 65 ms for 12,000
//! items). Tests run unoptimized and on shared machines, so the limit here is
//! generous: it catches "ten times slower", not "ten percent".

use std::fs;
use std::time::Instant;

use task_core::Library;

#[test]
fn loading_three_thousand_tasks_stays_fast() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    fs::create_dir_all(root.join("areas/Home")).unwrap();
    fs::write(root.join("areas/Home/_index.md"), "---\nid: AREA000001\n---\n").unwrap();
    let keys = task_core::order::keys_after(None, 100);
    for project in 0..30 {
        let folder = root.join(format!("areas/Home/Project {project}"));
        fs::create_dir_all(&folder).unwrap();
        fs::write(
            folder.join("_index.md"),
            format!("---\nid: PRJ{project:07}\nstatus: active\n---\n"),
        )
        .unwrap();
        for task in 0..100 {
            fs::write(
                folder.join(format!("Task {task}.md")),
                format!(
                    "---\nid: T{project:03}{task:06}\nstatus: todo\norder: {}\n---\nBody {task}\n",
                    keys[task]
                ),
            )
            .unwrap();
        }
    }

    let started = Instant::now();
    let library = Library::load(root).unwrap();
    let took = started.elapsed();

    assert!(library.issues.is_empty(), "{:?}", library.issues);
    assert_eq!(
        library
            .items
            .iter()
            .filter(|i| i.kind == task_core::Kind::Task)
            .count(),
        3000
    );
    assert!(took.as_millis() < 3000, "loading 3,000 tasks took {took:?}");
}
