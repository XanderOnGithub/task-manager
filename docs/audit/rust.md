# Rust audit: `core/` and `src-tauri/`

Every file in `core/src`, `core/tests`, `src-tauri/src` was read in full on 2026-10-23.
Severity is about what could happen to someone's files or privacy, not about code style.
"Fixed" items have a test that fails without the fix (checked by reverting the fix).

## Fixed

| Where | Problem | Severity | Fix |
|---|---|---|---|
| `core/src/unsorted.rs` `stamp_missing` | Read the file, then wrote it back with `write_atomic`. A line a phone appended between the two was lost. This runs on every library load. CLAUDE.md says Unsorted edits go through `modify_atomic`. | High | Goes through `modify_atomic`; writes nothing when there is nothing to stamp. |
| `core/src/fix.rs` | `MissingId` replaced an `id:` that had arrived since the load (a sync, an editor), which breaks links. `MissingIndex` wrote over an `_index.md` that had arrived since. | Medium | Each repair re-checks the file as it is now and does nothing if the problem is gone. |
| `core/src/ops.rs` `restore` | The place to restore to is read from a `.from` note in the trash, which a sync can bring from another computer. Any path inside the data folder passed, including `.git/hooks/...`. | Medium | Destination must be under `areas/`. |
| `core/src/library.rs` | One unreadable folder, or a folder link that loops back (`Pages/Loop -> Pages`), made `Library::load` return an error, so the whole app failed to open. CLAUDE.md: problems become Issues. | Medium | New `Issue::Unreadable`; `entries_of` turns a failed read into an Issue; paths deeper than 40 parts become `TooDeep`. |
| `core/src/backup/restore.rs` | A zip picked by hand could contain `.git/...` entries (Git hooks run the next time sync is switched on). The size limit trusted sizes written in the zip's headers. | Low-Medium | Entries with a `.git` part are refused; unpacking counts the bytes really written. |
| `core/src/git/` | (1) No time limit: a dropped connection left `fetch`/`push` waiting forever, and every later sync waits behind it. (2) A synced repository can contain a link to a file elsewhere on the computer; checked out as a link, Moss's writes could land outside the data folder. | Low-Medium | `GIT_HTTP_LOW_SPEED_*` (give up below 1 KB/s for 30 s); `core.symlinks=false`, set before every sync so older connected folders get it too. |
| `src-tauri/src/state.rs`, `commands/body.rs` | `read` holds the global `data` lock while its closure runs. ⌘K text search opens files until it has 20 hits, so every other command and the folder watcher waited for it. | Medium | The cached library is an `Arc`; `snapshot()` hands it out without the lock; `search_text` uses it on a blocking thread. |
| `src-tauri/src/settings.rs` | Four places changed their setting by load, edit, save with no lock, so two at once could write back each other's old value. A `settings.json` that could not be parsed was silently replaced by the defaults (data folder choice and sync setup lost) on the next save. | Low | `settings::update` (one change at a time); an unparsable file is copied to `settings.json.invalid` first. |
| `src-tauri/src/sync/info.rs` | While offline, every status refresh made a web request for the username (20 s timeout). | Low | At most one attempt a minute. |
| `core/src/ops.rs` `trash` | If writing the `.from` note failed, the delete reported failure although the item was already in the trash, and Undo was lost. | Low | The note is best effort. |
| `core/src/ops.rs` `empty_old_trash` | Counted an item's `.from` note as a second item. | Low | Notes are removed with their item and not counted. |

## Checked and fine

- Lock order (folder, then data) holds everywhere; `data` is never held while taking `folder`. Git operations take `exclusive` first, then `folder`.
- Every path from the front end goes through `check_inside` (`restore`, `delete_forever`, `reveal_path`, conflict resolution, backup entries).
- Git input is validated (`check_remote`, `remote_url`); the token is only in environment variables and is scrubbed from messages.
- `write_atomic` / `modify_atomic`: temp file, fsync, rename, directory fsync, cleanup on failure.
- Order keys, ids, repeat dates, blockers (cycles, self, non-tasks) are covered by tests and cannot panic on valid input.

## Left as it is (and why)

| Where | Note |
|---|---|
| `fsutil::modify_atomic` | A change made between its last re-read and the rename is still overwritten. Closing that needs file locking across editors; the window is microseconds. |
| `ops::create_with_due` | Checks the name is free, then writes. Something creating the same file in between would be replaced. Same tiny window; the app's own writes hold the folder lock. |
| `git/conflict.rs` | `check_inside` rejects file names with `:` or `\`. A synced repository from Linux with such a name would make the merge fail (and be undone) each time. Rare; the failure is visible and loses nothing. |
| `git/repo.rs` | `.gitignore` is only written when missing, so a repository whose `.gitignore` came from GitHub's template may not ignore `.trash/`. The restore-path check above covers the risk this had. |
| `backup/schedule.rs` | The daily backup holds the folder lock while zipping; a very large folder delays saves for a few seconds. |
| `search.rs` | Scans files one by one. Fine for thousands; an index would be the next step past ~50k. |
| `frontmatter.rs` | A trailing `# comment` on a value is read as part of the value (the field then becomes an Issue instead of being used). |
| `commands/display.rs` | The 120fps flag is saved before the web view confirms it. |
| `example.rs` `copy_dir` | Does not follow links (development builds only). |
