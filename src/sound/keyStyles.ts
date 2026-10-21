// The typing styles built from parts (see keySynth.ts). Each style is a few
// short layers of pure tones; there is no noise in any of them, because noise
// is what turns into hiss and crackle on in-ear monitors. Nothing plays when a
// key comes back up either: a second sound per key doubles the busyness.
//
// - Creamy: a lubed switch. Bottom-out is a soft low thock (sine, falling 30%,
//   3 ms attack) with a quiet case ring.
// - Water drops: a bubble in water, with a little pop at the start. The pitch
//   chirps up and dies away within about 70 ms, and a smaller second bubble
//   follows at a random moment. Short on purpose, so quick typing doesn't pile up.
// - Pop: a Helmholtz resonator, like a pop made with the mouth: a damped sine,
//   falling 13%, rounded and low.
// - Clicky: a tactile switch without the sharpness: a soft tick (a short sine,
//   low-passed) and a hard little thock right behind it.
//
// The voices are fixed: a letter, a capital or symbol, space, return and
// backspace each have one character, and every press varies only by ±2.5%
// pitch and ±10% level (see keySynth.ts). Never per letter: that sounds like a melody.

import type { Voice } from './keySynth'

export type KeyKind = 'key' | 'keyShift' | 'keySpace' | 'keyEnter' | 'keyDelete'

/** How a kind of key differs from a letter: pitch, how long it rings, how loud. */
export interface Feel {
  pitch: number
  length: number
  level: number
}

interface KeyStyle {
  /** The letter key. Backspace plays only this. */
  body: Voice[]
  /** Added on every key but Backspace: the details that make a press feel real. */
  extras?: Voice[]
  /** How each kind of key differs from a letter. */
  feel: Record<KeyKind, Feel>
}

/** Backspace or Enter with a modifier (delete a word, send): lower, longer and a lot louder. */
export const BIG: Feel = { pitch: 0.8, length: 1.5, level: 1.6 }

/** The same voices, moved: tones by `pitch`, every layer's decay by `length`, level by `level`. */
function tune(voices: Voice[], { pitch, length, level }: Feel): Voice[] {
  return voices.map((v) => ({
    ...v,
    hz: v.hz * pitch,
    to: v.to === undefined ? undefined : v.to * pitch,
    decayMs: v.decayMs * length,
    gain: v.gain * level,
  }))
}

/** A voice whose glide runs the other way: a falling sound becomes a rising one. */
function reversed(voice: Voice): Voice {
  return voice.to === undefined ? voice : { ...voice, hz: voice.to, to: voice.hz }
}

/** The layers for pressing a kind of key. `big` makes it heavier (see `BIG`). */
export function pressVoices(style: KeyStyle, kind: KeyKind, big = false): Voice[] {
  const feel = style.feel[kind]
  const boost = (voices: Voice[]) => (big ? tune(voices, BIG) : voices)
  if (kind === 'keyDelete') {
    // Backspace takes the sound back out: the body, gliding the other way.
    const body = tune(style.body, feel)
    const first = body.findIndex((v) => v.to !== undefined)
    return boost(first < 0 ? body : body.map((v, i) => (i === first ? reversed(v) : v)))
  }
  return boost(tune([...style.body, ...(style.extras ?? [])], feel))
}

const FEEL_SOFT: Record<KeyKind, Feel> = {
  key: { pitch: 1, length: 1, level: 1 },
  keyShift: { pitch: 0.88, length: 1.1, level: 1.05 },
  keySpace: { pitch: 0.7, length: 1.3, level: 1.1 },
  keyEnter: { pitch: 0.6, length: 1.4, level: 1.15 },
  keyDelete: { pitch: 0.92, length: 0.9, level: 0.9 },
}

export const KEY_STYLES = {
  creamy: {
    body: [
      // Bottom-out: the thock. The 3 ms attack is what makes it soft.
      { wave: 'sine', hz: 220, to: 154, glideMs: 20, attackMs: 3, decayMs: 55, gain: 0.4 },
      // The case ringing, quietly.
      { wave: 'sine', hz: 700, attackMs: 1.5, decayMs: 22, gain: 0.04 },
    ],
    feel: {
      key: { pitch: 1, length: 1, level: 1 },
      keyShift: { pitch: 0.88, length: 1.1, level: 1.05 },
      keySpace: { pitch: 0.68, length: 1.3, level: 1.1 },
      keyEnter: { pitch: 0.6, length: 1.4, level: 1.15 },
      keyDelete: { pitch: 0.95, length: 0.9, level: 0.85 },
    },
  },

  water: {
    body: [
      // The first touch: a very short, low plip, so the sound starts with a point.
      { wave: 'sine', hz: 900, to: 720, glideMs: 12, attackMs: 1.5, decayMs: 14, gain: 0.16 },
      // The bubble: a chirp up that rings out and is gone in about 70 ms.
      { wave: 'sine', hz: 720, to: 1000, glideMs: 22, attackMs: 2, decayMs: 62, gain: 0.3, at: 3 },
    ],
    // A smaller second bubble, lower, at a random moment.
    extras: [{ wave: 'sine', hz: 560, to: 740, glideMs: 18, attackMs: 2, decayMs: 40, gain: 0.1, at: [22, 55] }],
    feel: {
      key: { pitch: 1, length: 1, level: 1 },
      keyShift: { pitch: 0.82, length: 1.1, level: 1.05 },
      keySpace: { pitch: 0.6, length: 1.25, level: 1.1 },
      keyEnter: { pitch: 0.5, length: 1.4, level: 1.15 },
      keyDelete: { pitch: 1, length: 0.7, level: 0.85 },
    },
  },

  pop: {
    body: [
      // The mouth ringing as the pressure evens out, falling 13%.
      { wave: 'sine', hz: 520, to: 452, glideMs: 30, attackMs: 1.5, decayMs: 45, gain: 0.4 },
      // A touch of the octave above, so it reads as a pop and not a hum.
      { wave: 'sine', hz: 1040, to: 904, glideMs: 20, attackMs: 1.5, decayMs: 14, gain: 0.06 },
    ],
    feel: FEEL_SOFT,
  },

  clicky: {
    body: [
      // The click: a short sine tick, low-passed so it is crisp without being sharp.
      { wave: 'sine', hz: 1500, attackMs: 1.2, decayMs: 7, gain: 0.28, filter: { type: 'lowpass', hz: 2600, q: 0.5 } },
      // Bottom-out just after: a short, hard thock. The gap varies a little every press.
      { wave: 'triangle', hz: 240, to: 188, glideMs: 12, attackMs: 1.5, decayMs: 30, gain: 0.36, at: [7, 13] },
    ],
    feel: FEEL_SOFT,
  },
} satisfies Record<string, KeyStyle>

export type KeyStyleName = keyof typeof KEY_STYLES
