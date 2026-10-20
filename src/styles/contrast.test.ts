// Text colors must stay readable (WCAG AA, 4.5:1) on every surface they can sit
// on, in both themes. If you change a color in tokens.css and this fails, the
// new color is too faint.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8')

type Colors = Record<string, string>

/** `--color-name: #RRGGBB` pairs in a piece of CSS (opaque colors only). */
function hexColors(block: string): Colors {
  return Object.fromEntries([...block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map(([, name, value]) => [name, value]))
}

type Rgba = [number, number, number, number]

/** `--color-name: rgba(r, g, b, a)` pairs: the see-through tints (hover, field, selected...). */
function tints(block: string): Record<string, Rgba> {
  return Object.fromEntries(
    [...block.matchAll(/--color-([a-z0-9-]+):\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)].map(([, name, r, g, b, a]) => [
      name,
      [Number(r), Number(g), Number(b), Number(a)] as Rgba,
    ]),
  )
}

/** A tint laid over an opaque color, as `#rrggbb`. */
function over(tint: Rgba, base: string): string {
  const [r, g, b, a] = tint
  const mixed = [1, 3, 5].map((i, n) => Math.round([r, g, b][n] * a + parseInt(base.slice(i, i + 2), 16) * (1 - a)))
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** `--color-name: var(--color-other)` pairs, e.g. placeholder → fg-3. */
function aliases(block: string): [string, string][] {
  return [...block.matchAll(/--color-([a-z0-9-]+):\s*var\(--color-([a-z0-9-]+)\)/g)].map(([, name, target]) => [name, target])
}

function slice(from: string, to?: string): string {
  const start = css.indexOf(from)
  const end = to ? css.indexOf(to, start) : css.length
  if (start < 0 || end < 0) throw new Error(`tokens.css changed shape: ${from} … ${to}`)
  return css.slice(start, end)
}

const themeBlock = slice('@theme static', '/* Values used from code')
const darkColors = hexColors(themeBlock)
// An alias follows the color it points at in the theme being checked, as it
// does in CSS (the light blocks override fg-3, so placeholder follows it).
function theme(overrides: Colors): Colors {
  const colors = { ...darkColors, ...overrides }
  for (const [name, target] of aliases(themeBlock)) colors[name] = colors[target]
  return colors
}

const darkTints = tints(themeBlock)
const lightBlock = slice('@media (prefers-color-scheme: light)', ':root[data-theme="light"]')
const dark = theme({})
const light = theme(hexColors(lightBlock))
const lightTints = { ...darkTints, ...tints(lightBlock) }
// The explicit light override must agree with the system-follows-light one.
const lightExplicitBlock = slice(':root[data-theme="light"]')
const lightExplicit = theme(hexColors(lightExplicitBlock))
const lightExplicitTints = { ...darkTints, ...tints(lightExplicitBlock) }

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = ['fg', 'fg-2', 'fg-3', 'placeholder', 'accent', 'doing', 'due-soon', 'overdue', 'danger', 'waiting']
const SURFACES = ['panel', 'raised', 'menu', 'window-solid']

// Muted text also sits on hover highlights, fields, the selected row and badges.
const TINTS = ['hover', 'field', 'badge', 'selected', 'column']
const BASES = ['panel', 'menu', 'window-solid', 'raised']

describe.each([
  ['dark', dark, darkTints],
  ['light', light, lightTints],
  ['light (explicit)', lightExplicit, lightExplicitTints],
])('%s theme', (_, colors, tint) => {
  for (const text of ['fg', 'fg-2', 'fg-3']) {
    for (const name of TINTS) {
      for (const base of BASES) {
        it(`${text} is readable on ${name} over ${base}`, () => {
          expect(contrast(colors[text], over(tint[name], colors[base]))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
  for (const surface of ['seg-on', 'card']) {
    it(`muted text is readable on ${surface}`, () => {
      expect(contrast(colors['fg-3'], colors[surface])).toBeGreaterThanOrEqual(4.5)
    })
  }

  for (const text of TEXT) {
    for (const surface of SURFACES) {
      it(`${text} is readable on ${surface}`, () => {
        expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('text on the accent button is readable', () => {
    expect(contrast(colors['on-accent'], colors['accent'])).toBeGreaterThanOrEqual(4.5)
  })
})
