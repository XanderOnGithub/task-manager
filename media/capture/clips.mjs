// The README clips. Each one is a few seconds showing one part of Moss.
//
//   node clips.mjs [name ...]     records the named clips (default: all)
//
// Needs the dev server (pnpm vite) and a built bridge; see media/README.md.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { open } from './recorder.mjs'

const OUT = process.env.MEDIA_OUT ?? join(new URL('.', import.meta.url).pathname, 'out')
const wallBlur = 'data:image/png;base64,' + readFileSync(join(OUT, 'wall-blur.png')).toString('base64')
const base = { out: OUT, wallpaper: wallBlur }

const nav = (label) => `nav[aria-label="Sidebar"] button:has-text("${label}")`

export const clips = {
  // ⌘N from anywhere, type a thought, Enter: it lands at the top of Unsorted.
  async 'quick-capture'() {
    const r = await open({ ...base, name: 'quick-capture' })
    await r.setupClick(nav('Unsorted'))
    await r.place('main', { x: 0.62, y: 0.78 })
    r.cursor.visible = false
    await r.hold(700)
    await r.press('Meta+n', { show: '⌘ N' })
    await r.hold(450)
    await r.type('Book the electrician for Friday', 17)
    await r.hold(350)
    await r.press('Enter', { show: '↩' })
    await r.hold(2200)
    await r.close()
  },

  // Open an item, Create as Task, choose where it goes. It leaves Unsorted.
  async unsorted() {
    const r = await open({ ...base, name: 'unsorted' })
    await r.setupClick(nav('Unsorted'))
    await r.place('main', { x: 0.7, y: 0.9 })
    await r.hold(500)
    await r.move('main button:has-text("buy caulk for the sink")', 700, { x: 0.32, y: 0.5 })
    await r.hold(120)
    await r.click(380)
    await r.move('main button:has-text("Task")', 520)
    await r.hold(120)
    await r.click(500)
    await r.move('main button:has-text("Replace the sink")', 560, { x: 0.14, y: 0.5 })
    await r.hold(200)
    await r.click(300)
    // Rest in the sidebar's empty space, not over the next item's picker.
    await r.move('nav[aria-label="Sidebar"]', 700, { x: 0.55, y: 0.72 })
    await r.hold(1700)
    await r.close()
  },

  // A project in List: finish a task. Switch to Board: drag a card to Doing.
  async tasks() {
    const r = await open({ ...base, name: 'tasks' })
    await r.setupClick('button[aria-label="Expand Home"]')
    await r.setupClick('nav >> text=Renovate the house')
    await r.place('main', { x: 0.62, y: 0.9 })
    await r.hold(450)
    await r.move('[data-item=TSKINSTL01] button[aria-label^="Status"]', 650)
    await r.hold(120)
    await r.click(900)
    await r.move('main button:has-text("Board")', 650)
    await r.hold(100)
    await r.click(650)
    await r.move('[data-item=TSKPLUMB01]', 520, { x: 0.45, y: 0.32 })
    await r.hold(150)
    const doing = await r.point('main >> text="Doing"')
    await r.drag({ x: doing.x + 75, y: doing.y + 80 }, 950)
    await r.move('main', 600, { x: 0.82, y: 0.88 })
    await r.hold(1300)
    await r.close()
  },

  // Open a page, "/" for a checklist, write two items, tick one.
  async pages() {
    const r = await open({ ...base, name: 'pages' })
    await r.setupClick(nav('Pages'))
    await r.place('main', { x: 0.7, y: 0.8 })
    await r.hold(400)
    await r.move('main button:has-text("Kitchen measurements")', 650, { x: 0.18, y: 0.5 })
    await r.hold(100)
    await r.click(650)
    // End of the first line: click to the right of the text.
    await r.move('main [contenteditable] p', 550, { x: 0.86, y: 0.5 })
    await r.click(250)
    await r.press('End')
    await r.press('Enter')
    await r.hold(200)
    await r.type('/che', 9)
    await r.hold(450)
    await r.press('Enter')
    await r.hold(200)
    await r.type('Order the faucet', 18)
    await r.press('Enter')
    await r.type('Pick up grout', 18)
    await r.hold(350)
    const li = await r.page.locator('main [data-item-type="task"]').first().boundingBox()
    // The box is drawn 1.4em to the left of the item's text (editor.css).
    await r.move({ x: li.x - 15, y: li.y + 12 }, 600)
    await r.hold(120)
    await r.click(500)
    await r.move('main', 600, { x: 0.8, y: 0.86 })
    await r.hold(1300)
    await r.close()
  },
}

const names = process.argv.slice(2)
for (const name of names.length ? names : Object.keys(clips)) {
  if (!clips[name]) throw new Error(`no clip called ${name}`)
  await clips[name]()
}
