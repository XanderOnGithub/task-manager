"""Turns recorded frames into finished clips: the Mac window around them, the
wallpaper behind, the cursor, and key caps for shortcuts.

    python compose.py wallpaper OUT_DIR --width 1080 --height 680
        Writes wall.png (what's around the window) and wall-blur.png (what shows
        through the see-through sidebar; recorder.mjs puts it behind the page).

    python compose.py frames CLIP_DIR --wall OUT_DIR/wall.png --scale 0.5
        Composes CLIP_DIR/frames/*.png into CLIP_DIR/out/*.png.

Everything is drawn at 2x (the screenshots are 2x) and scaled at the end.
"""

import argparse
import json
import math
import os
from functools import lru_cache
from io import BytesIO

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..", "..")
S = 2  # pixels per CSS pixel in the screenshots

# Space around the window, in CSS pixels.
PAD_X, PAD_TOP, PAD_BOTTOM = 36, 30, 58
RADIUS = 12  # window corner radius
TRAFFIC = [(22, 20, "#FF5F57", "#E0443E"), (42, 20, "#FEBC2E", "#DEA123"), (62, 20, "#28C840", "#1AAB29")]


# ---------------------------------------------------------------------------
# Wallpaper: dark, mossy, soft blobs of color so the blur has something in it.
# ---------------------------------------------------------------------------

def wallpaper(w, h):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xx /= w
    yy /= h
    img = np.zeros((h, w, 3), np.float32)
    top, bottom = np.array([22, 28, 24]), np.array([10, 12, 11])
    img[:] = (top * (1 - yy[..., None]) + bottom * yy[..., None])
    # (x, y, radius, color, strength): moss, sage, a little lavender and sand.
    blobs = [
        (0.12, 0.18, 0.42, (64, 104, 74), 0.85),
        (0.85, 0.12, 0.38, (88, 126, 92), 0.55),
        (0.70, 0.92, 0.45, (46, 70, 56), 0.9),
        (0.30, 0.85, 0.30, (92, 86, 128), 0.35),
        (0.55, 0.40, 0.30, (120, 110, 84), 0.18),
    ]
    aspect = w / h
    for bx, by, r, color, k in blobs:
        d = np.sqrt(((xx - bx) * aspect) ** 2 + (yy - by) ** 2) / r
        a = np.clip(1 - d, 0, 1) ** 2 * k
        img = img * (1 - a[..., None]) + np.array(color) * a[..., None]
    # A whisper of grain so the gradients don't band in the GIF.
    rng = np.random.default_rng(7)
    img += rng.normal(0, 1.4, img.shape)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def canvas_size(width, height):
    return ((width + 2 * PAD_X) * S, (height + PAD_TOP + PAD_BOTTOM) * S)


def cmd_wallpaper(out, width, height):
    os.makedirs(out, exist_ok=True)
    cw, ch = canvas_size(width, height)
    wall = wallpaper(cw, ch)
    wall.save(os.path.join(out, "wall.png"))
    # macOS's sidebar material: heavily blurred, a little brighter and more
    # saturated than what's behind it.
    blur = wall.filter(ImageFilter.GaussianBlur(40 * S))
    arr = np.asarray(blur).astype(np.float32)
    gray = arr.mean(axis=2, keepdims=True)
    arr = gray + (arr - gray) * 1.5
    arr = arr * 1.08 + 4
    blur = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    box = (PAD_X * S, PAD_TOP * S, (PAD_X + width) * S, (PAD_TOP + height) * S)
    blur.crop(box).resize((width, height), Image.LANCZOS).save(os.path.join(out, "wall-blur.png"))


# ---------------------------------------------------------------------------
# Pieces drawn over the screenshots
# ---------------------------------------------------------------------------

def svg_image(svg, size):
    import cairosvg

    return Image.open(BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=size[0], output_height=size[1])))


@lru_cache
def cursor(kind, pressed):
    """macOS-style pointer and I-beam, drawn at 2x. Returns (image, hotspot)."""
    scale = 0.92 if pressed else 1.0
    if kind == "ibeam":
        svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 22">
          <path d="M2 2h3l1 1 1-1h3M6 3v16M2 20h3l1-1 1 1h3" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 2h3l1 1 1-1h3M6 3v16M2 20h3l1-1 1 1h3" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>"""
        w, h = int(12 * S * 1.1 * scale), int(22 * S * 1.1 * scale)
        return svg_image(svg, (w, h)), (w // 2, h // 2)
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 26">
      <path d="M3 2 L3 20.2 L7.4 16.1 L10.3 22.9 L13.4 21.6 L10.6 15 L16.6 15 Z"
            fill="#000" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>
    </svg>"""
    w, h = int(20 * S * scale), int(26 * S * scale)
    img = svg_image(svg, (w, h))
    # A soft shadow under the pointer, like macOS.
    shadow = Image.new("RGBA", (w + 16, h + 16), (0, 0, 0, 0))
    alpha = img.split()[3].point(lambda a: a * 0.35)
    shadow.paste((0, 0, 0, 255), (8, 10), alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(3))
    shadow.alpha_composite(img, (8, 8))
    return shadow, (int(3 * S * scale) + 8, int(2 * S * scale) + 8)


@lru_cache
def font(weight, size):
    from fontTools.ttLib import TTFont

    path = os.path.join(REPO, f"node_modules/@fontsource/geist-sans/files/geist-sans-latin-{weight}-normal.woff2")
    f = TTFont(path)
    f.flavor = None
    buf = BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


@lru_cache
def keycap(label):
    """A dark rounded key cap for shortcuts, e.g. "⌘ N"."""
    parts = label.split(" ")
    f = font(500, 17 * S)
    sym = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16 * S) if os.path.exists(
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf") else f
    caps = []
    for p in parts:
        use = sym if any(ord(c) > 127 for c in p) else f
        tw = int(use.getlength(p))
        w = max(34 * S, tw + 22 * S)
        h = 34 * S
        cap = Image.new("RGBA", (w, h + 3 * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(cap)
        d.rounded_rectangle((0, 3 * S, w - 1, h + 3 * S - 1), 8 * S, fill=(0, 0, 0, 120))
        d.rounded_rectangle((0, 0, w - 1, h - 1), 8 * S, fill=(38, 40, 44, 236), outline=(255, 255, 255, 30), width=S)
        d.text((w / 2, h / 2), p, font=use, fill=(236, 238, 240, 255), anchor="mm")
        caps.append(cap)
    gap = 6 * S
    total = sum(c.width for c in caps) + gap * (len(caps) - 1)
    out = Image.new("RGBA", (total, caps[0].height), (0, 0, 0, 0))
    x = 0
    for c in caps:
        out.alpha_composite(c, (x, 0))
        x += c.width + gap
    return out


def window_mask(w, h):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), RADIUS * S, fill=255)
    return m


def chrome_overlay(w, h):
    """Traffic lights and the window's hairline edge."""
    o = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(o)
    for cx, cy, fill, edge in TRAFFIC:
        r = 6 * S
        d.ellipse((cx * S - r, cy * S - r, cx * S + r, cy * S + r), fill=fill, outline=edge, width=1)
    d.rounded_rectangle((0, 0, w - 1, h - 1), RADIUS * S, outline=(255, 255, 255, 26), width=S)
    return o


def shadow_layer(cw, ch, box):
    layer = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(layer).rounded_rectangle((x0, y0 + 22 * S, x1, y1 + 22 * S), RADIUS * S, fill=(0, 0, 0, 150))
    layer = layer.filter(ImageFilter.GaussianBlur(30 * S))
    tight = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(tight).rounded_rectangle((x0 - S, y0, x1 + S, y1 + 2 * S), RADIUS * S, fill=(0, 0, 0, 110))
    layer.alpha_composite(tight.filter(ImageFilter.GaussianBlur(3 * S)))
    return layer


# ---------------------------------------------------------------------------

def cmd_frames(clip_dir, wall_path, scale, fade):
    meta = json.load(open(os.path.join(clip_dir, "clip.json")))
    w, h = meta["width"] * S, meta["height"] * S
    wall = Image.open(wall_path).convert("RGBA")
    cw, ch = wall.size
    ox, oy = PAD_X * S, PAD_TOP * S
    base = wall.copy()
    base.alpha_composite(shadow_layer(cw, ch, (ox, oy, ox + w, oy + h)))
    mask = window_mask(w, h)
    overlay = chrome_overlay(w, h)

    out = os.path.join(clip_dir, "out")
    os.makedirs(out, exist_ok=True)
    frames = sorted(os.listdir(os.path.join(clip_dir, "frames")))
    size = (round(cw * scale), round(ch * scale))
    composed = []
    for i, name in enumerate(frames):
        info = meta["frames"][i]
        shot = Image.open(os.path.join(clip_dir, "frames", name)).convert("RGBA")
        win = shot.copy()
        win.alpha_composite(overlay)
        img = base.copy()
        img.paste(win, (ox, oy), mask)
        if info["visible"]:
            cur, (hx, hy) = cursor(info["kind"], info["pressed"])
            img.alpha_composite(cur, (int(ox + info["x"] * S - hx), int(oy + info["y"] * S - hy)))
        if info.get("keycap"):
            cap = keycap(info["keycap"])
            img.alpha_composite(cap, ((cw - cap.width) // 2, ch - PAD_BOTTOM * S // 2 - cap.height // 2 - 2 * S))
        composed.append(img.convert("RGB").resize(size, Image.LANCZOS))

    # Loop cleanly: the last `fade` frames dissolve into the first.
    n = len(composed)
    for k in range(fade):
        i = n - fade + k
        a = (k + 1) / (fade + 1)
        composed[i] = Image.blend(composed[i], composed[0], a)
    for i, img in enumerate(composed):
        img.save(os.path.join(out, f"{i:05d}.png"))
    print(f"composed {n} frames at {size[0]}x{size[1]}")


def cmd_stage(out, width, height, stage_w, stage_h, win_scale):
    """The trailer's backdrop: a wallpaper the size of the video (at 2x), and
    the blurred piece of it that sits behind the window when the window is
    centered at `win_scale`."""
    os.makedirs(out, exist_ok=True)
    W, H = stage_w * 2, stage_h * 2
    wall = wallpaper(W, H)
    wall.save(os.path.join(out, "stage.jpg"), quality=94)
    ww, wh = width * win_scale * 2, height * win_scale * 2
    x0, y0 = (W - ww) / 2, (H - wh) / 2
    blur = wall.filter(ImageFilter.GaussianBlur(40 * S))
    arr = np.asarray(blur).astype(np.float32)
    gray = arr.mean(axis=2, keepdims=True)
    arr = (gray + (arr - gray) * 1.5) * 1.08 + 4
    blur = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    blur.crop((round(x0), round(y0), round(x0 + ww), round(y0 + wh))).resize((width, height), Image.LANCZOS).save(
        os.path.join(out, "stage-blur.png"))
    # The light theme's material is pale: the same blur, washed toward white.
    light = Image.open(os.path.join(out, "stage-blur.png")).convert("RGB")
    Image.blend(light, Image.new("RGB", light.size, (236, 238, 236)), 0.8).save(os.path.join(out, "stage-blur-light.png"))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("wallpaper")
    a.add_argument("out")
    a.add_argument("--width", type=int, default=1080)
    a.add_argument("--height", type=int, default=680)
    b = sub.add_parser("frames")
    b.add_argument("clip")
    b.add_argument("--wall", required=True)
    b.add_argument("--scale", type=float, default=0.5)
    b.add_argument("--fade", type=int, default=10)
    c = sub.add_parser("stage")
    c.add_argument("out")
    c.add_argument("--width", type=int, default=1280)
    c.add_argument("--height", type=int, default=800)
    c.add_argument("--stage-width", type=int, default=1920)
    c.add_argument("--stage-height", type=int, default=1080)
    c.add_argument("--win-scale", type=float, default=1.125)
    args = p.parse_args()
    if args.cmd == "stage":
        cmd_stage(args.out, args.width, args.height, args.stage_width, args.stage_height, args.win_scale)
    elif args.cmd == "wallpaper":
        cmd_wallpaper(args.out, args.width, args.height)
    else:
        cmd_frames(args.clip, args.wall, args.scale, args.fade)
