// The Moss trailer: about 50 seconds at 60fps, 1920×1080, silent for now.
//
// Each scene is a <Sequence>; inside it, frame 0 is the scene's first frame.
// Shots are recordings of the real app (media/capture/shots.mjs). Camera
// keyframes say how far to zoom (s) and which window pixel (x, y) to center.

import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, type Cam, Fade, KeyCaps, Line, MONO, SANS, shotFrame, Stage, Title, Window } from './kit'

type Scene = { name: string; len: number; render: () => React.ReactNode }

/** A shot of the app with a camera move. */
function Shot({ name, cam, speed = 1, keys = false, enter = false }: { name: string; cam: Cam[]; speed?: number; keys?: boolean; enter?: boolean }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  // The first shot rises into place; the rest just cut in.
  const rise = enter ? spring({ frame: f, fps, config: { damping: 200, stiffness: 70 } }) : 1
  return (
    <>
      <Stage cam={cam}>
        <Window name={name} f={f} speed={speed} style={{ opacity: rise, transform: `translateY(${(1 - rise) * 60}px) scale(${0.96 + 0.04 * rise})` }} />
      </Stage>
      {keys && <KeyCaps name={name} f={f} speed={speed} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// The wordmark, drawn stroke by stroke (same drawing as src/components/Brand.tsx).
// ---------------------------------------------------------------------------

function Wordmark({ start = 0, width = 760 }: { start?: number; width?: number }) {
  const f = useCurrentFrame()
  const draw = (from: number, len: number) =>
    interpolate(f - start, [from, from + len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  const pop = (from: number) => {
    const t = interpolate(f - start, [from, from + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2)) })
    return { opacity: Math.min(1, t * 1.6), t }
  }
  const leaf = pop(48)
  const ring = pop(60)
  return (
    <svg viewBox="-26 39.9 698.7 198.1" width={width}>
      <g fill="none" stroke={C.accent} strokeWidth={40}>
        <path pathLength={1} strokeDasharray={1} strokeDashoffset={draw(0, 50)} strokeLinejoin="round"
          d="M 0 230 V 148.3 A 47.4 47.4 0 0 1 94.8 148.3 V 230 M 94.8 148.3 A 47.4 47.4 0 0 1 189.6 148.3 V 230 M 247.6 155.4 A 54.6 54.6 0 1 1 356.7 155.4 A 54.6 54.6 0 1 1 247.6 155.4 Z" />
        <path pathLength={1} strokeDasharray={1} strokeDashoffset={draw(18, 44)} strokeLinecap="round"
          d="M 472 113.7 A 31 27.3 0 1 0 445.7 155.4 A 31 27.3 0 1 1 419.4 197.2 M 592 113.7 A 31 27.3 0 1 0 565.7 155.4 A 31 27.3 0 1 1 539.4 197.2" />
      </g>
      <g transform="translate(186.1 103.9)" opacity={leaf.opacity}>
        <path transform={`rotate(-42) scale(${0.4348 * leaf.t})`} d="M -6 0 C 30 -46 92 -62 148 -50 C 122 4 58 28 -6 0 Z" fill={C.leaf} />
      </g>
      <circle cx="643.7" cy="84.9" r={15 * ring.t} fill="none" stroke={C.leaf} strokeWidth={12} opacity={ring.opacity} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

function Hierarchy({ len }: { len: number }) {
  const words = ['Areas.', 'Projects.', 'Milestones.', 'Tasks.']
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 30 }}>
        {words.map((w, i) => (
          <Line key={w} delay={i * 12} out={len - 22} size={84} color={i === 3 ? C.fg : C.fg2}>
            {w}
          </Line>
        ))}
      </div>
    </AbsoluteFill>
  )
}

/** The page as it sits on disk, next to the app. */
function Files({ len }: { len: number }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const slide = spring({ frame: f - 8, fps, config: { damping: 200, stiffness: 80 } })
  const { shot } = shotFrame('pages', 0)
  const last = shot.frames.length - 1
  const lines = FILE_TEXT.split('\n')
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Stage cam={[{ at: 0, s: 0.98, x: 640, y: 400 }, { at: 30, s: 0.62, x: 640, y: 400, ox: -420, oy: 60 }]}>
        <Window name="pages" f={last * 2} cursor={false} />
      </Stage>
      <div
        style={{
          position: 'absolute',
          left: 1010,
          top: 330,
          width: 800,
          padding: '26px 34px 30px',
          borderRadius: 18,
          background: 'rgba(20,22,21,0.94)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
          opacity: slide,
          transform: `translateX(${(1 - slide) * 80}px)`,
        }}
      >
        <div style={{ font: `500 22px ${MONO}`, color: C.fg3, marginBottom: 18 }}>Kitchen measurements.md</div>
        {lines.map((line, i) => {
          const show = interpolate(f, [20 + i * 4, 30 + i * 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          const meta = line === '---' || /^[a-z]+:/.test(line)
          return (
            <div key={i} style={{ font: `400 25px/1.6 ${MONO}`, color: meta ? C.fg3 : line.startsWith('- [x]') ? C.accent : C.fg, opacity: show, whiteSpace: 'pre' }}>
              {line || ' '}
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 1010, top: 150 }}>
        <Line delay={4} out={len - 20} size={64}>Just markdown files.</Line>
        <Line delay={14} out={len - 20} size={36} weight={500} color={C.fg3} style={{ marginTop: 16 }}>
          In a folder you choose.
        </Line>
      </div>
    </AbsoluteFill>
  )
}

/** Dark to light across the same view. */
function ThemeWipe() {
  const f = useCurrentFrame()
  const p = interpolate(f, [40, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  const cam: Cam[] = [{ at: 0, s: 1.02, x: 640, y: 400 }, { at: 180, s: 1.1, x: 660, y: 380 }]
  return (
    <Stage cam={cam}>
      <Window name="list-dark" f={f} cursor={false} />
      <Window name="list-light" f={f} cursor={false} clip={p} style={{ boxShadow: 'none' }} />
    </Stage>
  )
}

function End({ len }: { len: number }) {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const icon = spring({ frame: f, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } })
  const pill = spring({ frame: f - 70, fps, config: { damping: 200, stiffness: 90 } })
  const out = interpolate(f, [len - 30, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <Img src={staticFile('icon.svg')} style={{ width: 230, height: 230, transform: `scale(${0.6 + 0.4 * icon})`, opacity: Math.min(1, icon * 1.5), marginBottom: 6 }} />
      <div style={{ marginTop: 10 }}>
        <Wordmark start={14} width={430} />
      </div>
      <div
        style={{
          marginTop: 56,
          padding: '20px 44px',
          borderRadius: 999,
          background: C.accent,
          color: C.onAccent,
          font: `600 34px ${SANS}`,
          letterSpacing: '-0.01em',
          opacity: pill,
          transform: `translateY(${(1 - pill) * 18}px)`,
        }}
      >
        Download Moss
      </div>
      <div style={{ marginTop: 26, font: `500 26px ${SANS}`, color: C.fg3, opacity: pill }}>Mac · Windows · Linux</div>
    </AbsoluteFill>
  )
}

// The file as Moss wrote it during the "pages" shot (kept here so the trailer
// doesn't depend on a temp folder).
const FILE_TEXT = `---
id: NOTEKITC01
order: l
created: 2026-10-05
---
Counter: 96 in. Sink cutout: 33 x 22 in.

- [x] Order the faucet
- [ ] Pick up grout`

export const SCENES: Scene[] = [
  { name: 'Write it down', len: 140, render: () => <Title text="Write it down." out={112} /> },
  {
    name: 'Capture',
    len: 300,
    render: () => (
      <Fade outAt={286}>
        <Shot name="capture" keys enter
          cam={[
            { at: 0, s: 1.0, x: 640, y: 400 },
            { at: 40, s: 1.0, x: 640, y: 400 },
            { at: 80, s: 1.6, x: 640, y: 175 },
            { at: 200, s: 1.6, x: 640, y: 175 },
            { at: 250, s: 1.25, x: 760, y: 330 },
            { at: 300, s: 1.22, x: 760, y: 336 },
          ]} />
      </Fade>
    ),
  },
  {
    name: 'Wordmark',
    len: 150,
    render: () => (
      <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Fade outAt={128} inFor={1}>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Wordmark start={6} />
          </AbsoluteFill>
        </Fade>
      </AbsoluteFill>
    ),
  },
  { name: 'Sort it later', len: 100, render: () => <Title text="Sort it later." out={74} /> },
  {
    name: 'Unsorted',
    len: 300,
    render: () => (
      <Fade outAt={286}>
        <Shot name="unsorted" cam={[{ at: 0, s: 1.3, x: 760, y: 290 }, { at: 300, s: 1.38, x: 760, y: 320 }]} />
      </Fade>
    ),
  },
  { name: 'Hierarchy', len: 130, render: () => <Hierarchy len={130} /> },
  {
    name: 'Tree',
    len: 220,
    render: () => (
      <Fade outAt={206}>
        <Shot name="tree"
          cam={[
            { at: 0, s: 1.75, x: 200, y: 280 },
            { at: 110, s: 1.75, x: 210, y: 290 },
            { at: 170, s: 1.1, x: 640, y: 400 },
            { at: 220, s: 1.08, x: 640, y: 400 },
          ]} />
      </Fade>
    ),
  },
  {
    name: 'Complete',
    len: 150,
    render: () => (
      <Fade outAt={138} inFor={8}>
        <Shot name="complete" cam={[{ at: 0, s: 2.0, x: 600, y: 270 }, { at: 150, s: 2.1, x: 640, y: 250 }]} />
      </Fade>
    ),
  },
  {
    name: 'Drag (slow motion)',
    len: 240,
    render: () => (
      <Fade outAt={226} inFor={8}>
        <Shot name="drag" speed={0.5} cam={[{ at: 0, s: 1.5, x: 600, y: 280 }, { at: 240, s: 1.56, x: 640, y: 290 }]} />
      </Fade>
    ),
  },
  { name: 'Write it out', len: 100, render: () => <Title text="Write it out." out={74} /> },
  {
    name: 'Pages',
    len: 330,
    render: () => (
      <Fade outAt={318}>
        <Shot name="pages" keys cam={[{ at: 0, s: 1.6, x: 560, y: 210 }, { at: 330, s: 1.6, x: 560, y: 240 }]} />
      </Fade>
    ),
  },
  { name: 'Files', len: 270, render: () => <Fade outAt={256}><Files len={270} /></Fade> },
  {
    name: 'Command palette',
    len: 190,
    render: () => (
      <Fade outAt={176}>
        <Shot name="palette" keys cam={[{ at: 0, s: 1.15, x: 640, y: 330 }, { at: 70, s: 1.35, x: 640, y: 260 }, { at: 190, s: 1.3, x: 640, y: 280 }]} />
      </Fade>
    ),
  },
  { name: 'Light and dark', len: 180, render: () => <Fade outAt={166}><ThemeWipe /></Fade> },
  { name: 'End', len: 290, render: () => <End len={290} /> },
]

export const DURATION = SCENES.reduce((n, s) => n + s.len, 0)

export function Trailer() {
  let at = 0
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {SCENES.map((s) => {
        const from = at
        at += s.len
        return (
          <Sequence key={s.name} name={s.name} from={from} durationInFrames={s.len}>
            {s.render()}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
