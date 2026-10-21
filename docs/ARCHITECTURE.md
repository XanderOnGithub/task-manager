# How Moss is built

Moss is a Tauri app: a small Rust program that owns the files, and a React front end that draws everything. This page is the map. For the rules and house style, see [CONTRIBUTING.md](CONTRIBUTING.md); for the two parts that are easy to get wrong, see [SYNC.md](SYNC.md) and [ACCESSIBILITY.md](ACCESSIBILITY.md).

## The one idea

**The files are the truth.** Nothing in memory is authoritative. The app reads the folder, shows it, and when you change something it writes the file, drops what it had in memory and reads again. The same is true for changes made by Finder, a text editor or a Git sync: the folder watcher notices and the app reloads. That is why there is no "sync" code in the UI, only in Rust: from the UI's point of view a pull is just another outside edit.

```
 React (src/)  ──invoke──▶  Tauri commands (src-tauri/)  ──calls──▶  task-core (core/)  ──▶  files
      ▲                              │                                    │
      └────── data-changed ──────────┴──────────── watcher ◀──────────────┘
```

## Three layers

| Layer | Folder | Knows about | Never knows about |
| --- | --- | --- | --- |
| **core** | `core/` | the file format, validation, Git, GitHub's API | Tauri, windows, the UI |
| **desktop app** | `src-tauri/` | commands, settings, the window, the keychain, when to sync | how a task file is laid out |
| **front end** | `src/` | what to draw and what the keys do | files (it asks Rust for everything) |

`core` has no UI and is tested on its own (`cargo test -p task-core`). The desktop crate is deliberately thin: each command finds the data folder, calls `core`, and turns the error into a sentence a person can read.

## core (`core/src`)

One module per job. `lib.rs` has the map. The two big ones are folders, one file per action:

- `git/` — Git sync: `connect`, `disconnect`, `status`, `commit`, `sync`, `merge`, `conflict`, plus `command` (how `git` is run) and `repo` (small questions). See [SYNC.md](SYNC.md).
- `github.rs` — signing in (device flow), listing and creating repositories.
- `library.rs` loads the folder into memory (frontmatter only, so 10,000 tasks load in about 70 ms). Problems become `Issue`s, never crashes.
- `ops.rs` — create, rename, move, set a field, write a body, trash, restore. Every write is atomic (`fsutil::write_atomic`: a temporary file, then a rename).
- `backup/` — zip backups of the data folder, one file per action: `create`, `list`, `prune`, `restore`.
- `repeat.rs` — the repeat grammar and the next due date.
- `trash.rs`, `unsorted.rs`, `search.rs`, `migrate.rs`, `names.rs` (title rules, including what Windows can't store), `order.rs` (fractional ordering keys), `watch.rs`.

Rules that every contributor to `core` follows:

- **A change to behavior gets a test**, in `core/tests/` (end to end, against a copy of `sample-data/`) or next to the code.
- **Paths from outside are checked** (`fsutil::check_inside`) before they are joined onto the data folder.
- **Nothing is overwritten that the person might still want.** A name collision picks another name; a Git conflict keeps both versions.

## The desktop app (`src-tauri/src`)

```
lib.rs          plugins, startup, the list of commands. Composition only.
state.rs        AppState, the two locks, and the read / write helpers every command uses
settings.rs     settings.json
folder.rs       opening a data folder: tidy it, watch it
commands/       every command the UI can call, one file per job
backup/         backups: where they live, the daily thread, commands (one file per action)
sync/           Git sync glue: one file per action (see SYNC.md)
```

### The two locks

- `AppState::folder` is held while **anything changes files**: a command's save, the housekeeping in `load_library`, and the local steps of a Git sync (commit and merge). A save can never land in the middle of a merge.
- `AppState::data` guards the cached library and the watcher. It is quick to take.

Always take `folder` first, then `data`. Git's slow steps (fetch and push, which use the network) run without either.

## The front end (`src`)

```
app/         composition: loading the library, every action the UI can take, requests between views
domain/      what the data means: the item index, dates, lanes, links between pages. No React, no IPC.
platform/    the outside world: the typed Tauri wrappers (api.ts), preferences, theme, updates, OS facts
sound/       the sounds
shared/      pieces used by many features: controls, ui, motion, toast, confirm, drag, a11y helpers
features/    one folder per part of the app: capture, editor, issues, navigation, onboarding,
             pages, search, settings, sync, tasks, trash
styles/      tokens.css (every color, size and radius), base, motion, editor
```

A feature may use `shared`, `domain`, `platform` and `app`. `shared` and `domain` never import from a feature. When two features need the same thing, it moves to `shared` or `domain`.

### The index

`domain/items.ts` answers "what is inside this project?" from an index built once per library (`WeakMap` keyed by the `items` array). The library hands out the same array until something changes (`app/share.ts` keeps unchanged items as the same objects), so a screen can ask thousands of questions per render for the price of one pass. Don't change the arrays it returns.

### Text: loading, saving, outside edits

Bodies (the text under the frontmatter) are not in the snapshot.

- **Reading** (`features/editor/useBody.ts`): a failed read is an error with a "Try again" button, never an empty editor, because an empty editor lets the next edit replace the real text.
- **Saving** (`features/editor/saveQueue.ts`): the editor hands every edit to a queue. It writes one at a time, in order, keeps text that failed to save and retries, and only counts text as saved after the write succeeds. Closing the window flushes it.
- **Outside edits** (`features/editor/bodyChanges.ts`): `data-changed` carries the paths that changed. An open page re-reads its text when its own file is among them, unless it has unsaved text of its own (that wins).

Saving a body does not reload the library: text isn't in it.

## Where to look when…

| You want to… | Start at |
| --- | --- |
| add a command the UI can call | `src-tauri/src/commands/`, then `src/platform/api.ts`, then register it in `lib.rs` |
| add something the UI can do | `src/app/useActions.ts` |
| change how a file is written | `core/src/ops.rs` and its test |
| add a setting | `features/settings/`, `platform/prefs.ts` |
| change a color or size | `src/styles/tokens.css` (and run `pnpm test`: a test checks text contrast) |
| add a dialog, menu or control | `src/shared/controls/`, read [ACCESSIBILITY.md](ACCESSIBILITY.md) first |
