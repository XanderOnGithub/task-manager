# Task app

Local-first desktop app for tasks and notes: capture first into Unsorted, then sort into a strict hierarchy. Built with Tauri (thin Rust core) and React + Vite, on macOS. Also a portfolio piece focused on interaction polish.

## UI reference

- **Design canvas (source of truth for how things look):** https://claude.ai/artifact/KzQtgpMaAZzU125wasr7pt
  - List view, Board view, Milestone opened in List view
  - Unsorted flow: nothing open → Create as → choose destination (task / note / project) → moved with undo
  - Picks: icons, type scale, color tokens
- Read the canvas before building or changing any screen. If code and canvas disagree, ask which one is right; don't silently pick.
- All colors, radii, type sizes and fonts come from `src/styles/tokens.css`. Never hard-code a color in a component (no hex, no `bg-[#...]`). If the canvas changes a value, change it in tokens.css.

## Repo layout

```
core/           task-core: the file format. Load, validate, write. No Tauri; fully tested.
  src/          one module per job (see core/src/lib.rs for the map)
  tests/        end-to-end tests against a copy of sample-data/
  examples/     bench.rs: loading benchmark (10k tasks by default)
src-tauri/      the desktop app: Tauri commands that call into core
  src/lib.rs    every command the UI can call
src/            React front end
  lib/api.ts    typed wrappers for the commands. Keep in sync with src-tauri/src/lib.rs
  styles/       app.css (entry), tokens.css (Tailwind theme), base.css, motion.css
sample-data/    the renovation example from the mockups; dev builds open a copy of it
```

## Commands

- `pnpm tauri dev`: run the app (dev builds open a copy of sample-data/ if no folder is set)
- `cargo test -p task-core`: core tests
- `cargo run --release -p task-core --example bench`: loading benchmark
- `cargo clippy --workspace --all-targets` and `cargo fmt --all`: lint and format Rust
- `pnpm lint` and `pnpm build`: lint and type-check the front end

## Rules for the code

- All file reading and writing goes through `core`. The front end never touches files directly.
- Writes don't update the in-memory library. The app drops its cache and reloads; files are the single source of truth.
- Problems in the data folder become `Issue`s, never crashes. Only id-related issues are fixed automatically.
- Every change to core behavior gets a test in `core/tests/data_folder.rs` or next to the code.

## Styling

- Tailwind v4. Style in JSX with classes; the theme in `tokens.css` defines every class name.
- Colors: `bg-panel`, `bg-raised`, `bg-card`, `bg-hover`, `bg-selected`, `text-fg`, `text-fg-2`, `text-fg-3`, `border-border`, `text-accent`, `bg-accent text-on-accent`, status `text-todo|doing|done`, dates `text-due|due-soon|overdue`, `text-danger`. Tailwind's default palette is switched off.
- Type: `text-title`, `text-heading`, `text-body`, `text-meta`, `text-label` (each sets size, line height and weight). Mono: `font-mono`.
- Shape: `rounded-window|panel|card|row|control|chip`; sizes `h-row`, `w-sidebar`, `w-details`; shadows `shadow-window|menu|seg|card`.
- Milestone chips: `milestone-chip` (+ `milestone-chip-header`) with `style={{ '--ms': 'var(--color-ms-teal)' }}`.
- Motion: transitions in Tailwind with `ease-snappy` or `ease-pop`; keyframe animations live in `motion.css` as `animate-*`. Reduce motion is handled globally.
- Repeated class lists become small components (`<Chip>`, `<Row>`), not `@apply`.

## Vocabulary (fixed, never use synonyms in UI or code)

- **Unsorted**: raw capture, emptied regularly. Icon: Lucide `layers`. Sidebar button: "Quick capture" (⌘N).
- **Area**: ongoing part of life, no end.
- **Project**: goal with a finish line, inside one Area.
- **Milestone**: optional checkpoint inside a Project.
- **Task**: one concrete action, one sitting.
- **Note**: a documentation page.

## Data on disk (must stay human-readable)

```
data/
├── unsorted.md                    one item per line: "- 2026-10-15 22:42 text"
├── tasks/<Area>/_index.md
│   └── <Project>/_index.md
│       ├── <Milestone>/_index.md
│       │   └── <Task>.md
│       └── <Task>.md              (only if the project has no milestones)
└── notes/<Page>.md  or  <Page>/_index.md + subpages
```

- Folders are containers, files are leaves. `_index.md` holds a folder's own frontmatter and body.
- Type comes from location, title is the filename (block `/` and `:`), parent is the containing folder.
- A project's children are all milestones or all tasks, never mixed.
- Frontmatter: `id` (10-char random id, never changes), `status`, `order` (fractional index key), `created`, optional `due`, `color` (milestones only, stored by name: `dusty-blue`, `mauve`, `rose`, `teal`, `lavender`, `sand`).
- Statuses: task `todo|doing|done`, milestone `open|done`, project `active|paused|done|dropped`.
- Done items stay in place. Startup reads frontmatter only into an in-memory index; a file watcher keeps it current.

## Language rules (all UI copy)

- Plain and direct: say what the thing is or what happens. "Add an item", "Choose a page", "Moved to Replace the sink".
- Sentence case.
- No personality lines: no jokes, pep talk, exclamation marks or slogans.
- Address the action, not the person: "Choose an area", not "Where do you want to put this?"
- Use the fixed vocabulary.
- Confirmations: short, past tense, name the destination, offer undo. "Moved to …", "Deleted … · Undo".

## Look (summary)

- Icons: Lucide (`lucide-react`), 16px, stroke 1.75.
- Fonts: Geist for everything; Geist Mono only for shortcuts and paths.
- Sage accent marks selection, progress and Done. Status is always a circle: Todo gray, Doing amber, Done sage.
- Milestones are tinted chips (muted fill + matching border, no icon), using the milestone palette.
- Due dates: calendar icon; gray normally, muted amber when due soon, muted red when overdue.
- Window vibrancy on sidebar and background only; content panels are solid and rounded.
- No file paths in the UI. Every item's ⋯ menu has Reveal in Finder, Copy path, Rename, Delete.

## Build order

M1 file format + Rust core + 10k-file benchmark → M2 app shell + tokens → M3 Unsorted (start using the app here) → M4 hierarchy lists → M5 drag and drop + Board → M6 notes editor (plain text + preview first). v1 is only Unsorted, the hierarchy and notes. Budget: a few weekends.

## Working with me

- I don't know Rust yet. Keep the Rust core small and heavily commented so I can learn from it.
- I write the front end myself; review and suggest rather than rewriting whole components unless I ask.
