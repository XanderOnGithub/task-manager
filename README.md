# Task Manager

A local-first desktop app for tasks and notes. Capture anything into **Unsorted**, then sort it into a strict hierarchy: **Area → Project → Milestone → Task**, with **Notes** alongside.

Everything is stored as plain markdown files in a folder you choose, laid out so it reads well in Finder:

```
data/
├── unsorted.md
├── tasks/
│   └── Home/
│       └── Renovate the house/
│           └── Replace the sink/
│               └── Install new sink.md
└── notes/
    └── Kitchen measurements.md
```

```markdown
---
id: TSKINSTL01
status: doing
order: t
created: 2026-10-05
due: 2026-10-17
---
Same footprint as the old one, so no counter cut.
```

No account, no database, no sync service. Point any folder sync at it if you want it on more than one machine.

Built with [Tauri](https://tauri.app) (Rust) and React.

## Development

Requirements: Rust (stable), Node 22, pnpm 10, and on macOS the Xcode command line tools.

```sh
pnpm install
pnpm tauri dev
```

The first dev run opens a copy of `sample-data/`, so there's something to look at.

```sh
cargo test -p task-core                                  # tests
cargo run --release -p task-core --example bench         # loading benchmark
```

Loading 10,000 tasks (plus 1,000 notes with 20 KB bodies) takes about 70 ms, because only the frontmatter of each file is read.

On macOS, Settings includes an opt-in native refresh-rate switch for ProMotion
displays. It uses `tauri-plugin-macos-fps` to unlock rendering above 60fps; the
switch remains off by default to avoid unnecessary battery use.
