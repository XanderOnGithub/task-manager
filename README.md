<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/wordmark-dark.svg">
    <img src="brand/wordmark-light.svg" alt="Moss" height="56">
  </picture>
</h1>

A local-first desktop app for tasks and pages. Capture anything into **Unsorted**, then sort it into a strict hierarchy: **Area → Project → Milestone → Task**, with **Pages** kept right next to the area or project they're about.

Everything is stored as plain markdown files in a folder you choose, laid out so it reads well in Finder:

```
data/
├── unsorted.md
└── areas/
    └── Home/
        └── Renovate the house/
            ├── Pages/
            │   └── Kitchen measurements.md
            └── Replace the sink/
                └── Install new sink.md
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

Loading 10,000 tasks (plus 1,000 pages with 20 KB bodies) takes about 70 ms, because only the frontmatter of each file is read.

On macOS, Settings includes an opt-in native refresh-rate switch for ProMotion
displays. It uses `tauri-plugin-macos-fps` to unlock rendering above 60fps; the
switch remains off by default to avoid unnecessary battery use.

## Releases

Bump `version` in `src-tauri/tauri.conf.json`, then push a tag:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

GitHub Actions (`.github/workflows/release.yml`) builds installers for macOS
(Apple silicon and Intel), Windows and Linux and puts them in a draft release.
Review it on GitHub and press Publish. The builds aren't code-signed yet, so
macOS asks you to right-click → Open the first time and Windows SmartScreen warns.
