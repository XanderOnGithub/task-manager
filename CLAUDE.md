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
core/           task-core: the file format, Git sync and GitHub. Load, validate, write. No Tauri; fully tested.
  src/          one module per job (see core/src/lib.rs for the map); git/ is one file per action
  tests/        end-to-end tests against a copy of sample-data/ (data_folder, sync, load_budget)
  examples/     bench.rs: loading benchmark (10k tasks by default)
src-tauri/      the desktop app: Tauri commands that call into core
  src/          lib.rs (composition), state.rs, settings.rs, folder.rs, commands/ (one file per job), sync/ (one file per action)
src/            React front end, by feature (see docs/ARCHITECTURE.md)
  app/          loading the library, every action the UI can take (useActions), requests between views
  domain/       what the data means: item index, dates, lanes, links. No React, no IPC
  platform/     the outside world: api.ts (typed commands), prefs, theme, updates, OS facts
  sound/        sounds
  shared/       controls, ui, motion, toast, confirm, drag, a11y helpers
  features/     capture, editor, issues, navigation, onboarding, pages, search, settings, sync, tasks, trash
  styles/       app.css (entry), tokens.css (Tailwind theme), base.css, motion.css, editor.css
docs/           ARCHITECTURE, SYNC, ACCESSIBILITY, CONTRIBUTING
sample-data/    the renovation example from the mockups; dev builds open a copy of it
media/          README GIFs (media/readme) and the trailer, recorded from the real app; see media/README.md
brand/          the Moss mark (icon.svg), the moss° wordmarks (wordmark.py draws them), icon-1024.png (source for `pnpm tauri icon`)
```

Component names below are given without their folder; find them under `src/features/<area>/` or `src/shared/` (`docs/ARCHITECTURE.md` has the map).

## Commands

- `pnpm tauri dev`: run the app (dev builds open a copy of sample-data/ if no folder is set)
- `cargo test --workspace`: Rust tests (core: file format, Git sync with a local bare repo, a loading speed limit)
- `pnpm test`: front end tests (logic, keyboard and screen reader behavior of dialogs and menus, text color contrast)
- `cargo run --release -p task-core --example bench`: loading benchmark
- `cargo clippy --workspace --all-targets` and `cargo fmt --all`: lint and format Rust
- `pnpm lint` and `pnpm build`: lint and type-check the front end
- Releases: see Branches and releases below. No Developer ID or Windows certificate yet; the Mac app is signed ad hoc (`bundle.macOS.signingIdentity: "-"`) so macOS offers Open Anyway instead of saying it's damaged.

## Branches and releases

Moss is in alpha (`"stage": "alpha"` in package.json; Settings shows "Alpha 0.1.0").
- Never commit to `main` directly. Work happens on `feature/…`, `fix/…` or `refactor/…` branches, each merged by pull request into the current release branch (now `release/alpha-0.3`).
- When the release branch is ready, a pull request from it into `main` ships it. `.github/workflows/release.yml` runs on every push to `main`: if the version in `src-tauri/tauri.conf.json` isn't released yet, it builds macOS (Apple silicon + Intel), Windows (installers + a portable .exe) and Linux installers, runs `android.yml` to add the signed APK (`Moss_X.Y.Z_android.apk`), and publishes "Moss alpha X.Y.Z" with notes from the PRs. Only the desktop builds have to succeed. Otherwise it does nothing.
- Next version: branch `release/alpha-X.Y` from `main` and bump `version` in tauri.conf.json, package.json and both Cargo.toml files on it.
- In-app updates: `tauri-plugin-updater` reads `latest.json` from the newest GitHub release (`src/platform/updates.ts`; checks a few seconds after launch in real builds, "Update to X" in the sidebar, "Check for updates" in Settings). Update files are signed: the private key lives only in the repo secrets `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`, the public key in `tauri.conf.json` → `plugins.updater.pubkey`. Never commit the private key. Lose it and installed copies can't update any more.
- CI (`ci.yml`) runs on every pull request and on pushes to `main` and `release/**`.

## Rules for the code

- All file reading and writing goes through `core`. The front end never touches files directly.
- Writes don't update the in-memory library. The app drops its cache and reloads; files are the single source of truth.
- The watcher ignores reads (Linux reports every file open; counting them made each load trigger another) and the app skips the watcher's echo of its own writes for a second (`OWN_WRITE_WINDOW` in src-tauri), so one action is one reload.
- Long lists open in two steps (`app/useProgressive.ts`, used by `AreaList.tsx`): the first few projects at once, the rest in a transition, so opening Tasks with hundreds of tasks doesn't freeze the window. Per-row animation uses the light `m` components from `motion/react-m` (under `LazyMotion` in main.tsx); layout animations (`layout`, `layoutId`) need the full `motion` ones.
- Reloads keep unchanged items as the same objects (`app/share.ts`), and task rows and board cards are `memo`ized with their insides split from the dnd-kit wrapper, so a change redraws only the rows it touched. Keep callbacks passed to rows stable (`useCallback`), and don't create new item objects for rows.
- Saving a file: `fsutil::write_atomic` (own temp file, fsync, rename, cleaned up on failure). Anything that reads a file and writes it back (`update_frontmatter`, `write_body`, the Unsorted edits) goes through `fsutil::modify_atomic`, which starts again if the file changed on disk meanwhile, so an outside edit is never overwritten with a change based on the old text. The watcher skips only files not modified since our last write (`folder.rs`), so an outside edit in the same second still reloads.
- Problems in the data folder become `Issue`s, never crashes. Only id-related issues are fixed automatically.
- Every change to core behavior gets a test in `core/tests/data_folder.rs` or next to the code. Front end behavior gets a `*.test.ts(x)` beside it.
- Never lose what someone wrote: name collisions (trash, copies) pick another name instead of replacing; Git conflicts keep both versions; a failed save keeps the text and retries (`features/editor/saveQueue.ts`); a failed read is an error with Try again, never an empty editor.
- Paths that come from outside the Rust code are checked with `fsutil::check_inside` before they are joined onto the data folder. Input to Git (addresses, branches) is validated and never starts with `-`.
- Anything that changes files in the data folder holds `AppState::lock_folder` (the `write()` helper does); Git's local steps hold it too. Lock order: folder, then data. See docs/ARCHITECTURE.md.
- Rust: one action per file (a command, a Git step, a sync step); `mod.rs` says what each file is for.
- Accessibility is a rule, not a polish pass: see docs/ACCESSIBILITY.md. Dialogs use `Modal` / `useModalLayer`, menus and radio groups work with the arrow keys, row shortcuts don't steal keys from controls and text fields, text contrast is tested (`styles/contrast.test.ts`), `pnpm lint` runs jsx-a11y.

## Styling

- Tailwind v4. Style in JSX with classes; the theme in `tokens.css` defines every class name.
- Colors: `bg-panel`, `bg-raised`, `bg-card`, `bg-hover`, `bg-selected`, `text-fg`, `text-fg-2`, `text-fg-3`, `border-border`, `text-accent`, `bg-accent text-on-accent`, status `text-todo|doing|done`, dates `text-due|due-soon|overdue`, `text-danger`. Tailwind's default palette is switched off.
- Type: `text-title`, `text-heading`, `text-body`, `text-meta`, `text-label` (each sets size, line height and weight). Mono: `font-mono`.
- Shape: `rounded-window|panel|card|row|control|chip`; sizes `h-row`, `w-sidebar`, `w-details`; shadows `shadow-window|menu|seg|card`.
- Milestone chips: `milestone-chip` (+ `milestone-chip-header`) with `style={{ '--ms': 'var(--color-ms-teal)' }}`.
- Motion: see the Motion section below. CSS-only effects (hover color, simple fades) can use Tailwind `transition-*` with `ease-snappy`; keyframes live in `motion.css`.
- Repeated class lists become small components (`<Chip>`, `<Row>`), not `@apply`.

## Front-end structure

- `src/app/useLibrary.ts` loads the snapshot and reloads on `data-changed`. `src/app/useActions.ts` holds every change the UI can make (each one calls Rust, shows a toast with Undo where it makes sense, and reloads). Add new actions there, not in components.
- `src/shared/controls/` (one file each): InlineAdd, EditableTitle, Menu, Segmented, Modal, BodyEditor, DateField. `ui.tsx`: Panel, chips, status icon, due date, progress.
- Navigation: one sidebar tree, areas → projects → pages (`AreaTree.tsx`, one DndContext for all three; page rows in `PageTree.tsx`, page drag logic in `features/pages/pageDrag.ts`). Above it, three overviews: Unsorted, Tasks (every project, List/Board) and Pages (every area and project with its pages). `App.tsx` keeps what's open as an overview or an item id; opening anything unfolds the sidebar down to it.
- Task views: `ScopeView.tsx` shows everything (scope null, the Tasks overview), an area, project or milestone (breadcrumb, List/Board/Milestones; a milestone has only List/Board). Milestones: `MilestoneTable.tsx`, a table of the milestones inside (progress, due, status; rows from `domain/milestones.ts`). A project with loose tasks gets its first milestone with `actions.addMilestone` (`ops::group_into_milestone` moves the tasks into it); Unsorted can file an entry as a milestone; the details panel's Milestone field moves a task to another milestone of its project. List: `AreaList.tsx` (projects with their open tasks) or `ProjectList.tsx` (a project's milestones/tasks, or a milestone's tasks), then the area's or project's pages (`PageSection`). Board: `Board.tsx` for any of them. `tasksUnder()` in `domain/items.ts` collects the tasks inside anything (null = all).
- Pages: `Pages.tsx` (PageView, PagesOverview, PageSection; word count in the corner, Settings → Word count). Type `:name` for emoji (`features/editor/emojiShortcodes.ts`, gemoji). Shift+Enter always adds a line break (our key handler; the preset's is left out). Text: `MarkdownEditor.tsx` (Milkdown) for pages and every description. Rich text on screen, plain markdown on disk ("-" bullets, no `<br />`), saved only after a real edit. Extra blank lines stay as plain blank lines in the file: the editor shows each as an empty `&nbsp;` paragraph (`toEditor` on load, `normalize(…, true)` on save in `MarkdownEditor.tsx`). Styles in `styles/editor.css`. Loaded lazily.
- First launch: `Onboarding.tsx` (welcome, then the data folder: Documents/Moss or any folder, optionally with the example). The example is `sample-data/`, built into the app binary (`include_dir!` in src-tauri; after changing sample-data run `cargo clean -p moss`) and written only into an empty folder (`core/src/example.rs`). Dev builds skip it unless started with `MOSS_ONBOARDING=1`.
- Right-click: `ContextMenu` (controls.tsx) replaces the web view's menu everywhere. Rows carry `data-item={id}`; right-clicking one opens Open + its ⋯ menu (App.tsx `menuFor`). Text fields and the editor keep the system menu; Shift-right-click in dev shows the web view's (Inspect). Rename from there opens the item and asks its view to edit the title; "New …" (only what fits inside: area → project/page, project → task or milestone/page, milestone → task, page → subpage) opens it and focuses its "Add a …" field (`app/requests.ts`; fields have ids like `add-task-<id>`). Give new item rows `data-item` too.
- Trash: deleting moves the item into `.trash/` with a `<name>.from` note of where it was (`core/src/trash.rs`), so the Trash view (above Settings, `Trash.tsx`, `features/trash/useTrash.ts`) can restore it any time in its 30 days, delete it for good, or empty everything. Restoring refuses if the place it goes back into was deleted too. Deleting something with items inside asks first (`shared/confirm/confirm.ts` + `ConfirmHost`); single tasks and empty pages delete straight away (Undo covers them).
- Keyboard rows: `features/navigation/rowKeys.ts` (hooked up in App.tsx). Any `data-item` row: ↑↓ (same column on the board), ←→ (board columns), Enter opens (tasks and milestones in the details panel, which then follows the arrows), S next status, Delete/Backspace deletes, Esc closes details. Rows are found on screen, so folding and order match what you see. Rows that aren't draggable get `tabIndex={-1}` so the arrows can land on them. Enter no longer starts a keyboard drag (Space only, `drag.ts`). The list is in Settings → Keyboard.
- Text in the editor: `features/editor/` (`BodyEditor` reads it via `useBody`, `MarkdownEditor` edits it, `SaveQueue` saves it, `markdown.ts` converts to and from the editor's form with CommonMark fence rules, `bodyChanges.ts` tells an open page its file changed outside). Saving text does not reload the library. Ctrl/⌘+Enter ticks a checklist item.
- The index: `domain/items.ts` (`childrenOf`, `itemById`, `tasksUnder`, `taskCounts`, `trailOf`) answers from an index built once per `items` array. The returned arrays are shared: don't change them.
- Issues: `features/issues/Issues.tsx` (sidebar row while there are any; wording from `core/src/issues.rs`, so write it once). Names Windows can't store are an Issue (`notPortable`) and are refused for new titles (`core/src/names.rs`).
- Page links: `/page` writes `[Name](Name.md#id-<id>)` (`domain/links.ts`): other apps ignore the fragment; Moss finds the page by id even after a rename, and falls back to the name for older links.
- Narrow windows: under 768px (`platform/layout.ts`: `useCompact()`, `max-md:` in CSS) the sidebar is a `Drawer` (menu button and Search at the ends of every `PanelHeader` via `shared/compactNav.ts`; a phone has no ⌘K), the details panel a `Sheet`, and `BottomNav` holds Unsorted, Today, Quick capture, Tasks, Pages. Touch (`pointer-coarse:`): taller rows (`--spacing-row`), a 44px tap area on every control (`base.css`), nothing hover-only, no key hints. Drags start with a long press on touch (`shared/drag/drag.ts`); letting go of a held row without moving opens its actions as a bottom `ActionSheet` (`shared/drag/hold.ts` → `ContextMenu.tsx`, which also gives rows that can't be dragged their own long press). The phone's native long-press menu is ignored. On touch every `Menu` (⋯) is an `ActionSheet` too, key hints (`kbd`, `.key-hint`) are hidden, and Android leaves out Reveal in Finder and Copy path. Task rows show the blocked lock without its words (`BlockedMark iconOnly`); board cards keep them. Look at a layout with `pnpm build && node scripts/screenshots.mjs <folder> phone`.
- Saving from a field: `InlineAdd`, `EditableTitle` and Quick capture take `Promise<boolean>` and keep what was typed on `false`. `actions.run` returns `undefined` only when the action failed, so `!== undefined` means it worked.
- Cursor: everything clickable shows the pointer (one rule in `styles/base.css`).
- Shortcut labels: always `keys('N')` from `platform/os.ts` ("⌘N" on a Mac, "Ctrl+N" elsewhere), never a literal ⌘.
- Toasts: `useToast()`; ⌘Z runs the visible toast's Undo. ⌘N opens Quick capture. ⌘\ hides the sidebar (remembered via `platform/prefs.ts`).
- Search: `CommandPalette.tsx` (⌘K). Items by title (matched in the UI), actions (go to, Light mode / Dark mode / Toggle dark mode / Match system mode, sounds, sidebar, plus typed: add to Unsorted, new task in the open project, new page in the open area or project), and text matches from `core/src/search.rs` via `search_text`.
- Editor menus: `features/editor/` (selection toolbar, "/" block menu with /page). `/page` creates a subpage and writes a relative link `[Name](Name.md)`; clicking it opens the page.
- Dragging pages in the sidebar: drop zones on a page are top quarter = above, middle = subpage, bottom quarter = below; dropping on an area or project row moves the page there.

## Motion

The app should feel smooth and considered, never gamified. Library: Motion (`motion/react`).
- Springs only, from `src/shared/motion/springs.ts`: `spring.snappy` (default, ~140ms), `spring.smooth` (size changes, panels, ~220ms), `spring.pop` (small overshoot, only for completing a task or dropping a card). No hand-written durations. Keep things quick: hover transitions are 100–150ms.
- Motion explains cause and effect: where something came from and where it went. Don't animate for decoration.
- Nothing animates on first render (`initial={false}`), only on changes.
- Building blocks: `Collapse` (open/close by height, staggered rows), `ListRow` (rows entering and leaving a list), `StatusIcon` (ring, half fill, pop, check draws), `TaskTitle` (strikethrough sweep), `layoutId` for shared highlights (segmented thumb, sidebar selection) and board cards moving between columns.
- Reduce motion is respected through `<MotionConfig reducedMotion="user">` in main.tsx and a rule in motion.css.
- Drag and drop: dnd-kit. Shared pieces in `src/shared/drag/drag.ts` (sensors, collision, drop settle, click swallowing) and `src/shared/drag/useTwoLevelDrag.ts` (groups holding items: milestones/tasks in `ProjectList.tsx`, areas/projects in `AreaTree.tsx`). We draw the held item ourselves in `<DragOverlay>` with `Lifted`: velocity tilt up to ~6° (less for wide rows), spring swing back, 2% lift. The overlay face must match the row's padding so nothing jumps on pickup. Dragging a group folds all groups; a folded area opens while it holds the dragged project. Board cards change status by column and fly with `layoutId`. Every move goes through `actions.move` (toast + Undo when the parent changes). Keyboard: focus a row, Space, arrows, Space.
- Sounds: `src/sound/sounds.ts`. Soft low knocks, not tunes: each is a ZzFX "body" (a low thump whose pitch drops fast) plus, for most, a tiny low-passed click so it reads on laptop speakers. Never use ZzFX shape 4 ("noise") for clicks: it is `sin(t³)`, which aliases into a buzzy rattle at 1–4 kHz and is harsh on in-ear monitors. Clicks are short soft sines (500–1000 Hz, low-passed, 1.5 ms attack), and loud bodies get at least 4 ms attack, so nothing starts with a pop. Pitch varies a little on every play (the recipe's randomness); the same sound can't stack within 35ms. Eleven: pickUp, drop, slot (dragging past a new spot; higher moving up), complete, status, select (Create as; pitch per option), capture, delete, undo, check (page checkbox), open (⌘K). Plus optional typing sounds, creamy rather than clicky (key, keyShift for capitals and symbols, keySpace, keyEnter, and a distinct rising keyDelete), off by default, under Settings → Fun, with a dropdown of styles (Soft = the original ZzFX recipes in `sounds.ts`; Creamy, Water drops, Pop and Clicky are built from pure tones in `keyStyles.ts` and played by `keySynth.ts` with Web Audio). No noise voices and no key-up sounds: both turn into hiss and crackle on in-ear monitors. Presses go through a 7 kHz low-pass and a limiter, and each press cuts the previous one short so fast typing doesn't pile up. Backspace or Enter with Shift or a modifier (delete a word, a new line) plays the heavier `big` version (lower, longer, about 1.6x louder); other shortcuts stay silent. A press varies only ±2.5% pitch and ±10% level: more wobble than that sounds like a melody. Never on hover, plain clicks or navigation. Settings → Sounds: everything on/off, volume, each sound on its own with a play button (stored with `platform/prefs.ts`). Tune them on the sound test page (https://claude.ai/artifact/Cnzk2o44TdfL9tYS4z3YHP) and paste the arrays into `SOUNDS`.
- 120fps: WebKit caps pages at 60fps on macOS (the plugin notes that macOS 26 may no longer apply the cap). `src-tauri/src/high_refresh.rs` uses `tauri-plugin-macos-fps` to flip WebKit's private "prefer 60fps" flag behind an experimental Settings switch, shown only on macOS (Windows and Linux already draw at the display's refresh rate). Animations must look right at both 60 and 120.
- Sidebar tree drags re-measure every frame (`MeasuringStrategy.Always` in `AreaTree.tsx`) because picking up an area folds the others mid-drag, and the tree's scrollbar is hidden while anything is held (`data-tree-dragging` + `.sidebar-scroll` in base.css).

## Formal mode and priority (front end only)

- Formal mode (Settings → General) swaps the UI words for agile ones: Unsorted → Backlog, Area → Initiative, Project → Epic, Milestone → Sprint, Task → Story, statuses To do / In progress / Icebox / Blocked, "Waiting on" → "Blocked by". All UI wording for these comes from `domain/vocab.ts`: components call `useVocab()` (redraws on change), plain code calls `vocab()`. Never hard-code these nouns in UI copy; code, kinds and files keep the fixed vocabulary below.
- Priority: Urgent / High / Medium / Low (Critical / Major / Minor / Trivial in Formal mode). Stored by the app in preferences by task id (`app/priorityStore.ts`), not in the files, so it doesn't sync. Set in the details panel or with 1–4 (0 clears) on a focused row; marks on rows and cards (`features/tasks/Priority.tsx`, colors `--color-priority-*`). Board columns and Today days sort by priority; lists keep their manual order.

## Vocabulary (fixed, never use synonyms in UI or code)

- **Unsorted**: raw capture, emptied regularly. Icon: Lucide `layers`. Sidebar button: "Quick capture" (⌘N).
- **Area**: ongoing part of life, no end.
- **Project**: goal with a finish line, inside one Area.
- **Milestone**: optional checkpoint inside a Project.
- **Task**: one concrete action, one sitting.
- **Issue**: something Moss found in the data folder it couldn't make sense of (listed under Issues in the sidebar, with Reveal).
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
- Frontmatter: `id` (10-char random id, never changes), `status`, `order` (fractional index key), `created`, optional `due`, optional `blocked_by` (tasks only: ids of tasks that should be done first, joined with ", "; a reminder, not a lock, `core/src/blockers.rs`), optional `repeat` (tasks only: `daily|weekly|monthly|yearly` or `every N days|weeks|months|years`; finishing the task re-opens it with the next due date, `core/src/repeat.rs`), `color` (milestones only, stored by name: `dusty-blue`, `mauve`, `rose`, `teal`, `lavender`, `sand`), `icon` (pages only: one emoji, e.g. `icon: 🌿`).
- Statuses: task `todo|doing|done`, plus the optional lanes `later|waiting` (always valid on disk; Settings → Board lanes shows them, `domain/lanes.ts`), milestone `open|done`, project `active|paused|done|dropped`.
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
- Android icon: `brand/android/` (adaptive layers: the mark at 72% inside the safe zone, a full-bleed ground, a monochrome version; `render.mjs` draws the PNGs, the Android workflow runs `tauri icon brand/android/icon.json`).
- Brand: the mark is a lowercase m made of two moss mounds and a leaf (`brand/icon.svg`, `<MossMark>` in `shared/Brand.tsx`, colors `--color-brand-*`). Wordmark is "moss°", drawn in the mark's style (the m, then o and s in the same round stroke, the leaf, a leaf-green ring for the °): `<MossWordmark>` in the sidebar, `brand/wordmark-*.svg` in the README, generated by `brand/wordmark.py`. The app's name in text is "Moss".
- No file paths in the UI. Every item's ⋯ menu has Reveal in Finder, Copy path, Rename, Delete.

## Build order

M1 file format + Rust core + 10k-file benchmark → M2 app shell + tokens → M3 Unsorted (start using the app here) → M4 hierarchy lists → M5 drag and drop + Board → M6 notes editor (plain text + preview first). v1 is only Unsorted, the hierarchy and notes. Budget: a few weekends.

Status: M1–M6 are built (core, shell, Unsorted flow, create / edit / delete with Undo, Settings, motion pass, drag and drop, rich text editor), plus area and milestone pages with List/Board and a release workflow. Branding done (Moss). Sidebar hides with ⌘\; trash older than 30 days is emptied on open. Sounds (tunable, plus optional typing sounds), ⌘K search and commands, editor toolbar and "/" blocks are in. Navigation is one tree (areas → projects → pages) with Tasks and Pages overviews. Next: use it daily and fix what bugs you.

## Git sync

Full description: `docs/SYNC.md`. In short: Settings → Sync (`SyncSettings.tsx`): sign in with GitHub, choose one of the repositories the app can reach, then see status (Sync now, Pause, Stop syncing, Sign out). First launch has "Get files from GitHub" (`GithubStep` in `Onboarding.tsx`). The sidebar's `SyncRow` shows the status while this folder syncs.
- Core: `core/src/git/` shells out to the installed `git` (one file per action; without git: "Install Git to use sync."). `core/src/github.rs` does the GitHub side over HTTPS (`ureq`). Tests: `core/tests/sync.rs` (two folders and a bare repository standing in for GitHub).
- Sign-in is GitHub's device flow and needs the public client id of a **GitHub App** (not an OAuth app: its token reaches only the repositories the person chose when installing it, with Contents read/write; the old `repo` scope reached all of them) with device flow on and "Expire user authorization tokens" off. Passed at build time as `MOSS_GITHUB_CLIENT_ID`, plus the app's slug as `MOSS_GITHUB_APP_SLUG` for the "Choose repositories on GitHub" link (both repository variables for releases; setup in `docs/SYNC.md`). Apps can't create repositories, so the UI links to github.com/new. The token lives in the system keychain and reaches Git only through environment variables for one command.
- `src-tauri/src/sync/` (one file per action) is the glue and a background thread: commits a minute after the last change, pulls on launch, on window focus and every 5 minutes, pushes after a commit, commits on quit. Git operations run one at a time (`Runtime::exclusive`) and take the folder lock for commit and merge.
- A real conflict keeps this computer's version and saves the other as "Title (from other computer).md" (numbered if taken; no `id:`). A folder's `_index.md` gets the other text appended under a divider. If saving fails the merge is undone. `unsorted.md` merges by union.
- Conflict copies ("… (from other computer)") are listed as Issues with an Open button, and a toast says when a sync kept both versions.
- Not done yet: GitHub Enterprise.

## Plan and protect

- Plain-language dates: `domain/naturalDate.ts` (`parseDue`) reads a trailing date in an Unsorted entry or a new task ("call Bob friday", "in 3 days", "oct 23"). Filing as a task sets the due date and strips the words; pages and projects keep the text. Unsorted rows show a due hint.
- Repeat: set in the details panel (`RepeatField`) or by hand in the file. Done + repeat goes through `ops::set_status` (back to todo, next due), toast "Done. Next due …" with Undo.
- Today (`features/today/`): Overdue, Today, Tomorrow and the next days, across all areas; sidebar badge counts overdue + today.
- Bulk sort: tick entries in Unsorted (Shift for a range), Create as, pick a destination; one toast, one Undo (`actions.fileEntries`).
- Undo history: `shared/toast/history.ts`. ⌘Z undoes the newest change even after its toast is gone; "Recent changes" in ⌘K lists them. Session only, 50 entries.
- Backups: `core/src/backup/` (zip of the data folder without `.git`; `create`, `list`, `prune`, `restore` one file each) and `src-tauri/src/backup/` (location in the app data dir, daily thread, commands). Settings → Backups: back up now, restore (a "before restore" backup is made first), restore from a file, automatic on/off. Keeps 14 automatic and 5 before-restore; manual ones stay.

## Dependencies

- A task can wait on other tasks (`blocked_by`, set under "Waiting on" in the details panel; only tasks of the same project are offered). Circles, itself and non-tasks are refused in core. It is a reminder: the row, card and Today show "Waiting on X" with a lock while a blocker is open, and nothing stops you finishing the task.
- Rows are memoized, so they don't take `items`: `BlockedMark` asks `app/blockedStore.ts` (set from App) and redraws only when its own answer changes.

## Fun (Settings → Fun)

Everything fun is optional, off by default, adds no step, and only reacts to something the person already did. Particles never run when the system's Reduce motion is on (`prefersReducedMotion` in `shared/impact/fun.ts`).
- Settings → Fun holds typing sounds (moved from Sounds), Impact sounds (`impactDone`, `impactDoing`, `impactWaiting` in `sound/sounds.ts`: fuller than the plain ones, used instead of `complete` / `status` when switched on, each can be muted) and Particles.
- `shared/impact/`: `fun.ts` (the switches, via `platform/prefs.ts`), `particles.ts` (one see-through canvas laid over the window only while specks fly; colors read from tokens), `impact.ts` (called from `actions.setStatus` and the drag start: `playStatusSound`, `statusBurst`, `pickUpDust`). Status bursts find the row or card by `data-item` 160ms later, because a board card lands in its new column only after the reload.
- A new fun effect: add it there, give it a switch in `FunTab.tsx`, keep it under about 400ms, and add a test that it is off by default.

## Backlog (after v1)

- Timeline view (maybe).
- Code signing for releases (Apple Developer ID + notarization, a Windows certificate).
- Drag and drop on the area page.

## Working with me

- I don't know Rust yet. Keep the Rust core small and heavily commented so I can learn from it.
