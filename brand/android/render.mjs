// Draws the Android icon layers (foreground, background, monochrome) from their
// SVGs into 1024px PNGs, with a real browser so gradients come out right.
//
//   node brand/android/render.mjs
//
// Then `pnpm tauri icon brand/android/icon.json` (the Android workflow does it).
// Needs a Chromium: set CHROMIUM_PATH, or run `pnpm exec playwright-core install chromium`.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
for (const name of ['foreground', 'background', 'monochrome']) {
  const svg = readFileSync(join(here, `${name}.svg`), 'utf8')
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`)
  await page.screenshot({ path: join(here, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } })
  console.log(`${name}.png`)
}
// The plain icon for launchers older than adaptive icons: both layers, flattened.
const layer = (name) => readFileSync(join(here, `${name}.svg`), 'utf8').replace('<svg ', '<svg width="1024" height="1024" style="position:absolute;inset:0" ')
await page.setContent(`<html><body style="margin:0;position:relative">${layer('background')}${layer('foreground')}</body></html>`)
await page.screenshot({ path: join(here, 'legacy.png'), clip: { x: 0, y: 0, width: 1024, height: 1024 } })
console.log('legacy.png')
await browser.close()
