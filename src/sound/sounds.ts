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
import { readPref, writePref } from '../platform/prefs'
import { LEVEL_WOBBLE, PITCH_WOBBLE, playVoices, wobble } from './keySynth'
import { KEY_STYLES, pressVoices, releaseVoices, type KeyStyleName } from './keyStyles'

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
  // The fuller sounds for Settings → Fun → Impact sounds. Heavier than the plain
  // ones on purpose: you should feel them.
  /** Done: a deep thump, then a bright rising knock on top. */
  impactDone: [
    [0.95, 0.03, 140, 0, 0.012, 0.2, 0, 1.2, -0.5, 0, 70, 0.05, 0, 0, 0, 0, 0, 1, 0.02, 0, -1000],
    [0.4, 0, 520, 0.004, 0.02, 0.24, 0, 1.2, 0, 0, 190, 0.075, 0, 0, 0, 0, 0, 1, 0.03, 0, -2600],
    [0.12, 0.1, 2400, 0, 0, 0.014, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3800],
  ],
  /** Doing: a springy push upward, like getting going. */
  impactDoing: [
    [0.8, 0.04, 120, 0, 0.012, 0.15, 0, 1.2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.01, 0, -1100],
    [0.1, 0.1, 2000, 0, 0, 0.012, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -3200],
  ],
  /** Waiting: a heavy, dull drop that sinks. */
  impactWaiting: [
    [1, 0.05, 90, 0, 0.02, 0.3, 0, 1.2, -2.2, 0, 0, 0, 0, 0.15, 0, 0, 0, 1, 0.04, 0, -700],
    [0.25, 0.05, 200, 0, 0.01, 0.12, 0, 1.2, -3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -900],
  ],
} satisfies Record<string, number[][]>

type TypingSound = 'key' | 'keyShift' | 'keySpace' | 'keyEnter' | 'keyDelete'
export type SoundName = keyof typeof SOUNDS | TypingSound
const TYPING: TypingSound[] = ['key', 'keyShift', 'keySpace', 'keyEnter', 'keyDelete']

// Typing sounds (the Fun section in Settings; off unless you turn it on).
// Several styles to choose from. Each has a character for every kind of key,
// so a sentence sounds like a sentence: a letter or number (key), a capital or
// symbol typed with Shift (keyShift), space (keySpace), return (keyEnter) and
// backspace (keyDelete, which always moves the other way).
//
// A press varies only a little: pitch ±2.5%, level ±10%. Real keys don't change
// pitch from letter to letter, and more than that sounds like a melody.
//
// "Soft" is the original sound, made of ZzFX recipes (see above). The other
// styles are built from parts in keyStyles.ts and played by keySynth.ts.
const SOFT: Record<TypingSound, number[][]> = {
  key: [
    [0.3, 0.03, 205, 0.001, 0.003, 0.032, 0, 1, -1.8, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -1100],
    [0.1, 0.03, 900, 0.001, 0, 0.016, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1500],
  ],
  keyShift: [
    [0.32, 0.03, 178, 0.001, 0.004, 0.038, 0, 1, -1.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -1000],
    [0.1, 0.03, 780, 0.001, 0, 0.018, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1300],
  ],
  // Deeper and wider, with a soft second knock as it settles.
  keySpace: [
    [0.38, 0.03, 132, 0.002, 0.006, 0.055, 0, 1, -1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -800],
    [0.12, 0.03, 620, 0.002, 0, 0.024, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1100],
    [0.12, 0.03, 110, 0.012, 0, 0.03, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -700],
  ],
  // The heaviest key, low and round.
  keyEnter: [
    [0.42, 0.03, 118, 0.002, 0.008, 0.065, 0, 1, -1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -750],
    [0.12, 0.03, 560, 0.002, 0, 0.026, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1000],
  ],
  // Hollow and rising, like taking a letter back out.
  keyDelete: [
    [0.26, 0.03, 165, 0.002, 0.004, 0.04, 0, 1, 1.4, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, -950],
    [0.07, 0.03, 1100, 0.001, 0, 0.012, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1700],
  ],
}

export type TypingStyle = 'default' | KeyStyleName

/** The styles in the order Settings lists them, with the words it shows. */
export const TYPING_STYLE_INFO: { id: TypingStyle; label: string }[] = [
  { id: 'default', label: 'Soft' },
  { id: 'creamy', label: 'Creamy' },
  { id: 'pop', label: 'Popping' },
  { id: 'mouth', label: 'Mouth pop' },
  { id: 'water', label: 'Water drops' },
  { id: 'clicky', label: 'Clicky' },
]

/** What each sound is for, in the words Settings shows (Sounds tab). */
export const SOUND_INFO: { name: Exclude<SoundName, TypingSound | 'impactDone' | 'impactDoing' | 'impactWaiting'>; label: string; when: string }[] = [
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

/** The fuller sounds in Settings → Fun, shown separately from the plain ones. */
export const IMPACT_SOUND_INFO: { name: 'impactDone' | 'impactDoing' | 'impactWaiting'; label: string; when: string }[] = [
  { name: 'impactDone', label: 'Done', when: 'A task becomes Done' },
  { name: 'impactDoing', label: 'Doing', when: 'A task moves to Doing' },
  { name: 'impactWaiting', label: 'Waiting', when: 'A task is put on hold' },
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
    // A typing sound comes from the chosen style (an unknown saved style falls back to Soft).
    if (TYPING.includes(name as TypingSound)) {
      typingSound(name as TypingSound, 'press')
      return
    }
    let layers = cache.get(name)
    if (!layers) {
      layers = SOUNDS[name as keyof typeof SOUNDS].map((recipe) => new ZZFXSound([...recipe]))
      cache.set(name, layers)
    }
    for (const layer of layers) layer.play(settings.volume, pitch)
  } catch {
    // No audio device, or audio blocked: stay silent.
  }
}

/** Plays a typing sound in the chosen style, varied a little (pitch ±2.5%, level ±10%). */
function typingSound(name: TypingSound, part: 'press' | 'release') {
  const id = settings.typingStyle in KEY_STYLES ? (settings.typingStyle as KeyStyleName) : null
  const pitch = 1 + wobble() * PITCH_WOBBLE
  const level = settings.volume * (1 + wobble() * LEVEL_WOBBLE)
  if (!id) {
    // Soft: ZzFX recipes, which add their own small pitch change on every play. No release sound.
    if (part === 'press') {
      const key = `soft:${name}`
      let layers = cache.get(key)
      if (!layers) {
        layers = SOFT[name].map((recipe) => new ZZFXSound([...recipe]))
        cache.set(key, layers)
      }
      for (const layer of layers) layer.play(level, 1)
    }
    return
  }
  const voices = part === 'press' ? pressVoices(KEY_STYLES[id], name) : releaseVoices(KEY_STYLES[id], name)
  if (voices.length === 0) return
  const ctx = ZZFX.audioContext
  playVoices(ctx, ctx.destination, voices, { pitch, gain: level * ZZFX.volume })
}

/** Plays the sound of a key coming back up, for the styles that have one (Creamy, Clicky). */
export function playRelease(name: SoundName, { force = false }: { force?: boolean } = {}) {
  if (!TYPING.includes(name as TypingSound)) return
  if (!force && !settings.on) return
  if (settings.volume <= 0) return
  try {
    if (ZZFX.audioContext.state === 'suspended') void ZZFX.audioContext.resume()
    typingSound(name as TypingSound, 'release')
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
  // Keys whose press made a sound, so their release can too (by physical key, since Shift may change `key`).
  const down = new Map<string, TypingSound>()
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
    if (sound) {
      play(sound)
      down.set(e.code, sound)
    }
  }
  const onKeyUp = (e: KeyboardEvent) => {
    const sound = down.get(e.code)
    if (!sound) return
    down.delete(e.code)
    if (settings.typing) playRelease(sound)
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKeyUp, true)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('keyup', onKeyUp, true)
  }
}
