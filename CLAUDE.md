# Moss

Moss is a local-first desktop app for tasks and pages: capture first into Unsorted, then sort into a strict hierarchy. Built with Tauri (thin Rust core) and React + Vite, on macOS. Also a portfolio piece focused on interaction polish.

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
media/          README GIFs (media/readme) and the trailer, recorded from the real app; see media/README.md
brand/          the Moss mark (icon.svg), the moss° wordmarks (wordmark.py draws them), icon-1024.png (source for `pnpm tauri icon`)
```

## Commands

- `pnpm tauri dev`: run the app (dev builds open a copy of sample-data/ if no folder is set)
- `cargo test -p task-core`: core tests
- `cargo run --release -p task-core --example bench`: loading benchmark
- `cargo clippy --workspace --all-targets` and `cargo fmt --all`: lint and format Rust
- `pnpm lint` and `pnpm build`: lint and type-check the front end
- Releases: see Branches and releases below. No Developer ID or Windows certificate yet; the Mac app is signed ad hoc (`bundle.macOS.signingIdentity: "-"`) so macOS offers Open Anyway instead of saying it's damaged.

## Branches and releases

Moss is in alpha (`"stage": "alpha"` in package.json; Settings shows "Alpha 0.1.0").
- Never commit to `main` directly. Work happens on `feature/…`, `fix/…` or `refactor/…` branches, each merged by pull request into the current release branch (now `release/alpha-0.1.4`).
- When the release branch is ready, a pull request from it into `main` ships it. `.github/workflows/release.yml` runs on every push to `main`: if the version in `src-tauri/tauri.conf.json` isn't released yet, it builds macOS (Apple silicon + Intel), Windows (installers + a portable .exe) and Linux installers and publishes "Moss alpha X.Y.Z" with notes from the PRs. Otherwise it does nothing.
- Next version: branch `release/alpha-0.2` from `main` and bump `version` in tauri.conf.json, package.json and both Cargo.toml files on it.
- In-app updates: `tauri-plugin-updater` reads `latest.json` from the newest GitHub release (`src/lib/updates.ts`; checks a few seconds after launch in real builds, "Update to X" in the sidebar, "Check for updates" in Settings). Update files are signed: the private key lives only in the repo secrets `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`, the public key in `tauri.conf.json` → `plugins.updater.pubkey`. Never commit the private key. Lose it and installed copies can't update any more.
- CI (`ci.yml`) runs on every pull request and on pushes to `main` and `release/**`.

## Rules for the code

- All file reading and writing goes through `core`. The front end never touches files directly.
- Writes don't update the in-memory library. The app drops its cache and reloads; files are the single source of truth.
- The watcher ignores reads (Linux reports every file open; counting them made each load trigger another) and the app skips the watcher's echo of its own writes for a second (`OWN_WRITE_WINDOW` in src-tauri), so one action is one reload.
- Reloads keep unchanged items as the same objects (`lib/share.ts`), and task rows and board cards are `memo`ized with their insides split from the dnd-kit wrapper, so a change redraws only the rows it touched. Keep callbacks passed to rows stable (`useCallback`), and don't create new item objects for rows.
- Problems in the data folder become `Issue`s, never crashes. Only id-related issues are fixed automatically.
- Every change to core behavior gets a test in `core/tests/data_folder.rs` or next to the code.

## Styling

- Tailwind v4. Style in JSX with classes; the theme in `tokens.css` defines every class name.
- Colors: `bg-panel`, `bg-raised`, `bg-card`, `bg-hover`, `bg-selected`, `text-fg`, `text-fg-2`, `text-fg-3`, `border-border`, `text-accent`, `bg-accent text-on-accent`, status `text-todo|doing|done`, dates `text-due|due-soon|overdue`, `text-danger`. Tailwind's default palette is switched off.
- Type: `text-title`, `text-heading`, `text-body`, `text-meta`, `text-label` (each sets size, line height and weight). Mono: `font-mono`.
- Shape: `rounded-window|panel|card|row|control|chip`; sizes `h-row`, `w-sidebar`, `w-details`; shadows `shadow-window|menu|seg|card`.
- Milestone chips: `milestone-chip` (+ `milestone-chip-header`) with `style={{ '--ms': 'var(--color-ms-teal)' }}`.
- Motion: see the Motion section below. CSS-only effects (hover color, simple fades) can use Tailwind `transition-*` with `ease-snappy`; keyframes live in `motion.css`.
- Repeated class lists become small components (`<Chip>`, `<Row>`), not `@apply`.

## Front-end structure

- `src/lib/useLibrary.ts` loads the snapshot and reloads on `data-changed`. `src/lib/useActions.ts` holds every change the UI can make (each one calls Rust, shows a toast with Undo where it makes sense, and reloads). Add new actions there, not in components.
- `src/components/controls.tsx`: InlineAdd, EditableTitle, Menu, Segmented, Modal, BodyEditor, DateField. `ui.tsx`: Panel, chips, status icon, due date, progress.
- Navigation: one sidebar tree, areas → projects → pages (`AreaTree.tsx`, one DndContext for all three; page rows in `PageTree.tsx`, page drag logic in `lib/pageDrag.ts`). Above it, three overviews: Unsorted, Tasks (every project, List/Board) and Pages (every area and project with its pages). `App.tsx` keeps what's open as an overview or an item id; opening anything unfolds the sidebar down to it.
- Task views: `ScopeView.tsx` shows everything (scope null, the Tasks overview), an area, project or milestone (breadcrumb, List/Board). List: `AreaList.tsx` (projects with their open tasks) or `ProjectList.tsx` (a project's milestones/tasks, or a milestone's tasks), then the area's or project's pages (`PageSection`). Board: `Board.tsx` for any of them. `tasksUnder()` in `lib/items.ts` collects the tasks inside anything (null = all).
- Pages: `Pages.tsx` (PageView, PagesOverview, PageSection; word count in the corner, Settings → Word count). Type `:name` for emoji (`editor/emojiShortcodes.ts`, gemoji). Shift+Enter always adds a line break (our key handler; the preset's is left out). Text: `MarkdownEditor.tsx` (Milkdown) for pages and every description. Rich text on screen, plain markdown on disk ("-" bullets, no `<br />`), saved only after a real edit. Extra blank lines stay as plain blank lines in the file: the editor shows each as an empty `&nbsp;` paragraph (`toEditor` on load, `normalize(…, true)` on save in `MarkdownEditor.tsx`). Styles in `styles/editor.css`. Loaded lazily.
- First launch: `Onboarding.tsx` (welcome, then the data folder: Documents/Moss or any folder, optionally with the example). The example is `sample-data/`, built into the app binary (`include_dir!` in src-tauri; after changing sample-data run `cargo clean -p moss`) and written only into an empty folder (`core/src/example.rs`). Dev builds skip it unless started with `MOSS_ONBOARDING=1`.
- Right-click: `ContextMenu` (controls.tsx) replaces the web view's menu everywhere. Rows carry `data-item={id}`; right-clicking one opens Open + its ⋯ menu (App.tsx `menuFor`). Text fields and the editor keep the system menu; Shift-right-click in dev shows the web view's (Inspect). Rename from there opens the item and asks its view to edit the title; "New …" (only what fits inside: area → project/page, project → task or milestone/page, milestone → task, page → subpage) opens it and focuses its "Add a …" field (`lib/requests.ts`; fields have ids like `add-task-<id>`). Give new item rows `data-item` too.
- Trash: deleting moves the item into `.trash/` with a `<name>.from` note of where it was (`core/src/trash.rs`), so the Trash view (above Settings, `Trash.tsx`, `lib/useTrash.ts`) can restore it any time in its 30 days, delete it for good, or empty everything. Restoring refuses if the place it goes back into was deleted too. Deleting something with items inside asks first (`lib/confirm.ts` + `ConfirmHost`); single tasks and empty pages delete straight away (Undo covers them).
- Keyboard rows: `lib/rowKeys.ts` (hooked up in App.tsx). Any `data-item` row: ↑↓ (same column on the board), ←→ (board columns), Enter opens (tasks and milestones in the details panel, which then follows the arrows), S next status, Delete/Backspace deletes, Esc closes details. Rows are found on screen, so folding and order match what you see. Rows that aren't draggable get `tabIndex={-1}` so the arrows can land on them. Enter no longer starts a keyboard drag (Space only, `drag.ts`). The list is in Settings → Keyboard.
- Cursor: everything clickable shows the pointer (one rule in `styles/base.css`).
- Shortcut labels: always `keys('N')` from `lib/platform.ts` ("⌘N" on a Mac, "Ctrl+N" elsewhere), never a literal ⌘.
- Toasts: `useToast()`; ⌘Z runs the visible toast's Undo. ⌘N opens Quick capture. ⌘\ hides the sidebar (remembered via `lib/prefs.ts`).
- Search: `CommandPalette.tsx` (⌘K). Items by title (matched in the UI), actions (go to, Light mode / Dark mode / Toggle dark mode / Match system mode, sounds, sidebar, plus typed: add to Unsorted, new task in the open project, new page in the open area or project), and text matches from `core/src/search.rs` via `search_text`.
- Editor menus: `components/editor/` (selection toolbar, "/" block menu with /page). `/page` creates a subpage and writes a relative link `[Name](Name.md)`; clicking it opens the page.
- Dragging pages in the sidebar: drop zones on a page are top quarter = above, middle = subpage, bottom quarter = below; dropping on an area or project row moves the page there.

## Motion

The app should feel smooth and considered, never gamified. Library: Motion (`motion/react`).
- Springs only, from `src/lib/motion.ts`: `spring.snappy` (default, ~140ms), `spring.smooth` (size changes, panels, ~220ms), `spring.pop` (small overshoot, only for completing a task or dropping a card). No hand-written durations. Keep things quick: hover transitions are 100–150ms.
- Motion explains cause and effect: where something came from and where it went. Don't animate for decoration.
- Nothing animates on first render (`initial={false}`), only on changes.
- Building blocks: `Collapse` (open/close by height, staggered rows), `ListRow` (rows entering and leaving a list), `StatusIcon` (ring, half fill, pop, check draws), `TaskTitle` (strikethrough sweep), `layoutId` for shared highlights (segmented thumb, sidebar selection) and board cards moving between columns.
- Reduce motion is respected through `<MotionConfig reducedMotion="user">` in main.tsx and a rule in motion.css.
- Drag and drop: dnd-kit. Shared pieces in `src/lib/drag.ts` (sensors, collision, drop settle, click swallowing) and `src/lib/useTwoLevelDrag.ts` (groups holding items: milestones/tasks in `ProjectList.tsx`, areas/projects in `AreaTree.tsx`). We draw the held item ourselves in `<DragOverlay>` with `Lifted`: velocity tilt up to ~6° (less for wide rows), spring swing back, 2% lift. The overlay face must match the row's padding so nothing jumps on pickup. Dragging a group folds all groups; a folded area opens while it holds the dragged project. Board cards change status by column and fly with `layoutId`. Every move goes through `actions.move` (toast + Undo when the parent changes). Keyboard: focus a row, Space, arrows, Space.
- Sounds: `src/lib/sounds.ts`. Soft low knocks, not tunes: each is a ZzFX "body" (a low thump whose pitch drops fast) plus, for most, a tiny low-passed click so it reads on laptop speakers. Pitch varies a little on every play (the recipe's randomness); the same sound can't stack within 35ms. Eleven: pickUp, drop, slot (dragging past a new spot; higher moving up), complete, status, select (Create as; pitch per option), capture, delete, undo, check (page checkbox), open (⌘K). Plus optional typing sounds, creamy rather than clicky (key, keyShift for capitals and symbols, keySpace, keyEnter, and a distinct rising keyDelete), off by default, under Settings → Sounds → Fun, with a dropdown of styles (Soft = the original, Creamy, Water drops, Popping; `TYPING_STYLES` in `sounds.ts`, each with its own sound per kind of key). Never on hover, plain clicks or navigation. Settings → Sounds: everything on/off, volume, each sound on its own with a play button (stored with `lib/prefs.ts`). Tune them on the sound test page (https://claude.ai/artifact/Cnzk2o44TdfL9tYS4z3YHP) and paste the arrays into `SOUNDS`.
- 120fps: WebKit caps pages at 60fps on macOS (the plugin notes that macOS 26 may no longer apply the cap). `src-tauri/src/high_refresh.rs` uses `tauri-plugin-macos-fps` to flip WebKit's private "prefer 60fps" flag behind an experimental Settings switch, shown only on macOS (Windows and Linux already draw at the display's refresh rate). Animations must look right at both 60 and 120.
- Sidebar tree drags re-measure every frame (`MeasuringStrategy.Always` in `AreaTree.tsx`) because picking up an area folds the others mid-drag, and the tree's scrollbar is hidden while anything is held (`data-tree-dragging` + `.sidebar-scroll` in base.css).

## Vocabulary (fixed, never use synonyms in UI or code)

- **Unsorted**: raw capture, emptied regularly. Icon: Lucide `layers`. Sidebar button: "Quick capture" (⌘N).
- **Area**: ongoing part of life, no end.
- **Project**: goal with a finish line, inside one Area.
- **Milestone**: optional checkpoint inside a Project.
- **Task**: one concrete action, one sitting.
- **Page**: a documentation page. Belongs to an area or a project, and can have subpages.

## Data on disk (must stay human-readable)

```
data/
├── unsorted.md                    one item per line: "- 2026-10-15 22:42 text"
└── areas/<Area>/_index.md
    ├── Pages/<Page>.md            the area's pages; or <Page>/_index.md + subpages
    └── <Project>/_index.md
        ├── Pages/<Page>.md        the project's pages
        ├── <Milestone>/_index.md
        │   └── <Task>.md
        └── <Task>.md              (only if the project has no milestones)
```

- Folders are containers, files are leaves. `_index.md` holds a folder's own frontmatter and body.
- Type comes from location, title is the filename (block `/` and `:`), parent is the containing folder.
- A project's children are all milestones or all tasks, never mixed. Its `Pages` folder doesn't count; it isn't an item, so no project or milestone may be called "Pages".
- Older folders (`tasks/` + `notes/`) move to this layout when opened (`core/src/migrate.rs`); old notes go to a "Reference" area.
- Frontmatter: `id` (10-char random id, never changes), `status`, `order` (fractional index key), `created`, optional `due`, `color` (milestones only, stored by name: `dusty-blue`, `mauve`, `rose`, `teal`, `lavender`, `sand`), `icon` (pages only: one emoji, e.g. `icon: 🌿`).
- Statuses: task `todo|doing|done`, plus the optional lanes `later|waiting` (always valid on disk; Settings → Board lanes shows them, `lib/lanes.ts`), milestone `open|done`, project `active|paused|done|dropped`.
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
- Sage accent marks selection, progress and Done. Status is always a circle: Todo gray, Doing amber, Done sage; the optional lanes are Later (dashed gray ring) and Waiting (lavender ring with a pause sign).
- Milestones are tinted chips (muted fill + matching border, no icon), using the milestone palette.
- Due dates: calendar icon; gray normally, muted amber when due soon, muted red when overdue.
- Window vibrancy on sidebar and background only; content panels are solid and rounded.
- Brand: the mark is a lowercase m made of two moss mounds and a leaf (`brand/icon.svg`, `<MossMark>` in `components/Brand.tsx`, colors `--color-brand-*`). Wordmark is "moss°", drawn in the mark's style (the m, then o and s in the same round stroke, the leaf, a leaf-green ring for the °): `<MossWordmark>` in the sidebar, `brand/wordmark-*.svg` in the README, generated by `brand/wordmark.py`. The app's name in text is "Moss".
- No file paths in the UI. Every item's ⋯ menu has Reveal in Finder, Copy path, Rename, Delete.

## Build order

M1 file format + Rust core + 10k-file benchmark → M2 app shell + tokens → M3 Unsorted (start using the app here) → M4 hierarchy lists → M5 drag and drop + Board → M6 notes editor (plain text + preview first). v1 is only Unsorted, the hierarchy and notes. Budget: a few weekends.

Status: M1–M6 are built (core, shell, Unsorted flow, create / edit / delete with Undo, Settings, motion pass, drag and drop, rich text editor), plus area and milestone pages with List/Board and a release workflow. Branding done (Moss). Sidebar hides with ⌘\; trash older than 30 days is emptied on open. Sounds (tunable, plus optional typing sounds), ⌘K search and commands, editor toolbar and "/" blocks are in. Navigation is one tree (areas → projects → pages) with Tasks and Pages overviews. Next: use it daily and fix what bugs you.

## Backlog (after v1)

- Timeline view (maybe).
- Code signing for releases (Apple Developer ID + notarization, a Windows certificate).
- Drag and drop on the area page.

## Working with me

- I don't know Rust yet. Keep the Rust core small and heavily commented so I can learn from it.
