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
  // Typing (the Fun section in Settings; off unless you turn it on). A short
  // mechanical click plus a small low thock, like a soft keyboard.
  /** A letter key. */
  key: [
    [0.22, 0.12, 1900, 0, 0, 0.01, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -4200],
    [0.22, 0.1, 230, 0, 0.001, 0.022, 0, 1.2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1600],
  ],
  /** Space: a deeper, wider key. */
  keySpace: [
    [0.14, 0.1, 1400, 0, 0, 0.012, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3200],
    [0.3, 0.08, 150, 0, 0.002, 0.04, 0, 1.2, -1.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1200],
  ],
  /** Return: the deepest. */
  keyEnter: [
    [0.16, 0.1, 1500, 0, 0, 0.014, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3400],
    [0.34, 0.06, 135, 0, 0.003, 0.05, 0, 1.2, -1.5, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1100],
  ],
  /** Backspace: a little higher and drier. */
  keyDelete: [
    [0.18, 0.12, 2300, 0, 0, 0.009, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -4600],
    [0.16, 0.1, 290, 0, 0.001, 0.018, 0, 1.2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1800],
  ],
} satisfies Record<string, number[][]>

export type SoundName = keyof typeof SOUNDS
type TypingSound = 'key' | 'keySpace' | 'keyEnter' | 'keyDelete'
const TYPING: TypingSound[] = ['key', 'keySpace', 'keyEnter', 'keyDelete']

/** What each sound is for, in the words Settings shows (Sounds tab). */
export const SOUND_INFO: { name: Exclude<SoundName, TypingSound>; label: string; when: string }[] = [
  { name: 'pickUp', label: 'Pick up', when: 'Starting to drag something' },
  { name: 'slot', label: 'Slot', when: 'A dragged item reaching a new spot' },
  { name: 'drop', label: 'Drop', when: 'Letting go, or filing from Unsorted' },
  { name: 'complete', label: 'Complete', when: 'A task or milestone becomes Done' },
  { name: 'status', label: 'Status', when: 'Other status changes, formatting, blocks' },
  { name: 'select', label: 'Select', when: 'Choosing Task, Note or Project; page icons' },
  { name: 'capture', label: 'Capture', when: 'Quick capture saving to Unsorted' },
  { name: 'check', label: 'Checkbox', when: 'Ticking a checkbox in a page' },
  { name: 'delete', label: 'Delete', when: 'Deleting something' },
  { name: 'undo', label: 'Undo', when: 'Undoing it' },
  { name: 'open', label: 'Search', when: 'Opening search with ⌘K' },
]

export interface SoundSettings {
  on: boolean
  /** 0 to 1. */
  volume: number
  /** Sounds switched off one by one in Settings. */
  muted: SoundName[]
  /** Keyboard sounds while typing. Off unless turned on (Settings → Sounds → Fun). */
  typing: boolean
}

const DEFAULTS: SoundSettings = { on: true, volume: 0.6, muted: [], typing: false }
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
              ? 'key'
              : null
    if (sound) play(sound)
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
