// A tiny synth for the typing sounds that are built from parts, the way a real
// key sound is: a few short layers played together (a thock, a tick, a chirp),
// each with its own pitch, glide, decay and filter. Only pure tones: noise
// turns into hiss and crackle on in-ear monitors.
//
// ZzFX can't start a layer a few milliseconds late or glide on an exponential
// curve, so these go through Web Audio directly. Each press builds its layers,
// plays them and lets them go; nothing is kept between presses except the
// `choke` of the last press, which the next press uses to cut it short.

/** One layer of a key sound. */
export interface Voice {
  /** A pitched tone, or white noise (shaped by `filter`). */
  wave: 'sine' | 'triangle'
  /** Tone pitch in Hz. */
  hz: number
  /** Tone pitch it glides to, over `glideMs`, on an exponential curve (how pitch really falls). */
  to?: number
  glideMs?: number
  /** Fade-in. A soft attack (2-3 ms) is what reads as creamy; a click has almost none. */
  attackMs?: number
  /** How long the layer takes to die away (to -60 dB). */
  decayMs: number
  /** Level of this layer. The layers add up, so keep the loudest well under 1. */
  gain: number
  /** Milliseconds after the press. A range picks a new random time every press (a natural gap). */
  at?: number | [number, number]
  /** Layers with the same link share one random time, so a thock and its noise stay together. */
  link?: string
  filter?: { type: 'bandpass' | 'lowpass' | 'highpass'; hz: number; q?: number }
}

/** How far a press may wobble: pitch ±2.5%, level ±10%. More than that sounds like a melody. */
export const PITCH_WOBBLE = 0.025
export const LEVEL_WOBBLE = 0.1

/** A random number from -1 to 1. */
export const wobble = () => Math.random() * 2 - 1

/**
 * Plays the layers together, starting at `start` (seconds on the context's clock).
 * - `pitch`: 1 = as designed. Moves every tone by the same amount.
 * - `gain`: overall level, on top of each layer's own.
 */
export function playVoices(
  ctx: BaseAudioContext,
  out: AudioNode,
  voices: Voice[],
  { pitch = 1, gain = 1, start = ctx.currentTime }: { pitch?: number; gain?: number; start?: number } = {},
) {
  const links = new Map<string, number>()
  // Every layer of one press goes through this, so the whole press can be faded at once.
  const bus = ctx.createGain()
  bus.connect(out)
  let lastEnd = start
  for (const voice of voices) {
    // When this layer starts, after the press.
    let at = 0
    if (Array.isArray(voice.at)) {
      const [min, max] = voice.at
      const shared = voice.link ? links.get(voice.link) : undefined
      at = shared ?? min + Math.random() * (max - min)
      if (voice.link) links.set(voice.link, at)
    } else if (voice.at) {
      at = voice.at
    }
    const t0 = start + at / 1000
    // At least 1 ms: a faster start is a click.
    const attack = Math.max(voice.attackMs ?? 1.5, 1) / 1000
    const decay = voice.decayMs / 1000
    const end = t0 + attack + decay

    // The level: up over the attack, then down to -60 dB over the decay.
    const level = ctx.createGain()
    const peak = voice.gain * gain
    level.gain.setValueAtTime(0, t0)
    level.gain.linearRampToValueAtTime(peak, t0 + attack)
    level.gain.exponentialRampToValueAtTime(Math.max(peak * 0.001, 1e-6), end)

    // The sound itself.
    const source = ctx.createOscillator()
    source.type = voice.wave
    source.frequency.setValueAtTime(voice.hz * pitch, t0)
    if (voice.to !== undefined) {
      source.frequency.exponentialRampToValueAtTime(voice.to * pitch, t0 + (voice.glideMs ?? voice.decayMs) / 1000)
    }
    source.start(t0)
    source.stop(end + 0.02)

    if (voice.filter) {
      const filter = ctx.createBiquadFilter()
      filter.type = voice.filter.type
      filter.frequency.value = voice.filter.hz
      filter.Q.value = voice.filter.q ?? 1
      source.connect(filter).connect(level)
    } else {
      source.connect(level)
    }
    level.connect(bus)
    lastEnd = Math.max(lastEnd, end)
    // Let the nodes go once the layer has finished.
    source.onended = () => level.disconnect()
  }
  // The bus goes once the last layer is done.
  window.setTimeout(() => bus.disconnect(), (lastEnd - ctx.currentTime) * 1000 + 100)
  return {
    /** Cuts this press short (a few milliseconds of fade), so presses in quick succession don't pile up. */
    choke(ms = 12) {
      bus.gain.cancelScheduledValues(ctx.currentTime)
      bus.gain.setTargetAtTime(0, ctx.currentTime, ms / 3000)
    },
  }
}
