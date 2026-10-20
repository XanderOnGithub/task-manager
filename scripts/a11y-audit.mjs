// Accessibility audit of the built app with axe-core, in a real browser.
//
//   pnpm build && pnpm a11y
//
// Opens each screen (list, board, Unsorted, pages, Issues, Trash, Settings, search,
// first launch) in the light and dark themes against a pretend backend, and
// reports what axe-core finds. Exits with an error if anything is found.
// Needs a Chromium: set CHROMIUM_PATH, or run `pnpm exec playwright-core install chromium`.
//
// What this can't tell you: how a screen reader sounds. See docs/ACCESSIBILITY.md.

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const PORT = 4173
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const stop = () => server.kill()
process.on('exit', stop)
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break
  } catch {
    await new Promise((r) => setTimeout(r, 200))
  }
}

const items = [
  { id: 'AREAHOME01', kind: 'area', title: 'Home', path: 'areas/Home', isFolder: true, parent: null, status: null, order: 'a', created: '2026-10-01', due: null, color: null, icon: null },
  { id: 'PRJBATH001', kind: 'project', title: 'Redo the bathroom', path: 'areas/Home/Redo the bathroom', isFolder: true, parent: 'AREAHOME01', status: 'active', order: 'a', created: '2026-10-01', due: null, color: null, icon: null },
  { id: 'MSSINK0001', kind: 'milestone', title: 'Sink', path: 'areas/Home/Redo the bathroom/Sink', isFolder: true, parent: 'PRJBATH001', status: 'open', order: 'a', created: '2026-10-01', due: null, color: 'teal', icon: null },
  { id: 'TSKTILE001', kind: 'task', title: 'Pick tile', path: 'areas/Home/Redo the bathroom/Sink/Pick tile.md', isFolder: false, parent: 'MSSINK0001', status: 'doing', order: 'a', created: '2026-10-01', due: '2026-10-30', color: null, icon: null },
  { id: 'TSKGROUT01', kind: 'task', title: 'Buy grout', path: 'areas/Home/Redo the bathroom/Sink/Buy grout.md', isFolder: false, parent: 'MSSINK0001', status: 'todo', order: 'b', created: '2026-10-01', due: null, color: null, icon: null },
  { id: 'PAGEPLAN01', kind: 'page', title: 'Plan', path: 'areas/Home/Redo the bathroom/Pages/Plan.md', isFolder: false, parent: 'PRJBATH001', status: null, order: 'a', created: '2026-10-01', due: null, color: null, icon: '🌿' },
]
const snapshot = { dataFolder: '/Users/me/Moss', items, issues: [{ type: 'notPortable', path: 'areas/Home/Why not?', reason: 'x', message: 'Name problem', fixable: false, name: 'Why not?' }], unsorted: [{ line: 0, raw: '- 2026-10-15 22:42 buy caulk', added: '2026-10-15 22:42', text: 'buy caulk' }] }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })
async function open(theme, needsFolder = false) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme })
  await page.addInitScript(({ snapshot, needsFolder }) => {
    const handlers = {
      get_data_folder: () => (needsFolder ? null : snapshot.dataFolder), load_library: () => snapshot, list_trash: () => [{ path: '.trash/20261016-223512-Old.md', original: 'areas/Home/Old.md', title: 'Old', kind: 'task', from: ['Home'], deleted: '2026-10-16 22:35' }],
      read_body: () => 'Some text\n', get_high_refresh: () => ({ supported: false, enabled: false }), suggested_data_folder: () => ({ path: '/Users/me/Documents/Moss', display: '~/Documents/Moss' }),
      sync_state: () => ({ gitAvailable: true, loginAvailable: true, username: 'me', repo: 'me/moss-data', paused: false, syncing: false, lastSynced: Date.now() - 120000, error: null, pending: 2 }),
      search_text: () => [], github_repos: () => [{ fullName: 'me/moss-data', private: true, defaultBranch: 'main', cloneUrl: 'x', empty: false }],
    }
    window.__TAURI_INTERNALS__ = { invoke: async (c, a) => (handlers[c] ? handlers[c](a) : null), transformCallback: () => 1, convertFileSrc: (x) => x, metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } } }
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
  }, { snapshot, needsFolder })
  await page.goto(`http://localhost:${PORT}/`)
  await page.addScriptTag({ content: axeSource })
  return page
}
let total = 0
async function audit(page, label) {
  await page.waitForTimeout(500)
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
  await page.getByRole('button', { name: 'Unsorted' }).click(); await audit(page, `${theme}: Unsorted`)
  await page.getByText('buy caulk').click(); await page.waitForTimeout(300); await audit(page, `${theme}: Unsorted open`)
  await page.getByRole('button', { name: 'Pages', exact: true }).click(); await audit(page, `${theme}: Pages`)
  await page.getByText('Plan').first().click(); await page.waitForTimeout(500); await audit(page, `${theme}: Page`)
  await page.getByRole('button', { name: /^Issues/ }).click(); await audit(page, `${theme}: Issues`)
  await page.getByRole('button', { name: /^Trash/ }).click(); await audit(page, `${theme}: Trash`)
  await page.getByRole('button', { name: 'Settings' }).click(); await audit(page, `${theme}: Settings general`)
  await page.getByRole('radio', { name: 'Sync' }).click(); await audit(page, `${theme}: Settings sync`)
  await page.getByRole('radio', { name: 'Sounds' }).click(); await audit(page, `${theme}: Settings sounds`)
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
