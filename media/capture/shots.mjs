// Footage for the trailer (media/trailer). Like clips.mjs, but at 60fps (the
// drag at 120fps, played back at half speed), in a bigger window, saved as
// JPEG into media/trailer/public/shots/<name>/.
//
//   node shots.mjs [name ...]

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { open } from './recorder.mjs'

const HERE = new URL('.', import.meta.url).pathname
const PUBLIC = join(HERE, '..', 'trailer', 'public')
const OUT = join(PUBLIC, 'shots')
const dataUrl = (file) => 'data:image/png;base64,' + readFileSync(file).toString('base64')
const darkWall = dataUrl(join(PUBLIC, 'stage-blur.png'))

const base = { out: OUT, wallpaper: darkWall, width: 1280, height: 800, fps: 60, format: 'jpeg' }
const nav = (label) => `nav[aria-label="Sidebar"] button:has-text("${label}")`

async function openProject(r) {
  await r.setupClick('button[aria-label="Expand Home"]')
  await r.setupClick('nav >> text=Renovate the house')
}

export const shots = {
  async capture() {
    const r = await open({ ...base, name: 'capture' })
    await r.setupClick(nav('Unsorted'))
    await r.hold(500)
    await r.press('Meta+n', { show: '⌘ N' })
    await r.hold(350)
    await r.type('Book the electrician for Friday', 15)
    await r.hold(300)
    await r.press('Enter', { show: '↩' })
    await r.hold(1800)
    await r.close()
  },

  async unsorted() {
    const r = await open({ ...base, name: 'unsorted' })
    await r.setupClick(nav('Unsorted'))
    await r.place('main', { x: 0.7, y: 0.85 })
    await r.hold(300)
    await r.move('main button:has-text("buy caulk for the sink")', 650, { x: 0.3, y: 0.5 })
    await r.click(350)
    await r.move('main button:has-text("Task")', 480)
    await r.click(450)
    await r.move('main button:has-text("Replace the sink")', 520, { x: 0.14, y: 0.5 })
    await r.hold(150)
    await r.click(250)
    await r.move('nav[aria-label="Sidebar"]', 650, { x: 0.55, y: 0.75 })
    await r.hold(1200)
    await r.close()
  },

  // The hierarchy: open an area, then a project.
  async tree() {
    const r = await open({ ...base, name: 'tree' })
    await r.place('nav[aria-label="Sidebar"]', { x: 0.6, y: 0.8 })
    await r.hold(300)
    await r.move('button[aria-label="Expand Home"]', 600)
    await r.click(500)
    await r.move('nav >> text=Renovate the house', 450, { x: 0.4, y: 0.5 })
    await r.click(1600)
    await r.close()
  },

  // Close-up material: finishing a task.
  async complete() {
    const r = await open({ ...base, name: 'complete' })
    await openProject(r)
    await r.place('main', { x: 0.5, y: 0.6 })
    await r.hold(250)
    await r.move('[data-item=TSKINSTL01] button[aria-label^="Status"]', 600)
    await r.hold(150)
    await r.click(1300)
    await r.close()
  },

  // Recorded at 120fps; the trailer plays it at 60 for slow motion.
  async drag() {
    const r = await open({ ...base, name: 'drag', fps: 120 })
    await openProject(r)
    await r.setupClick('main button:has-text("Board")')
    await r.place('[data-item=TSKPLUMB01]', { x: 0.45, y: 0.32 })
    await r.hold(150)
    const doing = await r.point('main >> text="Doing"')
    await r.drag({ x: doing.x + 90, y: doing.y + 110 }, 1000)
    await r.hold(450)
    await r.close()
  },

  async pages() {
    const r = await open({ ...base, name: 'pages' })
    await r.setupClick(nav('Pages'))
    await r.setupClick('main button:has-text("Kitchen measurements")')
    await r.place('main [contenteditable] p', { x: 0.7, y: 2.5 })
    await r.hold(250)
    await r.move('main [contenteditable] p', 450, { x: 0.86, y: 0.5 })
    await r.click(200)
    await r.press('End')
    await r.press('Enter')
    await r.type('/che', 9)
    await r.hold(400)
    await r.press('Enter')
    await r.type('Order the faucet', 17)
    await r.press('Enter')
    await r.type('Pick up grout', 17)
    await r.hold(300)
    const li = await r.page.locator('main [data-item-type="task"]').first().boundingBox()
    await r.move({ x: li.x - 15, y: li.y + 12 }, 550)
    await r.click(1100)
    await r.close()
  },

  async palette() {
    const r = await open({ ...base, name: 'palette' })
    await openProject(r)
    await r.hold(300)
    await r.press('Meta+k', { show: '⌘ K' })
    await r.hold(350)
    await r.type('kitch', 9)
    await r.hold(450)
    await r.press('Enter', { show: '↩' })
    await r.hold(1200)
    await r.close()
  },

  // The same view in dark and light, for the theme wipe.
  async 'list-dark'() {
    const r = await open({ ...base, name: 'list-dark' })
    await openProject(r)
    await r.hold(2500)
    await r.close()
  },
  async 'list-light'() {
    const r = await open({ ...base, name: 'list-light', theme: 'light', wallpaper: lightWall() })
    await openProject(r)
    await r.hold(2500)
    await r.close()
  },
}

/** A pale version of the blurred wallpaper, for the light theme's sidebar. */
function lightWall() {
  const file = join(PUBLIC, 'stage-blur-light.png')
  try {
    readFileSync(file)
  } catch {
    throw new Error('Run: python3 compose.py stage ../trailer/public (it writes stage-blur-light.png)')
  }
  return dataUrl(file)
}

const names = process.argv.slice(2)
for (const name of names.length ? names : Object.keys(shots)) {
  if (!shots[name]) throw new Error(`no shot called ${name}`)
  await shots[name]()
}
writeFileSync(join(OUT, '.done'), new Date().toISOString())
