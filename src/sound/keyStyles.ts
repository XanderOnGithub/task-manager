// The typing styles built from parts (see keySynth.ts). Each style is a few
// short layers modelled on what makes the real sound:
//
// - Creamy: a lubed switch. Bottom-out is a soft low thock (sine, falling 30%,
//   2-3 ms attack) with a quiet case ring and a faint clack. No highs, no ping.
// - Popping: bubble wrap. A bright snap of noise, then the small air pocket
//   ringing (sine, falling 20%), then a tiny crunch at a random moment.
// - Mouth pop: a Helmholtz resonator. Lower and rounder than bubble wrap: a
//   damped sine, falling 13%, with a near-silent lip tick.
// - Water drops: a bubble ringing in water. The pitch chirps up 40% and rings
//   out, a smaller second bubble follows at a random moment, then a quiet echo.
// - Clicky: a Cherry MX Blue. A bright click at the actuation point, a harder
//   thock right behind it (8-16 ms; the gap varies a little every press, which
//   sounds more natural than varying pitch), a faint spring ping, and a second
//   click as the key comes back up. A wider gap (25-50 ms) sounds like two
//   separate sounds, so it is kept tight.
//
// The voices are fixed: a letter, a capital or symbol, space, return and
// backspace each have one character, and every press varies only by ±2.5%
// pitch and ±10% level (see keySynth.ts). Never per letter: that sounds like a melody.

import type { Voice } from './keySynth'

export type KeyKind = 'key' | 'keyShift' | 'keySpace' | 'keyEnter' | 'keyDelete'

/** How a kind of key differs from a letter: pitch, how long it rings, how loud. */
interface Feel {
  pitch: number
  length: number
  level: number
}

interface KeyStyle {
  /** The letter key. Backspace plays only this. */
  body: Voice[]
  /** Added on every key but Backspace: the details that make a press feel real. */
  extras?: Voice[]
  /** Added on the space bar: stabilizer rattle. */
  space?: Voice[]
  /** When the key comes back up. A list is its own sound; `Feel` is the body, changed (quieter, shorter, higher). */
  release?: Voice[] | Feel
  /** How each kind of key differs from a letter. */
  feel: Record<KeyKind, Feel>
}

/** The same voices, moved: tones by `pitch`, every layer's decay by `length`, level by `level`. */
function tune(voices: Voice[], { pitch, length, level }: Feel): Voice[] {
  return voices.map((v) => ({
    ...v,
    hz: v.wave === 'noise' ? v.hz : v.hz * pitch,
    to: v.to === undefined ? undefined : v.to * pitch,
    decayMs: v.decayMs * length,
    gain: v.gain * level,
  }))
}

/** A voice whose glide runs the other way: a falling sound becomes a rising one. */
function reversed(voice: Voice): Voice {
  return voice.to === undefined ? voice : { ...voice, hz: voice.to, to: voice.hz }
}

/** The layers for pressing a kind of key. */
export function pressVoices(style: KeyStyle, kind: KeyKind): Voice[] {
  const feel = style.feel[kind]
  if (kind === 'keyDelete') {
    // Backspace takes the sound back out: the body, gliding the other way.
    const body = tune(style.body, feel)
    const first = body.findIndex((v) => v.to !== undefined)
    return first < 0 ? body : body.map((v, i) => (i === first ? reversed(v) : v))
  }
  return tune([...style.body, ...(style.extras ?? []), ...(kind === 'keySpace' ? (style.space ?? []) : [])], feel)
}

/** The layers for letting go of a kind of key, or none if this style has no release sound. */
export function releaseVoices(style: KeyStyle, kind: KeyKind): Voice[] {
  if (!style.release) return []
  const feel = style.feel[kind]
  if (Array.isArray(style.release)) return tune(style.release, feel)
  // The same sound, shorter, higher and quieter (about half).
  const { pitch, length, level } = style.release
  return tune(style.body, { pitch: feel.pitch * pitch, length: feel.length * length, level: feel.level * level })
}

// A quiet noise tick, used for stabilizer rattle and small taps.
const tick = (hz: number, gain: number, at: Voice['at'], decayMs = 2.5): Voice => ({
  wave: 'noise',
  hz: 0,
  filter: { type: 'bandpass', hz: Math.min(hz, 2200), q: 1 },
  attackMs: 0.6,
  decayMs,
  gain,
  at,
})

export const KEY_STYLES = {
  creamy: {
    body: [
      // Bottom-out: the thock. The 2.5 ms attack is what makes it soft.
      { wave: 'sine', hz: 220, to: 154, glideMs: 20, attackMs: 2.5, decayMs: 55, gain: 0.4 },
      // The case ringing, quietly.
      { wave: 'sine', hz: 700, attackMs: 1, decayMs: 22, gain: 0.05 },
      // A faint clack, about 30% of the thock.
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 2200, q: 1 }, attackMs: 0.6, decayMs: 5, gain: 0.196 },
    ],
    // The space bar's stabilizers, rattling twice, very quietly.
    space: [tick(3000, 0.12, [8, 22]), tick(2800, 0.1, [26, 48])],
    // Letting go: the same sound, half as loud, shorter and a little higher.
    release: { pitch: 1.15, length: 0.7, level: 0.5 },
    feel: {
      key: { pitch: 1, length: 1, level: 1 },
      keyShift: { pitch: 0.88, length: 1.1, level: 1.05 },
      keySpace: { pitch: 0.68, length: 1.3, level: 1.1 },
      keyEnter: { pitch: 0.6, length: 1.4, level: 1.15 },
      keyDelete: { pitch: 0.95, length: 0.9, level: 0.85 },
    },
  },

  pop: {
    body: [
      // The membrane tearing: a very short, bright burst.
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 2200, q: 0.7 }, attackMs: 0.6, decayMs: 2, gain: 0.294 },
      // The air pocket ringing, falling 20%.
      { wave: 'sine', hz: 1200, to: 960, glideMs: 15, attackMs: 0.3, decayMs: 20, gain: 0.28 },
    ],
    // A mini-snap a few milliseconds later, at a random moment.
    extras: [tick(3500, 0.3, [5, 15], 1.5)],
    feel: {
      key: { pitch: 1, length: 1, level: 1 },
      keyShift: { pitch: 0.85, length: 1.2, level: 1.05 },
      keySpace: { pitch: 0.7, length: 1.7, level: 1.1 },
      keyEnter: { pitch: 0.58, length: 2, level: 1.15 },
      keyDelete: { pitch: 0.9, length: 1, level: 0.85 },
    },
  },

  mouth: {
    body: [
      // The lip letting go: barely there.
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 2200, q: 1 }, attackMs: 0.6, decayMs: 0.8, gain: 0.084 },
      // The mouth ringing as the pressure evens out, falling 13%.
      { wave: 'sine', hz: 520, to: 452, glideMs: 30, attackMs: 0.3, decayMs: 45, gain: 0.38 },
    ],
    feel: {
      key: { pitch: 1, length: 1, level: 1 },
      keyShift: { pitch: 0.88, length: 1.1, level: 1.05 },
      keySpace: { pitch: 0.7, length: 1.3, level: 1.1 },
      keyEnter: { pitch: 0.6, length: 1.4, level: 1.15 },
      keyDelete: { pitch: 0.9, length: 1, level: 0.85 },
    },
  },

  water: {
    body: [
      // The bubble: a chirp up 40% that rings out.
      { wave: 'sine', hz: 1000, to: 1400, glideMs: 30, attackMs: 1, decayMs: 100, gain: 0.32 },
      // The drop hitting the surface.
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 2200, q: 1 }, attackMs: 0.6, decayMs: 1.5, gain: 0.07 },
      // The room: two quiet, dulled echoes of the bubble.
      { wave: 'sine', hz: 1000, to: 1400, glideMs: 30, attackMs: 1, decayMs: 100, gain: 0.07, at: 95, filter: { type: 'lowpass', hz: 2500 } },
      { wave: 'sine', hz: 1000, to: 1400, glideMs: 30, attackMs: 1, decayMs: 100, gain: 0.03, at: 175, filter: { type: 'lowpass', hz: 2000 } },
    ],
    // A smaller second bubble, lower, at a random moment.
    extras: [{ wave: 'sine', hz: 760, to: 990, glideMs: 25, attackMs: 1, decayMs: 70, gain: 0.12, at: [40, 120] }],
    feel: {
      key: { pitch: 1, length: 1, level: 1 },
      keyShift: { pitch: 0.82, length: 1.15, level: 1.05 },
      keySpace: { pitch: 0.55, length: 1.5, level: 1.1 },
      keyEnter: { pitch: 0.45, length: 1.8, level: 1.15 },
      keyDelete: { pitch: 1, length: 0.6, level: 0.8 },
    },
  },

  clicky: {
    body: [
      // The click leaf: a short ringing tone and a burst of noise, loudest and brightest.
      { wave: 'sine', hz: 2000, attackMs: 0.6, decayMs: 5, gain: 0.16 },
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 2200, q: 1 }, attackMs: 0.6, decayMs: 1, gain: 0.98 },
      // Bottom-out just after: a short, hard thock, with some mid noise.
      { wave: 'triangle', hz: 240, to: 188, glideMs: 12, attackMs: 0.8, decayMs: 28, gain: 0.26, at: [8, 16], link: 'bottom' },
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 1650, q: 0.8 }, attackMs: 0.6, decayMs: 6, gain: 0.21, at: [8, 16], link: 'bottom' },
    ],
    // The spring, faintly.
    extras: [{ wave: 'sine', hz: 4500, attackMs: 0.5, decayMs: 30, gain: 0.02, at: 2 }],
    space: [tick(3000, 0.1, [10, 24]), tick(2600, 0.08, [30, 52])],
    // Letting go: the leaf clicks again at about 60% and a little higher, then the key tops out.
    release: [
      { wave: 'sine', hz: 3300, attackMs: 0.2, decayMs: 4, gain: 0.14 },
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 2200, q: 1 }, attackMs: 0.6, decayMs: 1, gain: 0.588 },
      { wave: 'noise', hz: 0, filter: { type: 'bandpass', hz: 1800, q: 0.8 }, attackMs: 0.6, decayMs: 5, gain: 0.154, at: 8 },
    ],
    feel: {
      key: { pitch: 1, length: 1, level: 1 },
      keyShift: { pitch: 0.92, length: 1.1, level: 1.05 },
      keySpace: { pitch: 0.7, length: 1.3, level: 1.1 },
      keyEnter: { pitch: 0.62, length: 1.5, level: 1.15 },
      keyDelete: { pitch: 1, length: 0.9, level: 0.85 },
    },
  },
} satisfies Record<string, KeyStyle>

export type KeyStyleName = keyof typeof KEY_STYLES
