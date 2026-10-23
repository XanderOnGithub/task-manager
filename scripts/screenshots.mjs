// Screenshots of the built app against the pretend backend, at desktop and phone
// size, to look at layouts without running the whole app.
//
//   pnpm build && node scripts/screenshots.mjs <folder> [desktop|phone|all] [light|dark]
//
// One PNG per screen and size is written to <folder>. Needs a Chromium: set
// CHROMIUM_PATH, or run `pnpm exec playwright-core install chromium`.

import { mkdirSync } from 'node:fs'
import { launchBrowser, openApp, startPreview } from './lib/mockApp.mjs'

const [, , folder = 'screenshots', which = 'all', theme = 'dark'] = process.argv
mkdirSync(folder, { recursive: true })

const SIZES = {
  desktop: { viewport: { width: 1280, height: 820 }, hasTouch: false },
  // A Pixel 8: 412 x 915 CSS pixels.
  phone: { viewport: { width: 412, height: 915 }, hasTouch: true },
}

const stop = await startPreview()
const browser = await launchBrowser()

for (const [size, options] of Object.entries(SIZES)) {
  if (which !== 'all' && which !== size) continue
  const page = await openApp(browser, theme, false, options)
  const shot = async (name) => {
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${folder}/${size}-${name}.png` })
    console.log(`${size}-${name}.png`)
  }
  const click = async (locator) => {
    // On a phone a sidebar button may be hidden; fall back to the keyboard-free route.
    await locator.click({ timeout: 3000 }).catch(() => console.log('  (could not click)'))
  }
  await page.waitForSelector('main')
  await shot('tasks-list')
  // On a phone the sidebar is a drawer behind the menu button in each header.
  const phone = size === 'phone'
  if (phone) {
    await click(page.getByRole('button', { name: 'Open menu' }))
    await shot('drawer')
    await page.keyboard.press('Escape')
  }
  await click(page.getByRole('radio', { name: 'Board' }))
  await shot('board')
  await click(page.getByRole('radio', { name: 'List' }))
  await click(page.getByText('Pick tile').first())
  await shot('task-details')
  await page.keyboard.press('Escape')
  await click(page.getByRole('button', { name: 'Unsorted' }))
  await shot('unsorted')
  await click(page.getByRole('button', { name: /^Today/ }))
  await shot('today')
  await click(page.getByRole('button', { name: 'Pages', exact: true }))
  await shot('pages')
  if (phone) await click(page.getByRole('button', { name: 'Open menu' }))
  await click(page.getByRole('button', { name: 'Settings' }))
  await shot('settings')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k')
  await page.keyboard.type('a')
  await shot('search')
  await page.close()
}
await browser.close()
stop()
