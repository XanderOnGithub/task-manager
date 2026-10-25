# The Android icon

Android draws app icons as two layers and cuts them to the phone's own shape: a
circle on a Pixel, a squircle or rounded square elsewhere. Only the middle 61% of
the canvas is sure to show, so the mark can't be drawn edge to edge like the
desktop icon (`../icon-1024.png`).

- `foreground.svg`: the m and its leaf alone, at 72%, centered.
- `background.svg`: the dark ground, edge to edge.
- `monochrome.svg`: the mark in one colour, for themed icons (Android tints it).
- `icon.json`: tells `tauri icon` which file is which.

After changing an SVG: `node brand/android/render.mjs` (writes the PNGs), and commit
them. The Android workflow runs `pnpm tauri icon brand/android/icon.json`.
