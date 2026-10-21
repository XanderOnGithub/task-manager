# Git sync

Moss can keep the data folder in a GitHub repository, so the same files are on every computer. It is built on the `git` already installed on the computer, so there is no sync server and Moss never has your password.

## For people

Settings → Sync: **Sign in with GitHub**, then **create a repository** (private by default) or **use an existing one**. On a new computer, the first screen has **Get files from GitHub**.

- Moss commits a minute after your last change, and pulls when it opens, when its window comes to the front, and every five minutes.
- If two computers change the same page, **this computer's version stays** and the other is saved next to it as `Title (from other computer).md`. For a folder's own text (`_index.md`) the other computer's text is added at the end, under a divider. Lines added to Unsorted on both computers all survive. Nothing is thrown away.
- **Pause** stops all background work; **Stop syncing** forgets the repository (files and history stay); **Sign out** also forgets the sign-in.
- Names Windows can't store (`?`, `*`, `"`, `<`, `>`, `|`, a trailing `.`, `CON`, …) are refused for new items, and older ones are listed under **Issues**, because they would break the checkout on a Windows computer.

## Setting up sign-in (for whoever builds Moss)

Sign-in uses GitHub's **device flow**: the app shows a code, you type it at github.com/login/device. It needs only a public id, no secret.

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App. Name: Moss. Homepage and callback URL: the repository URL (the device flow never uses the callback). Tick **Enable Device Flow**. (A *GitHub App* is a different thing: its tokens expire and Moss does not refresh them.)
2. Copy the **Client ID**. Don't create a client secret.
3. Releases: add it as a repository **variable** (not a secret) named `MOSS_GITHUB_CLIENT_ID`. `release.yml` passes it to the build.
4. Local builds: `MOSS_GITHUB_CLIENT_ID=… pnpm tauri dev`. It is read at build time; `cargo clean -p moss` if the button stays disabled.

Without it the build works and the sign-in button says it isn't set up.

## How it works

```
core/src/git/      connect  disconnect  status  commit  sync  merge  conflict   (+ command, repo)
core/src/github.rs sign in, list repositories, create one
src-tauri/src/sync/ config  runtime  token  info  login  logout  repos  connect  disconnect  pause  run  schedule
```

**Credentials.** The token lives in the system keychain (`sync/token.rs`). For each Git command that needs it, it is passed through environment variables (`GIT_CONFIG_*`, an `http.extraheader`), never written to a config file, never put in the remote address, never in the command line. Git messages are scrubbed of credentials before they are shown.

**Input is checked.** The repository address is built from `owner/name` (letters, digits, `-`, `_`, `.` only); branch names must pass `git check-ref-format`; anything starting with `-` is refused so it can't be read as an option.

**One sync at a time, and saves wait their turn.**

- `Runtime::exclusive` is held for the whole of every Git operation, so a sync, a disconnect and the commit on quit never overlap.
- `AppState::lock_folder` is held while Git changes the working folder (commit and merge). The app's own saves take the same lock. Fetch and push, which use the network, run without it.

**A sync** (`git/sync.rs`): commit what changed → fetch → merge if the remote is ahead → push. A push refused because another computer got there first is retried once, with a fresh fetch and merge.

**Conflicts** (`git/conflict.rs`): the other version is saved with `create_new` (never replaces a file), without its `id:` line so the next load gives it a fresh one. If saving fails, the merge is undone completely and the error is shown; a copy is never skipped silently.

**Telling the UI.** After a pull, the app drops its cache and sends `data-changed` with the paths that changed. Open pages re-read their text if their file is in the list.

**Quitting.** Moss only commits (quick, local); the push happens at the next launch. It does not wait for the network.

**The watcher ignores `.git/`**, and `git status` only runs when something in the folder has changed since the last look, not on a timer.

## Conflict copies

A copy named "Title (from other computer)" is listed under Issues (`Issue::ConflictCopy`) with Open and Reveal. After a sync that kept both versions Moss also shows a toast ("Kept both versions of N files. See Issues."). Delete the copy once you have kept what you want. The naming lives in `core/src/names.rs`, so the Git step and the Issue check agree.

## Not done yet

- GitHub Enterprise (the address is fixed to github.com).
