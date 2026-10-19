// Moss's sounds: short, low, muted knocks and taps for things you do.
// The goal is weight and impact, not tunes: each sound is a soft low "body"
// (a thump whose pitch drops fast, like a felt mallet) plus, for most, a tiny
// click on top so it reads on laptop speakers. Never on hover, clicks,
// navigation or typing (except the optional typing sounds); only when
// something changes.
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
  /** Choosing an option, like "Create as" in Unsorted: a soft tap. Pitch rises from the first option to the last. */
  select: [
    [0.3, 0.04, 200, 0, 0.002, 0.035, 0, 1.2, -0.8, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1500],
    [0.04, 0.1, 2400, 0, 0, 0.008, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3600],
  ],
  /** Opening search (⌘K): a quiet lift. */
  open: [[0.16, 0.05, 260, 0.004, 0.004, 0.05, 0, 1.2, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1600]],
} satisfies Record<string, number[][]>

type TypingSound = 'key' | 'keyShift' | 'keySpace' | 'keyEnter' | 'keyDelete'
export type SoundName = keyof typeof SOUNDS | TypingSound
const TYPING: TypingSound[] = ['key', 'keyShift', 'keySpace', 'keyEnter', 'keyDelete']

// Typing sounds (the Fun section in Settings; off unless you turn it on).
// Several styles to choose from, each with a sound for every kind of key, so
// a sentence sounds like a sentence: a letter or number (key), a capital or
// symbol typed with Shift (keyShift), space (keySpace), return (keyEnter)
// and backspace (keyDelete, which always moves the other way).
export const TYPING_STYLES = {
  // Creamy, not clicky: like a lubed keyboard with foam inside. Each key is a
  // round low "thock" (a sine whose pitch drops) plus a soft, muffled puff of
  // noise with a tiny attack, so there's no sharp tick on top.
  default: {
    key: [
      [0.3, 0.1, 205, 0.001, 0.003, 0.032, 0, 1, -1.8, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -1100],
      [0.1, 0.15, 900, 0.001, 0, 0.016, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1500],
    ],
    keyShift: [
      [0.32, 0.1, 178, 0.001, 0.004, 0.038, 0, 1, -1.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -1000],
      [0.1, 0.15, 780, 0.001, 0, 0.018, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1300],
    ],
    // Deeper and wider, with a soft second knock as it settles.
    keySpace: [
      [0.38, 0.06, 132, 0.002, 0.006, 0.055, 0, 1, -1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -800],
      [0.12, 0.12, 620, 0.002, 0, 0.024, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1100],
      [0.12, 0.08, 110, 0.012, 0, 0.03, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -700],
    ],
    // The heaviest key, low and round.
    keyEnter: [
      [0.42, 0.05, 118, 0.002, 0.008, 0.065, 0, 1, -1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -750],
      [0.12, 0.12, 560, 0.002, 0, 0.026, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1000],
    ],
    // Hollow and rising, like taking a letter back out.
    keyDelete: [
      [0.26, 0.08, 165, 0.002, 0.004, 0.04, 0, 1, 1.4, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -950],
      [0.07, 0.15, 1100, 0.001, 0, 0.012, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1700],
    ],
  },
  // A super-lubed linear switch: deeper and rounder than the default, slower
  // to land, with only a faint muffled puff on top.
  creamy: {
    key: [
      [0.34, 0.08, 140, 0.003, 0.006, 0.055, 0, 1, -1.1, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -700],
      [0.06, 0.1, 480, 0.003, 0, 0.022, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -900],
    ],
    keyShift: [
      [0.36, 0.08, 120, 0.003, 0.006, 0.06, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -650],
      [0.06, 0.1, 420, 0.003, 0, 0.024, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -850],
    ],
    keySpace: [
      [0.4, 0.06, 98, 0.004, 0.008, 0.075, 0, 1, -0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -600],
      [0.08, 0.1, 360, 0.004, 0, 0.03, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -800],
      [0.12, 0.06, 84, 0.016, 0, 0.04, 0, 1, -0.8, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -550],
    ],
    keyEnter: [
      [0.44, 0.05, 88, 0.004, 0.01, 0.08, 0, 1, -0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -550],
      [0.08, 0.1, 340, 0.004, 0, 0.03, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -750],
    ],
    keyDelete: [
      [0.28, 0.08, 130, 0.003, 0.005, 0.05, 0, 1, 1.1, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -700],
      [0.05, 0.12, 620, 0.002, 0, 0.014, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1100],
    ],
  },
  // Each key is a drop landing in water: a round sine whose pitch rises fast
  // (a "bloop"), with a small overtone. More random pitch, so no two match.
  water: {
    key: [
      [0.28, 0.25, 430, 0.001, 0.004, 0.07, 0, 1, 3.2, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -2500],
      [0.07, 0.25, 860, 0.001, 0.002, 0.04, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -3500],
    ],
    keyShift: [
      [0.3, 0.25, 330, 0.001, 0.005, 0.08, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -2300],
      [0.07, 0.25, 660, 0.001, 0.002, 0.045, 0, 1, 2.8, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -3200],
    ],
    // A bigger drop, then a small one rippling after it.
    keySpace: [
      [0.34, 0.15, 250, 0.001, 0.006, 0.11, 0, 1, 2.4, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -2000],
      [0.14, 0.2, 520, 0.04, 0, 0.05, 0, 1, 2.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -2800],
    ],
    keyEnter: [
      [0.38, 0.1, 200, 0.001, 0.008, 0.13, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -1800],
      [0.16, 0.15, 400, 0.05, 0, 0.06, 0, 1, 2.2, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -2500],
    ],
    // The drop running back out: the same bloop, falling.
    keyDelete: [
      [0.24, 0.2, 560, 0.001, 0.003, 0.05, 0, 1, -3.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, -2800],
    ],
  },
  // Bubble-wrap pops: a short round burst whose pitch falls fast, with a
  // tiny snap of noise on top. A little random pitch on each.
  pop: {
    key: [
      [0.38, 0.18, 720, 0, 0.001, 0.028, 0, 1, -6, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3200],
      [0.09, 0.2, 2600, 0, 0, 0.01, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -4500],
    ],
    keyShift: [
      [0.38, 0.18, 880, 0, 0.001, 0.03, 0, 1, -6, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3400],
      [0.09, 0.2, 3000, 0, 0, 0.01, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -4800],
    ],
    keySpace: [
      [0.4, 0.12, 420, 0, 0.002, 0.045, 0, 1, -5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -2600],
      [0.18, 0.1, 160, 0.004, 0, 0.04, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -900],
    ],
    keyEnter: [
      [0.42, 0.1, 300, 0, 0.002, 0.06, 0, 1, -4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -2200],
      [0.3, 0.15, 600, 0.03, 0.001, 0.03, 0, 1, -5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3000],
    ],
    // A pop played backwards: pitch rising.
    keyDelete: [
      [0.3, 0.18, 500, 0, 0.001, 0.03, 0, 1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3000],
    ],
  },
} satisfies Record<string, Record<TypingSound, number[][]>>

export type TypingStyle = keyof typeof TYPING_STYLES

/** The styles in the order Settings lists them, with the words it shows. */
export const TYPING_STYLE_INFO: { id: TypingStyle; label: string }[] = [
  { id: 'default', label: 'Soft' },
  { id: 'creamy', label: 'Creamy' },
  { id: 'water', label: 'Water drops' },
  { id: 'pop', label: 'Popping' },
]

/** What each sound is for, in the words Settings shows (Sounds tab). */
export const SOUND_INFO: { name: Exclude<SoundName, TypingSound>; label: string; when: string }[] = [
  { name: 'pickUp', label: 'Pick up', when: 'Starting to drag something' },
  { name: 'slot', label: 'Slot', when: 'A dragged item reaching a new spot' },
  { name: 'drop', label: 'Drop', when: 'Letting go, or filing from Unsorted' },
  { name: 'complete', label: 'Complete', when: 'A task or milestone becomes Done' },
  { name: 'status', label: 'Status', when: 'Other status changes, formatting, blocks' },
  { name: 'select', label: 'Select', when: 'Choosing Task, Page or Project; page icons' },
  { name: 'capture', label: 'Capture', when: 'Quick capture saving to Unsorted' },
  { name: 'check', label: 'Checkbox', when: 'Ticking a checkbox in a page' },
  { name: 'delete', label: 'Delete', when: 'Deleting something' },
  { name: 'undo', label: 'Undo', when: 'Undoing it' },
  { name: 'open', label: 'Search', when: 'Opening search (⌘K, or Ctrl+K)' },
]

export interface SoundSettings {
  on: boolean
  /** 0 to 1. */
  volume: number
  /** Sounds switched off one by one in Settings. */
  muted: SoundName[]
  /** Keyboard sounds while typing. Off unless turned on (Settings → Sounds → Fun). */
  typing: boolean
  /** Which keyboard sound, when typing sounds are on. */
  typingStyle: TypingStyle
}

const DEFAULTS: SoundSettings = { on: true, volume: 0.6, muted: [], typing: false, typingStyle: 'default' }
let settings: SoundSettings = { ...DEFAULTS, ...readPref<Partial<SoundSettings>>('sound', {}) }
const cache = new Map<string, ZZFXSound[]>()
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
 * Plays a sound if sounds are on (and this one isn't muted). Safe to call
 * anywhere; never throws.
 * - `pitch`: 1 = as designed; 1.1 = a little higher (used for direction).
 * - The same sound can't stack within 35ms, so fast repeats stay clean
 *   (typing sounds excepted: fast typing should sound like fast typing).
 * - `force`: play even if muted (the test buttons in Settings).
 */
export function play(name: SoundName, { pitch = 1, force = false }: { pitch?: number; force?: boolean } = {}) {
  if (!force && (!settings.on || settings.muted.includes(name))) return
  if (settings.volume <= 0) return
  const now = performance.now()
  if (!TYPING.includes(name as TypingSound) && now - (lastPlayed.get(name) ?? -Infinity) < 35) return
  lastPlayed.set(name, now)
  try {
    // The web view keeps audio paused until the first click; this wakes it.
    if (ZZFX.audioContext.state === 'suspended') void ZZFX.audioContext.resume()
    // A typing sound comes from the chosen style (an unknown saved style falls back to the default).
    const typing = TYPING.includes(name as TypingSound)
    const style = settings.typingStyle in TYPING_STYLES ? settings.typingStyle : 'default'
    const cacheKey = typing ? `${style}:${name}` : name
    let layers = cache.get(cacheKey)
    if (!layers) {
      const recipes = typing ? TYPING_STYLES[style][name as TypingSound] : SOUNDS[name as keyof typeof SOUNDS]
      layers = recipes.map((recipe) => new ZZFXSound([...recipe]))
      cache.set(cacheKey, layers)
    }
    for (const layer of layers) layer.play(settings.volume, pitch)
  } catch {
    // No audio device, or audio blocked: stay silent.
  }
}

/** True for things you type into: text fields and the page editor. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && ['text', 'search', 'url', 'email', ''].includes(target.type)
}

/**
 * Keyboard sounds (the Fun option). Call once at startup; it listens to key
 * presses in any text field and plays a key sound when typing sounds are on.
 * Shortcuts (⌘, Ctrl, Alt) and keys that don't type (arrows, Shift) are quiet.
 */
export function listenForTyping() {
  const onKey = (e: KeyboardEvent) => {
    if (!settings.typing || e.metaKey || e.ctrlKey || e.altKey || (e.repeat && e.key !== 'Backspace')) return
    if (!isTypingTarget(e.target)) return
    const sound: TypingSound | null =
      e.key === ' '
        ? 'keySpace'
        : e.key === 'Enter'
          ? 'keyEnter'
          : e.key === 'Backspace' || e.key === 'Delete'
            ? 'keyDelete'
            : e.key.length === 1
              ? // Shift held, or a character that needs it (capitals, !, ?).
                e.shiftKey
                ? 'keyShift'
                : 'key'
              : null
    if (sound) play(sound)
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
