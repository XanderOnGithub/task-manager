#!/usr/bin/env bash
# Records, composes and encodes README GIFs.
#   ./make-gif.sh quick-capture unsorted tasks pages
# Output: out/<name>.gif. Needs the dev server (pnpm vite) and a built bridge.
set -euo pipefail
cd "$(dirname "$0")"
GIFSKI="${GIFSKI:-gifski}"
command -v "$GIFSKI" >/dev/null || GIFSKI="$HOME/.cargo/bin/gifski"

[ -f out/wall.png ] || python3 compose.py wallpaper out --width 920 --height 580
for name in "$@"; do
  node clips.mjs "$name"
  python3 compose.py frames "out/$name" --wall out/wall.png --scale 0.62
  width=$(python3 -c "from PIL import Image; print(Image.open('out/$name/out/00000.png').width)")
  "$GIFSKI" --fps 30 --quality 90 --width "$width" -o "out/$name.gif" out/"$name"/out/*.png >/dev/null
  echo "out/$name.gif: $(du -h "out/$name.gif" | cut -f1)"
done
