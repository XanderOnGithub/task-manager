# Git sync

Moss can keep the data folder in a GitHub repository, so the same files are on every computer. It is built on the `git` already installed on the computer, so there is no sync server and Moss never has your password.

## For people

Settings → Sync: **Sign in with GitHub**, then **use a repository** from the list. On a new computer, the first screen has **Get files from GitHub**.

**What Moss can reach.** Moss is a GitHub App, so it only sees the repositories you choose on GitHub (**Choose repositories on GitHub** opens that page) and only reads and writes their files. It cannot see your other repositories, your account settings or anything else. To remove access, change the choice on that page or uninstall the app in GitHub → Settings → Applications. GitHub does not let an app create repositories, so to start fresh you create an empty one on GitHub (the app links to it), then add it to Moss's list.

- Moss commits a minute after your last change, and pulls when it opens, when its window comes to the front, and every five minutes.
- If two computers change the same page, **this computer's version stays** and the other is saved next to it as `Title (from other computer).md`. For a folder's own text (`_index.md`) the other computer's text is added at the end, under a divider. Lines added to Unsorted on both computers all survive. Nothing is thrown away.
- **Pause** stops all background work; **Stop syncing** forgets the repository (files and history stay); **Sign out** also forgets the sign-in.
- Names Windows can't store (`?`, `*`, `"`, `<`, `>`, `|`, a trailing `.`, `CON`, …) are refused for new items, and older ones are listed under **Issues**, because they would break the checkout on a Windows computer.

## Setting up sign-in (for whoever builds Moss)

Sign-in uses GitHub's **device flow**: the app shows a code, you type it at github.com/login/device. It needs only public values, no secret.

1. GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App (not an OAuth App: a classic OAuth token cannot be limited to chosen repositories).
   - Name: Moss (any free name; the part after `github.com/apps/` is the *slug*).
   - Homepage URL: the repository URL. **Callback URL**: leave empty. **Webhook**: untick Active.
   - Tick **Enable Device Flow**.
   - **Untick "Expire user authorization tokens".** Refreshing an expiring token needs a client secret, which can't be shipped in a desktop app, and Moss does not refresh. (If a token stops working anyway, Moss says "Sign in again".)
   - Repository permissions: **Contents: Read and write**. Metadata (Read) is added automatically. Nothing else.
   - Where can this be installed: **Any account** if other people will use Moss, otherwise **Only on this account**.
2. Copy the **Client ID** (starts with `Iv`). Don't create a client secret or private key.
3. Releases: add repository **variables** (not secrets) `MOSS_GITHUB_CLIENT_ID` (the Client ID) and `MOSS_GITHUB_APP_SLUG` (the slug). `release.yml` passes both to the build.
4. Local builds: `MOSS_GITHUB_CLIENT_ID=… MOSS_GITHUB_APP_SLUG=… pnpm tauri dev`. Both are read at build time; `cargo clean -p moss` if the button stays disabled.

Without the Client ID the build works and the sign-in button says it isn't set up. Without the slug, **Choose repositories on GitHub** opens GitHub's list of installed apps instead of Moss's own page.

## How it works

```
core/src/git/      connect  disconnect  status  commit  sync  merge  conflict   (+ command, repo)
core/src/github.rs sign in, list the repositories the app is installed on
src-tauri/src/sync/ config  runtime  token  info  login  logout  repos(+install page)  connect  disconnect  pause  run  schedule
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
