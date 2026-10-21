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

No account, no database. Point any folder sync at it, or let Moss keep it in a GitHub repository (Settings → Sync) to use it on more than one machine.

Built with [Tauri](https://tauri.app) (Rust) and React.

## A quick look

**Quick capture.** ⌘N from anywhere, type, Enter. It goes to Unsorted.

<img src="media/readme/quick-capture.gif" alt="Pressing ⌘N, typing a thought and pressing Enter adds it to Unsorted" width="100%">

**Unsorted.** Open an item, choose what it becomes and where it goes. The next one opens so you can keep going.

<img src="media/readme/unsorted.gif" alt="Filing an Unsorted item as a task in the Replace the sink milestone" width="100%">

**Dates and repeats.** Type "call Bob friday" in Quick capture and the task gets that due date. A task can repeat ("weekly", "every 2 weeks"); finishing it sets the next date. Today lists what is due across every area.

**Fun, if you want it.** Settings → Fun: typing sounds, fuller sounds for Done, Doing and Waiting, and tiny particles. All off until you turn them on.

**Dependencies.** A task can wait on other tasks. It shows "Waiting on …" with a lock until they are done.

**Bulk sort.** Tick several Unsorted items and file them to one place at once.

**Backups.** Moss zips your data folder about once a day. Settings → Backups restores any of them, or a zip you pick.

**Tasks.** Each area, project and milestone has a List and a Board. Drag cards between statuses.

<img src="media/readme/tasks.gif" alt="Finishing a task in List view, then dragging a card to Doing on the Board" width="100%">

**Pages.** Rich text on screen, plain markdown on disk. Type "/" for headings, lists, checklists, tables and subpages.

<img src="media/readme/pages.gif" alt="Adding a checklist to a page with the / menu and ticking an item" width="100%">

## Installing

Download the latest build from [Releases](https://github.com/XanderOnGithub/task-manager/releases/latest).

- **macOS:** open the `.dmg` (`aarch64` for Apple silicon, `x64` for Intel) and drag Moss to Applications. Moss isn't signed with an Apple Developer ID yet, so the first time macOS says it can't be opened: go to System Settings → Privacy & Security and click **Open Anyway**.
- **Windows:** run the `-setup.exe` or the `.msi` (stick with the same one when you reinstall). If SmartScreen warns, click **More info → Run anyway**. The `_portable.exe` runs without installing.
- **Linux:** the `.AppImage`, `.deb` or `.rpm`.

From 0.1.2 on, Moss updates itself: when a new version is out, **Update to …** appears in the sidebar (or use **Check for updates** in Settings). The portable `.exe`, `.deb` and `.rpm` don't update themselves; download those again.

## Development

Requirements: Rust (stable), Node 22, pnpm 10, and on macOS the Xcode command line tools.

```sh
pnpm install
pnpm tauri dev
```

The first dev run opens a copy of `sample-data/`, so there's something to look at.

```sh
cargo test --workspace                                   # Rust tests
pnpm test                                                # front end tests
pnpm lint && pnpm build                                  # lint (with accessibility checks) and type-check
cargo run --release -p task-core --example bench         # loading benchmark
```

How it is put together, how Git sync works, and what keeps it accessible: [docs/](docs/).

Loading 10,000 tasks (plus 1,000 pages with 20 KB bodies) takes about 70 ms, because only the frontmatter of each file is read.

On macOS, Settings includes an opt-in native refresh-rate switch for ProMotion
displays. It uses `tauri-plugin-macos-fps` to unlock rendering above 60fps; the
switch remains off by default to avoid unnecessary battery use.

## Branches and releases

Moss is in **alpha**. Nothing is pushed to `main` directly:

```
feature/…  fix/…  refactor/…   →  pull request into the current release branch
release/alpha-0.1              →  pull request into main when it's ready to ship
main                           →  every merge with a new version is released
```

When a new version lands on `main`, GitHub Actions (`.github/workflows/release.yml`)
builds installers for macOS (Apple silicon and Intel), Windows and Linux and
publishes them as a GitHub Release named after the version ("Moss alpha 0.1.0"),
with notes made from the merged pull requests. Pushes to `main` that don't
change the version build nothing.

To start the next version, branch `release/alpha-0.2` from `main` and bump
`version` in `src-tauri/tauri.conf.json`, `package.json` and both `Cargo.toml`
files there. The stage (`alpha`) is `"stage"` in `package.json`.

The builds aren't signed with a Developer ID or Windows certificate yet. The
Mac app is signed ad hoc (`"signingIdentity": "-"`), so macOS offers "Open
Anyway" rather than calling it damaged; Windows SmartScreen warns. Update files
are signed separately with the updater key (see CLAUDE.md).
