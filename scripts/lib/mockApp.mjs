// A pretend Moss for the scripts that drive the built app in a real browser
// (a11y-audit.mjs, screenshots.mjs): the app's own server, a Chromium, and a
// fake Tauri backend that answers every command with sample data.
//
//   pnpm build   first, so `vite preview` has something to serve.

import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

export const PORT = 4173

/** Starts `vite preview` and waits until it answers. Returns a function that stops it. */
export async function startPreview() {
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
  return stop
}

/** Chromium: set CHROMIUM_PATH, or run `pnpm exec playwright-core install chromium`. */
export const launchBrowser = () =>
  chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] })

export const items = [
  { id: 'AREAHOME01', kind: 'area', title: 'Home', path: 'areas/Home', isFolder: true, parent: null, status: null, order: 'a', created: '2026-10-01', due: null, color: null, icon: null, blockedBy: [] },
  { id: 'PRJBATH001', kind: 'project', title: 'Redo the bathroom', path: 'areas/Home/Redo the bathroom', isFolder: true, parent: 'AREAHOME01', status: 'active', order: 'a', created: '2026-10-01', due: null, color: null, icon: null, blockedBy: [] },
  { id: 'MSSINK0001', kind: 'milestone', title: 'Sink', path: 'areas/Home/Redo the bathroom/Sink', isFolder: true, parent: 'PRJBATH001', status: 'open', order: 'a', created: '2026-10-01', due: null, color: 'teal', icon: null },
  { id: 'TSKTILE001', kind: 'task', title: 'Pick tile', path: 'areas/Home/Redo the bathroom/Sink/Pick tile.md', isFolder: false, parent: 'MSSINK0001', status: 'doing', order: 'a', created: '2026-10-01', due: '2026-10-30', repeat: 'weekly', blockedBy: [], color: null, icon: null, blockedBy: [] },
  { id: 'TSKGROUT01', kind: 'task', title: 'Buy grout', path: 'areas/Home/Redo the bathroom/Sink/Buy grout.md', isFolder: false, parent: 'MSSINK0001', status: 'todo', order: 'b', created: '2026-10-01', due: null, color: null, icon: null, blockedBy: ['TSKTILE001'] },
  { id: 'PAGEPLAN01', kind: 'page', title: 'Plan', path: 'areas/Home/Redo the bathroom/Pages/Plan.md', isFolder: false, parent: 'PRJBATH001', status: null, order: 'a', created: '2026-10-01', due: null, color: null, icon: '🌿', blockedBy: [] },
]
export const snapshot = { dataFolder: '/Users/me/Moss', items, issues: [{ type: 'notPortable', path: 'areas/Home/Why not?', reason: 'x', message: 'Name problem', fixable: false, name: 'Why not?', itemId: null }, { type: 'conflictCopy', path: 'areas/Home/Redo the bathroom/Sink/Pick tile (from other computer).md', id: 'TSKTILE001', message: 'The other computer\'s version.', fixable: false, name: 'Pick tile (from other computer)', itemId: 'TSKTILE001' }], unsorted: [{ line: 0, raw: '- 2026-10-15 22:42 buy caulk', added: '2026-10-15 22:42', text: 'buy caulk' }] }

/**
 * A new page showing the app against the fake backend. `needsFolder` shows the
 * first-launch screens. `viewport` and `hasTouch` let a script look like a phone.
 */
export async function openApp(browser, theme, needsFolder = false, { viewport = { width: 1280, height: 820 }, hasTouch = false, reducedMotion = 'reduce' } = {}) {
  const page = await browser.newPage({ viewport, colorScheme: theme, reducedMotion, hasTouch })
  await page.addInitScript(({ snapshot, needsFolder }) => {
    const handlers = {
      get_data_folder: () => (needsFolder ? null : snapshot.dataFolder), load_library: () => snapshot, list_trash: () => [{ path: '.trash/20261016-223512-Old.md', original: 'areas/Home/Old.md', title: 'Old', kind: 'task', from: ['Home'], deleted: '2026-10-16 22:35' }],
      read_body: () => 'Some text\n', get_high_refresh: () => ({ supported: false, enabled: false }), suggested_data_folder: () => ({ path: '/Users/me/Documents/Moss', display: '~/Documents/Moss' }),
      sync_state: () => ({ gitAvailable: true, loginAvailable: true, username: 'me', repo: 'me/moss-data', paused: false, syncing: false, lastSynced: Date.now() - 120000, error: null, pending: 2 }),
      search_text: () => [], backups_get: () => ({ automatic: true, items: [{ kind: 'automatic', path: '/b/1.zip', fileName: '1.zip', when: '2026-10-19 09:00', madeAt: 1, bytes: 20480 }, { kind: 'manual', path: '/b/2.zip', fileName: '2.zip', when: '2026-10-18 21:10', madeAt: 0, bytes: 3145728 }] }), github_repos: () => [{ fullName: 'me/moss-data', private: true, defaultBranch: 'main', cloneUrl: 'x', empty: false }],
    }
    window.__TAURI_INTERNALS__ = { invoke: async (c, a) => (handlers[c] ? handlers[c](a) : null), transformCallback: () => 1, convertFileSrc: (x) => x, metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } } }
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
  }, { snapshot, needsFolder })
  await page.goto(`http://localhost:${PORT}/`)
  return page
}
