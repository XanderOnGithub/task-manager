import { describe, expect, it } from 'vitest'
import { KEY_STYLES, pressVoices, type KeyKind } from './keyStyles'

const KINDS: KeyKind[] = ['key', 'keyShift', 'keySpace', 'keyEnter', 'keyDelete']
const peak = (voices: { gain: number }[]) => Math.max(...voices.map((v) => v.gain))

describe('typing styles', () => {
  for (const [name, style] of Object.entries(KEY_STYLES)) {
    it(`${name}: pure tones only, no noise and no sound on key-up`, () => {
      expect('release' in style).toBe(false)
      for (const kind of KINDS) {
        const voices = pressVoices(style, kind)
        expect(voices.length).toBeGreaterThan(0)
        for (const v of voices) {
          expect(['sine', 'triangle']).toContain(v.wave)
          // A start faster than 1 ms is a click.
          expect(v.attackMs ?? 1.5).toBeGreaterThanOrEqual(1)
        }
      }
    })

    it(`${name}: a press is short enough not to pile up (under 150 ms to die away completely)`, () => {
      for (const kind of KINDS) {
        for (const v of pressVoices(style, kind, true)) {
          const startMs = Array.isArray(v.at) ? v.at[1] : (v.at ?? 0)
          expect(startMs + (v.attackMs ?? 1.5) + v.decayMs).toBeLessThan(150)
        }
      }
    })

    it(`${name}: Backspace or Enter with a modifier is heavier, lower and louder`, () => {
      for (const kind of ['keyDelete', 'keyEnter'] as const) {
        const normal = pressVoices(style, kind)
        const big = pressVoices(style, kind, true)
        expect(peak(big)).toBeGreaterThan(peak(normal) * 1.4)
        expect(big[0].decayMs).toBeGreaterThan(normal[0].decayMs)
        expect(Math.min(big[0].hz, big[0].to ?? Infinity)).toBeLessThan(Math.min(normal[0].hz, normal[0].to ?? Infinity))
      }
    })
  }

  it('has the four built styles', () => {
    expect(Object.keys(KEY_STYLES)).toEqual(['creamy', 'water', 'pop', 'clicky'])
  })
})
