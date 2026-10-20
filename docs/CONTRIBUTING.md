# Working on Moss

## Setup

Rust (stable), Node 22, pnpm 10; on macOS the Xcode command line tools; on Linux the WebKitGTK packages in `.github/workflows/ci.yml`. Then:

```sh
pnpm install
pnpm tauri dev        # opens a copy of sample-data/
```

## Before you push

CI runs all of this; run it first.

```sh
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm lint
pnpm test
pnpm build            # also type-checks
pnpm a11y             # axe-core over every screen (needs a Chromium: CHROMIUM_PATH, or `pnpm exec playwright-core install chromium`)
```

## Branches

Never commit to `main`. Work on `feature/…`, `fix/…` or `refactor/…`, merge by pull request into the current release branch (named in `CLAUDE.md`), and ship by a pull request from the release branch into `main`. A merge to `main` publishes a release only if the version in `src-tauri/tauri.conf.json` is new; bump it in `tauri.conf.json`, `package.json`, both `Cargo.toml` files and `Cargo.lock`.

## House rules

- **One action, one file** in the Rust code: a command, a Git step, a sync step. A module's `mod.rs` says what each file does.
- **Files are the truth.** Writes don't update memory; the app reloads. All file access goes through `core`.
- **Every behavior change gets a test.** Core: `core/tests/` or beside the code. Front end: `*.test.ts(x)` beside the file. Keyboard and screen reader behavior is tested with `userEvent.keyboard` and role queries, not by clicking.
- **Problems in the data folder become Issues**, never crashes or silent fixes (only id problems are repaired on load).
- **Never lose what someone wrote.** Name collisions pick another name. Conflicts keep both versions. A failed save keeps the text and retries.
- **Colors, sizes and radii come from `tokens.css`.** No hex in components. `pnpm test` checks contrast.
- **UI words**: plain, sentence case, no jokes; the fixed vocabulary in `CLAUDE.md` (Unsorted, Area, Project, Milestone, Task, Page, Issue).
- **Shortcut labels** come from `keys()` in `src/platform/os.ts`, never a literal ⌘.
- **Keep the Rust small and commented.** Comments explain why, and what a reader who is new to Rust would need.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — the map
- [SYNC.md](SYNC.md) — Git sync
- [ACCESSIBILITY.md](ACCESSIBILITY.md) — the rules and how they're tested
- `CLAUDE.md` — the long form of the conventions (for people and for Claude Code)
