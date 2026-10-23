// Accessibility audit of the built app with axe-core, in a real browser.
//
//   pnpm build && pnpm a11y
//
// Opens each screen (list, board, Unsorted, pages, Issues, Trash, Settings, search,
// first launch) in the light and dark themes against a pretend backend, and
// reports what axe-core finds. Exits with an error if anything is found.
// Runs with Reduce motion on, so a color is never measured halfway through a fade.
// Needs a Chromium: set CHROMIUM_PATH, or run `pnpm exec playwright-core install chromium`.
//
// What this can't tell you: how a screen reader sounds. See docs/ACCESSIBILITY.md.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { launchBrowser, openApp, startPreview } from './lib/mockApp.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const stop = await startPreview()
const browser = await launchBrowser()

async function open(theme, needsFolder = false) {
  const page = await openApp(browser, theme, needsFolder)
  await page.addScriptTag({ content: axeSource })
  return page
}
let total = 0
async function audit(page, label) {
  // Let fades and springs finish first: a color measured halfway through an
  // opacity fade fails contrast on a slow machine (the CI runner), though the
  // finished screen passes. Two quiet checks in a row means it has settled.
  await page.waitForTimeout(400)
  for (let quiet = 0, tries = 0; quiet < 2 && tries < 40; tries++) {
    const running = await page.evaluate(() => document.getAnimations().length + document.querySelectorAll('[style*="opacity: 0."]').length)
    quiet = running === 0 ? quiet + 1 : 0
    await page.waitForTimeout(150)
  }
  const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }))
  const v = res.violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes[0].html.slice(0, 110).replace(/\s+/g, ' ')}`)
  total += v.length
  console.log(`${v.length === 0 ? 'ok  ' : 'FAIL'} ${label}`)
  for (const l of v) console.log('       ' + l)
}

for (const theme of ['light', 'dark']) {
  const page = await open(theme)
  await page.waitForSelector('nav[aria-label="Sidebar"]')
  await audit(page, `${theme}: Tasks list`)
  await page.getByRole('radio', { name: 'Board' }).click(); await audit(page, `${theme}: Board`)
  await page.getByRole('button', { name: /^Today/ }).click(); await audit(page, `${theme}: Today`)
  await page.getByRole('button', { name: 'Unsorted' }).click(); await audit(page, `${theme}: Unsorted`)
  await page.getByRole('checkbox', { name: 'Choose buy caulk' }).click(); await page.waitForTimeout(300); await audit(page, `${theme}: Unsorted bulk`)
  await page.getByRole('checkbox', { name: 'Choose buy caulk' }).click()
  await page.getByText('buy caulk').click(); await page.waitForTimeout(300); await audit(page, `${theme}: Unsorted open`)
  await page.getByRole('button', { name: 'Pages', exact: true }).click(); await audit(page, `${theme}: Pages`)
  await page.getByText('Plan').first().click(); await page.waitForTimeout(500); await audit(page, `${theme}: Page`)
  await page.getByRole('button', { name: /^Issues/ }).click(); await audit(page, `${theme}: Issues`)
  await page.getByRole('button', { name: /^Trash/ }).click(); await audit(page, `${theme}: Trash`)
  await page.getByRole('button', { name: 'Settings' }).click(); await audit(page, `${theme}: Settings general`)
  await page.getByRole('radio', { name: 'Sync' }).click(); await audit(page, `${theme}: Settings sync`)
  await page.getByRole('radio', { name: 'Backups' }).click(); await audit(page, `${theme}: Settings backups`)
  await page.getByRole('radio', { name: 'Sounds' }).click(); await audit(page, `${theme}: Settings sounds`)
  await page.getByRole('radio', { name: 'Fun' }).click(); await audit(page, `${theme}: Settings fun`)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k'); await page.keyboard.type('a'); await audit(page, `${theme}: Search`)
  await page.close()
}
const page = await open('light', true)
await page.waitForTimeout(500)
await audit(page, 'light: Onboarding welcome')
await page.getByRole('button', { name: 'Continue' }).click(); await audit(page, 'light: Onboarding folder')
await browser.close()
stop()
console.log(total === 0 ? '\nNo accessibility violations found.' : `\n${total} kinds of violation found.`)
process.exit(total === 0 ? 0 : 1)
