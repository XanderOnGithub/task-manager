# Moss on Android

The phone app is the same React app and the same Rust core in a Tauri Android shell. On a narrow screen the layout changes (drawer, sheet, bottom bar; see `ACCESSIBILITY.md`). Sync works without the `git` program, which Android doesn't have.

## Installing it on a Pixel

On the phone, open **github.com/XanderOnGithub/task-manager/releases/tag/android-latest** ("Moss for Android (test build, alpha …)" on the Releases page; the Android app is a test build on top of the current desktop release) and tap **Moss-android.apk**. Open the download; Android asks to allow installs from your browser the first time. It installs over the previous build. Then open Moss, choose **Get files from GitHub** or start empty, and sign in under Settings → Sync.

Every push to a `claude/**`, `android/**` or `release/**` branch builds a new APK and replaces the one on that page. It is a pre-release, so it never becomes the "latest" release that the desktop app's updater reads. The same APK is also attached to each run in the Actions tab (Artifacts → `Moss-android`).

### The signing key

A phone only updates an app signed with the same key. Put your own key in the repository secrets so every build uses it:

```
keytool -genkeypair -keystore moss.keystore -alias moss -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 moss.keystore        # the value of ANDROID_KEYSTORE_BASE64
```

Secrets: `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (the key's alias must be `moss`). Without them the workflow makes a key once and keeps it in the Actions cache; if GitHub drops the cache, the next APK has a different key and Android asks you to uninstall the old one first (your files on GitHub are safe; files only on the phone are not).

## How sync works here (`core/src/apisync/`)

GitHub's web API instead of Git. After every sync the app remembers each file's Git name (SHA-1) in `.moss-sync.json` in the data folder. Next time it compares, per file, what it remembered, what is on the phone, and what is on GitHub:

| Phone | GitHub | What happens |
|---|---|---|
| same as remembered | changed | brought in |
| changed | same as remembered | sent |
| changed | changed | **both kept**: the phone's version stays, GitHub's is saved as "Title (from other computer).md"; `_index.md` gets the other text added; `unsorted.md` keeps every line |

Everything that changed on the phone goes out as one commit. If another device pushes at the same moment, the sync starts again. If sending fails, nothing is lost and nothing is copied twice. Hidden files (`.git`, `.trash`, `.gitignore`) stay on their own side. Paths from GitHub are checked, so nothing from the network can write outside the data folder.

It talks to the same repository as the desktop app, so a computer using Git and a phone using the web API can sync with each other.

Limits: one request per changed file (a first sync of thousands of files takes a while), GitHub's rate limit of 5,000 requests an hour, and repositories over about 100,000 files are refused.

## What is different on a phone

- Files live in the app's private storage (nothing to grant). They are reachable only through the app and GitHub; there is no file manager view and no "Reveal".
- The GitHub token is kept in a private file of the app (the system keychain crate has no Android support). Android encrypts that storage with the screen lock.
- No in-app updates (install a new APK), no 120fps switch (the screen already runs at its own rate), no keyboard shortcuts list.
- Dragging: press and hold a row for a moment, then drag. A quick swipe scrolls.
- The back button closes the drawer or sheet or a dialog, then returns to Tasks, then leaves the app.

## Building it yourself

You need the Android SDK and NDK (`ANDROID_HOME`, `NDK_HOME`), Java 17, and the Rust target `aarch64-linux-android`.

```
pnpm tauri android init      # makes src-tauri/gen/android (it is git-ignored)
pnpm tauri android dev       # on a connected phone or emulator
pnpm tauri android build --apk --target aarch64
```

`.github/workflows/android.yml` is the reference: it also adds `windowSoftInputMode="adjustResize"` to the manifest so the page shrinks when the keyboard opens.

## Not verified on a real device

Built and tested in this repository: the sync engine (against a pretend GitHub, `core/tests/apisync.rs`), the phone layout (screenshots and axe in a browser at 412×915). Not yet tried on hardware: the APK itself, the keyboard resizing, the back button, long-press dragging, and the real GitHub round trip from a phone. Report what misbehaves.
