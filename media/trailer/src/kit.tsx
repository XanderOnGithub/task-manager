// Building blocks for the trailer: the stage (wallpaper + camera), the Mac
// window playing a recorded shot, the cursor, key caps and titles.

import { type CSSProperties, type ReactNode } from 'react'
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import shotsData from './shots.json'

export const C = {
  bg: '#0B0D0C',
  fg: '#ECECEE',
  fg2: '#A9A9B2',
  fg3: '#8A8A94',
  accent: '#8FB996',
  leaf: '#B9D8B0',
  panel: '#16171A',
  onAccent: '#0B0C10',
}
export const SANS = 'Geist, system-ui, sans-serif'
export const MONO = '"Geist Mono", ui-monospace, monospace'

// The window: 1280×800 CSS pixels in the recordings, shown 1.125× (1440×900),
// centered on the 1920×1080 stage. compose.py's `stage` command uses the same
// numbers to cut the blur behind the sidebar, so they must stay in step.
export const WIN = { w: 1280, h: 800, k: 1.125 }
export const STAGE = { w: 1920, h: 1080 }
export const WIN_X = (STAGE.w - WIN.w * WIN.k) / 2
export const WIN_Y = (STAGE.h - WIN.h * WIN.k) / 2

type Frame = { x: number; y: number; v: number; k: string; p: number; c?: string }
type Shot = { fps: number; width: number; height: number; frames: Frame[] }
const SHOTS = shotsData as unknown as Record<string, Shot>

/** Apple-ish ease: quick start, long soft landing. */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1)
export const INOUT = Easing.bezier(0.65, 0, 0.35, 1)

/** Which recorded frame to show at trailer frame `f` (60fps). `speed` < 1 is slow motion. */
export function shotFrame(name: string, f: number, speed = 1) {
  const shot = SHOTS[name]
  if (!shot) throw new Error(`No shot "${name}". Run the recorder and scripts/index-shots.mjs.`)
  const i = Math.floor((f * speed * shot.fps) / 60)
  return { shot, i: Math.max(0, Math.min(shot.frames.length - 1, i)) }
}

// ---------------------------------------------------------------------------
// Camera: keyframes of (scale, focus point in window pixels). The focus point
// lands in the middle of the stage.
// ---------------------------------------------------------------------------

export type Cam = { at: number; s: number; x: number; y: number; ox?: number; oy?: number }

export function camAt(keys: Cam[], f: number) {
  if (f <= keys[0].at) return keys[0]
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]
    const b = keys[i]
    if (f <= b.at) {
      const t = INOUT((f - a.at) / (b.at - a.at))
      const mix = (p: number, q: number) => p + (q - p) * t
      return { at: f, s: mix(a.s, b.s), x: mix(a.x, b.x), y: mix(a.y, b.y), ox: mix(a.ox ?? 0, b.ox ?? 0), oy: mix(a.oy ?? 0, b.oy ?? 0) }
    }
  }
  return keys[keys.length - 1]
}

/** Wallpaper plus everything on it, moved by the camera. */
export function Stage({ cam, children, dim = 0 }: { cam: Cam[]; children: ReactNode; dim?: number }) {
  const f = useCurrentFrame()
  const c = camAt(cam, f)
  // Point (x, y) of the window, in stage pixels, goes to the stage's center.
  const qx = WIN_X + WIN.k * c.x
  const qy = WIN_Y + WIN.k * c.y
  const transform = `translate(${STAGE.w / 2 + (c.ox ?? 0)}px, ${STAGE.h / 2 + (c.oy ?? 0)}px) scale(${c.s}) translate(${-qx}px, ${-qy}px)`
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform, transformOrigin: '0 0' }}>
        <Img src={staticFile('stage.jpg')} style={{ position: 'absolute', width: STAGE.w, height: STAGE.h }} />
        {children}
      </AbsoluteFill>
      {dim > 0 && <AbsoluteFill style={{ background: `rgba(6,8,7,${dim})` }} />}
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

const TRAFFIC = [
  [22, '#FF5F57', '#E0443E'],
  [42, '#FEBC2E', '#DEA123'],
  [62, '#28C840', '#1AAB29'],
] as const

/** The Mac window showing shot `name`. `f` is the frame inside the scene. */
export function Window({
  name,
  f,
  speed = 1,
  style,
  cursor = true,
  clip,
}: {
  name: string
  f: number
  speed?: number
  style?: CSSProperties
  cursor?: boolean
  /** 0–1: how much of the window, from the left, shows this shot (for wipes). */
  clip?: number
}) {
  const { i, shot } = shotFrame(name, f, speed)
  const frame = shot.frames[i]
  const src = staticFile(`shots/${name}/frames/${String(i).padStart(5, '0')}.jpg`)
  return (
    <div
      style={{
        position: 'absolute',
        left: WIN_X,
        top: WIN_Y,
        width: WIN.w * WIN.k,
        height: WIN.h * WIN.k,
        borderRadius: 12 * WIN.k,
        boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.5)',
        clipPath: clip != null ? `inset(0 ${(1 - clip) * 100}% 0 0 round ${12 * WIN.k}px)` : undefined,
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: 12 * WIN.k, overflow: 'hidden' }}>
        <Img src={src} style={{ width: '100%', height: '100%', display: 'block' }} />
        {TRAFFIC.map(([x, fill, edge]) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: (x - 6) * WIN.k,
              top: (20 - 6) * WIN.k,
              width: 12 * WIN.k,
              height: 12 * WIN.k,
              borderRadius: '50%',
              background: fill,
              boxShadow: `inset 0 0 0 0.6px ${edge}`,
            }}
          />
        ))}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 12 * WIN.k, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }} />
      </div>
      {cursor && frame.v ? <Cursor x={frame.x * WIN.k} y={frame.y * WIN.k} kind={frame.k} pressed={!!frame.p} /> : null}
    </div>
  )
}

export function Cursor({ x, y, kind, pressed }: { x: number; y: number; kind: string; pressed: boolean }) {
  const s = (pressed ? 0.9 : 1) * WIN.k
  if (kind === 'i')
    return (
      <svg width={12 * s} height={22 * s} viewBox="0 0 12 22" style={{ position: 'absolute', left: x - 6 * s, top: y - 11 * s }}>
        <path d="M2 2h3l1 1 1-1h3M6 3v16M2 20h3l1-1 1 1h3" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 2h3l1 1 1-1h3M6 3v16M2 20h3l1-1 1 1h3" fill="none" stroke="#000" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  return (
    <svg
      width={20 * s}
      height={26 * s}
      viewBox="0 0 20 26"
      style={{ position: 'absolute', left: x - 3 * s, top: y - 2 * s, filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))' }}
    >
      <path d="M3 2 L3 20.2 L7.4 16.1 L10.3 22.9 L13.4 21.6 L10.6 15 L16.6 15 Z" fill="#000" stroke="#fff" strokeWidth={1.7} strokeLinejoin="round" />
    </svg>
  )
}

/** The shortcut being pressed in shot `name`, shown at the bottom of the frame. */
export function KeyCaps({ name, f, speed = 1 }: { name: string; f: number; speed?: number }) {
  const { shot, i } = shotFrame(name, f, speed)
  // Fade in and out by looking a few frames around.
  const near = (d: number) => shot.frames[Math.max(0, Math.min(shot.frames.length - 1, i + d))]?.c
  const label = shot.frames[i].c ?? near(-6) ?? near(6)
  if (!label) return null
  const on = shot.frames[i].c ? 1 : 0
  const fadeIn = near(-6) ? 1 : 0.0
  const opacity = on ? 1 : 0.35 * fadeIn
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center', gap: 10, opacity }}>
      {/* Geist has no ↩, and a Mac's key says "return" anyway. */}
      {label.split(' ').map((k) => (k === '↩' ? 'return' : k)).map((k) => (
        <div
          key={k}
          style={{
            minWidth: 64,
            height: 64,
            padding: '0 18px',
            borderRadius: 14,
            background: 'rgba(36,38,42,0.92)',
            boxShadow: '0 6px 0 rgba(0,0,0,0.45), inset 0 0 0 1.5px rgba(255,255,255,0.12)',
            color: C.fg,
            font: `500 30px ${SANS}`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {k}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/** A line that arrives soft (rises, sharpens) and leaves the same way. */
export function Line({
  children,
  delay = 0,
  out,
  size = 96,
  weight = 600,
  color = C.fg,
  style,
}: {
  children: ReactNode
  delay?: number
  /** Frame (inside the scene) to start leaving. */
  out?: number
  size?: number
  weight?: number
  color?: string
  style?: CSSProperties
}) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame: f - delay, fps, config: { damping: 200, mass: 0.9, stiffness: 90 } })
  const leave = out == null ? 0 : interpolate(f, [out, out + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) })
  const opacity = enter * (1 - leave)
  return (
    <div
      style={{
        font: `${weight} ${size}px/1.05 ${SANS}`,
        letterSpacing: '-0.035em',
        color,
        opacity,
        transform: `translateY(${(1 - enter) * 22 - leave * 10}px)`,
        filter: `blur(${(1 - enter) * 10 + leave * 8}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Full-frame title on the dark backdrop. */
export function Title({ text, sub, out }: { text: string; sub?: string; out: number }) {
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 26 }}>
      <Line out={out}>{text}</Line>
      {sub && (
        <Line delay={10} out={out} size={40} weight={500} color={C.fg3}>
          {sub}
        </Line>
      )}
    </AbsoluteFill>
  )
}

/** Fades a scene in from black and out to black. */
export function Fade({ children, inFor = 14, outAt, outFor = 14 }: { children: ReactNode; inFor?: number; outAt?: number; outFor?: number }) {
  const f = useCurrentFrame()
  let o = interpolate(f, [0, inFor], [0, 1], { extrapolateRight: 'clamp' })
  if (outAt != null) o *= interpolate(f, [outAt, outAt + outFor], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
}
