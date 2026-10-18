# Media: README GIFs and the trailer

Everything here is made from the real app: the actual React front end running
in a headless Chrome, talking to the actual Rust core over a tiny local
server, on a fresh copy of `sample-data/`. Nothing is redrawn by hand, so when
the app changes you re-run the scripts and the GIFs and trailer change with it.

```
media/
├── readme/       the four GIFs the README shows (committed)
├── bridge/       Rust: the core behind a localhost HTTP server (stands in for Tauri)
├── capture/      Node + Python: records, frames and encodes the clips
│   ├── tauri-stub.js   replaces Tauri's `invoke` in the browser
│   ├── recorder.mjs    frame-by-frame recording (see "How recording works")
│   ├── clips.mjs       the README clips: quick-capture, unsorted, tasks, pages
│   ├── shots.mjs       the trailer's footage (60fps; the drag at 120fps)
│   ├── compose.py      wallpaper, window frame, traffic lights, cursor, key caps
│   ├── make-gif.sh     record → compose → encode, per clip
│   └── explore.mjs     helper for writing clips: screenshot + list of selectors
└── trailer/      Remotion (React video): titles, camera moves, the end card
```

## One-time setup

```sh
# The bridge (only needs rebuilding when core changes)
cargo build --release --manifest-path media/bridge/Cargo.toml

# Recording tools
cd media/capture && npm install
pip install pillow numpy cairosvg fonttools brotli
cargo install gifski        # GIF encoder; much cleaner than ffmpeg's

# Trailer
cd media/trailer && npm install
```

Recording uses an installed Chrome. Set `CHROME=/path/to/chrome` if it isn't at
`/opt/google/chrome/chrome` (on a Mac: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).

## README GIFs

```sh
pnpm vite                                   # in the repo root, leave it running
cd media/capture
./make-gif.sh quick-capture unsorted tasks pages
cp out/*.gif ../readme/
```

Each clip is a few seconds, one idea, and loops by dissolving its last frames
into its first. The window is 920×580 so text stays readable at README width.

## Trailer

```sh
pnpm vite                                   # in the repo root
cd media/capture
python3 compose.py stage ../trailer/public  # the backdrop (once)
node shots.mjs                              # all shots, or name some: node shots.mjs drag pages
cd ../trailer
node scripts/index-shots.mjs                # cursor + key cap data → src/shots.json
npm run studio                              # preview and scrub in the browser
REMOTION_CHROME=/opt/google/chrome/chrome npm run render   # → out/moss-trailer.mp4
```

The timeline is `SCENES` in `trailer/src/Trailer.tsx`: one entry per scene with
its length in frames (60 per second). Camera keyframes give a zoom and the
window pixel (out of 1280×800) to center. It's silent; to add music, put the
track in `trailer/public/` and add `<Audio src={staticFile('track.mp3')} />` in
`Trailer`, then nudge scene lengths onto the beat.

## How recording works

The page's clock is fake and paused (Playwright's `clock`). For each frame the
recorder moves it forward exactly 1/fps, steps every running CSS and Web
Animation by the same amount (Motion runs transforms and opacity through
those), waits for the bridge to finish any command, then screenshots. So
springs are perfectly smooth on any machine, and every run is identical.

The cursor and key caps aren't in the screenshots. The recorder logs them per
frame (`clip.json`) and `compose.py` or the trailer draws them.

Two things to know when writing clips:

- Keep the data folder outside the repo (the recorder uses the system temp
  folder): Vite reloads the page when a `.md` file inside the repo changes.
- The bridge stamps new Unsorted lines with `MOSS_NOW`, so recordings always
  show the same time.
