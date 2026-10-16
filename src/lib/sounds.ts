// Moss's sounds: a few quiet, short, low-passed tones for things you do.
// Never on hover, clicks, navigation or typing. Only when something changes.
//
// Each sound is a ZzFX recipe: a list of numbers that describes a tiny synth
// sound (volume, randomness, frequency, attack, sustain, release, shape, ...).
// Design or tweak one at https://killedbyapixel.github.io/ZzFX/ and paste the
// array here. The last number is the filter: negative = low-pass, which is
// what keeps these muted.
//
// Sounds are rendered once on first use, then just played (no files, no delay).

import { ZZFX, ZZFXSound } from 'zzfx'
import { readPref, writePref } from './prefs'

export const SOUNDS = {
  /** Picking something up to drag it: a tiny soft tap. */
  pickUp: [0.35, 0.03, 620, 0, 0, 0.045, 0, 1.4, -8, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -2400],
  /** Letting go of a dragged item, or filing from Unsorted: a low, muffled thud. */
  drop: [0.55, 0.03, 210, 0, 0.005, 0.09, 0, 1.6, -3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1400],
  /** A task (or milestone) becomes Done: two soft rising notes. */
  complete: [0.45, 0, 587, 0, 0.02, 0.16, 0, 1.8, 0, 0, 293, 0.065, 0, 0, 0, 0, 0, 1, 0, 0, -3200],
  /** Any other status change (Todo ↔ Doing, project status): a light tick. */
  status: [0.3, 0.03, 480, 0, 0, 0.035, 0, 1.4, -4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -2600],
  /** Quick capture saved something to Unsorted: a soft rising blip. */
  capture: [0.3, 0.03, 620, 0.003, 0.01, 0.06, 0, 1.4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -2200],
  /** Deleting something: a short tone sliding down. */
  delete: [0.35, 0, 300, 0, 0.02, 0.12, 0, 1.6, -4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1400],
  /** Undo: the same tone sliding up. */
  undo: [0.35, 0, 230, 0, 0.02, 0.12, 0, 1.6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1400],
} satisfies Record<string, number[]>

export type SoundName = keyof typeof SOUNDS

export interface SoundSettings {
  on: boolean
  /** 0 to 1. */
  volume: number
}

const DEFAULTS: SoundSettings = { on: true, volume: 0.6 }
let settings: SoundSettings = { ...DEFAULTS, ...readPref<Partial<SoundSettings>>('sound', {}) }
const cache = new Map<SoundName, ZZFXSound>()

// ZzFX's own master volume. Our volume setting scales on top of it.
ZZFX.volume = 0.5

export function soundSettings(): SoundSettings {
  return settings
}

export function setSoundSettings(next: SoundSettings) {
  settings = next
  writePref('sound', next)
}

/** Plays a sound if sounds are on. Safe to call anywhere; never throws. */
export function play(name: SoundName, { force = false }: { force?: boolean } = {}) {
  if ((!settings.on && !force) || settings.volume <= 0) return
  try {
    // The browser keeps audio paused until the first click; this wakes it.
    if (ZZFX.audioContext.state === 'suspended') void ZZFX.audioContext.resume()
    let sound = cache.get(name)
    if (!sound) {
      sound = new ZZFXSound([...SOUNDS[name]])
      cache.set(name, sound)
    }
    sound.play(settings.volume)
  } catch {
    // No audio device, or audio blocked: stay silent.
  }
}
