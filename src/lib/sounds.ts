// Moss's sounds: short, low, muted knocks and taps for things you do.
// The goal is weight and impact, not tunes: each sound is a soft low "body"
// (a thump whose pitch drops fast, like a felt mallet) plus, for most, a tiny
// click on top so it reads on laptop speakers. Never on hover, clicks,
// navigation or typing; only when something changes.
//
// Each layer is a ZzFX recipe: a list of numbers describing a tiny synth sound
// (volume, randomness, frequency, attack, sustain, release, shape, ...). The
// last number is the filter; negative = low-pass, which keeps them muted.
// Tune them on the sound test page (link in CLAUDE.md) and paste the arrays.
//
// Variation: the second number ("randomness") nudges the pitch a little on
// every play (0.05 = up to ±5%), so repeating an action never sounds
// copy-pasted. Sounds are rendered once on first use, then just played.

import { ZZFX, ZZFXSound } from 'zzfx'
import { readPref, writePref } from './prefs'

export const SOUNDS = {
  /** Picking something up to drag it: a light tap. */
  pickUp: [
    [0.4, 0.05, 190, 0, 0.002, 0.04, 0, 1.2, -1.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1200],
    [0.06, 0.1, 2200, 0, 0, 0.01, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3500],
  ],
  /** Letting go of a dragged item, or filing from Unsorted: a soft, low thump. */
  drop: [
    [0.65, 0.05, 128, 0, 0.004, 0.08, 0, 1.2, -1.2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -900],
    [0.1, 0.1, 1800, 0, 0, 0.012, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3000],
  ],
  /** While dragging, each time the item moves to a new spot: a barely-there tick. Pitch follows direction. */
  slot: [[0.12, 0.08, 320, 0, 0, 0.02, 0, 1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1800]],
  /** A task or milestone becomes Done: a two-step low knock, like a solid switch. */
  complete: [
    [0.65, 0.04, 160, 0, 0.004, 0.1, 0, 1.2, -0.6, 0, 45, 0.035, 0, 0, 0, 0, 0, 1, 0, 0, -1300],
    [0.09, 0.1, 2400, 0, 0, 0.012, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3800],
  ],
  /** Any other status change: a light tap. */
  status: [
    [0.38, 0.05, 175, 0, 0.002, 0.04, 0, 1.2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1300],
    [0.05, 0.1, 2200, 0, 0, 0.01, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3500],
  ],
  /** Quick capture saved to Unsorted: a soft papery puff. */
  capture: [
    [0.35, 0.05, 230, 0.002, 0.004, 0.05, 0, 1.2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1500],
    [0.08, 0.15, 1500, 0.003, 0, 0.025, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -2600],
  ],
  /** Deleting something: a short thump that sinks. */
  delete: [[0.55, 0.04, 155, 0, 0.006, 0.09, 0, 1.2, -2.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -900]],
  /** Undo: the same thump, rising. */
  undo: [[0.55, 0.04, 130, 0, 0.006, 0.09, 0, 1.2, 2.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -900]],
  /** Ticking a checkbox in a page: a small crisp tap. */
  check: [
    [0.3, 0.06, 210, 0, 0.002, 0.035, 0, 1.2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1400],
    [0.05, 0.1, 2600, 0, 0, 0.008, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3800],
  ],
  /** Opening search (⌘K): a quiet lift. */
  open: [[0.16, 0.05, 260, 0.004, 0.004, 0.05, 0, 1.2, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1600]],
} satisfies Record<string, number[][]>

export type SoundName = keyof typeof SOUNDS

export interface SoundSettings {
  on: boolean
  /** 0 to 1. */
  volume: number
}

const DEFAULTS: SoundSettings = { on: true, volume: 0.6 }
let settings: SoundSettings = { ...DEFAULTS, ...readPref<Partial<SoundSettings>>('sound', {}) }
const cache = new Map<SoundName, ZZFXSound[]>()
const lastPlayed = new Map<SoundName, number>()

// ZzFX's own master volume. Our volume setting scales on top of it.
ZZFX.volume = 0.5

export function soundSettings(): SoundSettings {
  return settings
}

export function setSoundSettings(next: SoundSettings) {
  settings = next
  writePref('sound', next)
}

/**
 * Plays a sound if sounds are on. Safe to call anywhere; never throws.
 * - `pitch`: 1 = as designed; 1.1 = a little higher (used for direction).
 * - The same sound can't stack within 35ms, so fast repeats stay clean.
 */
export function play(name: SoundName, { pitch = 1, force = false }: { pitch?: number; force?: boolean } = {}) {
  if ((!settings.on && !force) || settings.volume <= 0) return
  const now = performance.now()
  if (now - (lastPlayed.get(name) ?? -Infinity) < 35) return
  lastPlayed.set(name, now)
  try {
    // The web view keeps audio paused until the first click; this wakes it.
    if (ZZFX.audioContext.state === 'suspended') void ZZFX.audioContext.resume()
    let layers = cache.get(name)
    if (!layers) {
      layers = SOUNDS[name].map((recipe) => new ZZFXSound([...recipe]))
      cache.set(name, layers)
    }
    for (const layer of layers) layer.play(settings.volume, pitch)
  } catch {
    // No audio device, or audio blocked: stay silent.
  }
}
