// A tiny synth for the typing sounds that are built from parts, the way a real
// key sound is: a few short layers played together (a thock, a click, a puff of
// noise), each with its own pitch, glide, decay and filter.
//
// ZzFX can't do this: it has no band-pass filter and can't start a layer a few
// milliseconds late, so these go through Web Audio directly. Each press builds
// its layers, plays them and lets them go; nothing is kept between presses.

/** One layer of a key sound. */
export interface Voice {
  /** A pitched tone, or white noise (shaped by `filter`). */
  wave: 'sine' | 'triangle' | 'noise'
  /** Tone pitch in Hz. Unused by noise, which is shaped by `filter`. */
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

// One second of white noise per audio context, reused by every noise layer.
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
function noiseBuffer(ctx: BaseAudioContext) {
  let buffer = noiseBuffers.get(ctx)
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseBuffers.set(ctx, buffer)
  }
  return buffer
}

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
    const attack = (voice.attackMs ?? 0.5) / 1000
    const decay = voice.decayMs / 1000
    const end = t0 + attack + decay

    // The level: up over the attack, then down to -60 dB over the decay.
    const level = ctx.createGain()
    const peak = voice.gain * gain
    level.gain.setValueAtTime(0, t0)
    level.gain.linearRampToValueAtTime(peak, t0 + attack)
    level.gain.exponentialRampToValueAtTime(Math.max(peak * 0.001, 1e-6), end)

    // The sound itself.
    let source: AudioScheduledSourceNode
    if (voice.wave === 'noise') {
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer(ctx)
      noise.loop = true
      source = noise
      // Start at a random point in the noise, so no two presses share a texture.
      noise.start(t0, Math.random() * 0.9)
    } else {
      const tone = ctx.createOscillator()
      tone.type = voice.wave
      tone.frequency.setValueAtTime(voice.hz * pitch, t0)
      if (voice.to !== undefined) {
        tone.frequency.exponentialRampToValueAtTime(voice.to * pitch, t0 + (voice.glideMs ?? voice.decayMs) / 1000)
      }
      source = tone
      tone.start(t0)
    }
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
    level.connect(out)
    // Let the nodes go once the layer has finished.
    source.onended = () => level.disconnect()
  }
}
