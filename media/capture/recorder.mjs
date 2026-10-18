// Records the real Moss front end frame by frame.
//
// Time in the page is fake and paused (Playwright's clock). Each frame we move
// it forward exactly 1/fps of a second, step every running CSS/Web Animation by
// the same amount, wait for the bridge to finish any command, and take a
// screenshot. The result is perfectly smooth at any speed of computer, and the
// same every run.
//
// The cursor isn't in the screenshots; we log where it is each frame and
// compose.py draws it, along with the window frame.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const HERE = new URL('.', import.meta.url).pathname
const REPO = join(HERE, '..', '..')
const BRIDGE_BIN = join(REPO, 'media/bridge/target/release/moss-bridge')
const APP_URL = process.env.MOSS_URL ?? 'http://localhost:1420'
const CHROME = process.env.CHROME ?? '/opt/google/chrome/chrome'

/** Smooth start and stop, for cursor moves. */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A fresh port per clip and per run, so a bridge left over from a crash can't answer.
let nextPort = 20000 + Math.floor(Math.random() * 20000)
const bridges = new Set()
process.on('exit', () => bridges.forEach((b) => b.kill()))

/**
 * Opens a fresh copy of the example data in the app and returns a recorder.
 * Everything you do with it (move, click, type, hold) becomes frames.
 */
export async function open({
  name,
  out,
  width = 920,
  height = 580,
  fps = 30,
  theme = 'dark',
  wallpaper, // data URL of the blurred wallpaper behind the window
  prefs = {}, // localStorage values to start with (sidebar folds, sounds off...)
  start = '2026-10-17T10:30:00',
  dpr = 2,
  format = 'png', // 'jpeg' for long trailer shots
}) {
  const dir = join(out, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'frames'), { recursive: true })
  // Outside the repo: the dev server reloads the page when a .md file in the repo changes.
  const data = join(tmpdir(), 'moss-media-data', name)
  rmSync(data, { recursive: true, force: true })
  cpSync(join(REPO, 'sample-data'), data, { recursive: true })

  // The real core, on this clip's own copy of the example folder.
  const port = nextPort++
  const bridge = spawn(BRIDGE_BIN, [data], { env: { ...process.env, BRIDGE_PORT: String(port), MOSS_NOW: start.replace('T', ' ').slice(0, 16) }, stdio: 'ignore' })
  bridges.add(bridge)
  await sleep(300)

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--font-render-hinting=none', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] })
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    // A Mac user agent: the app then lays out for macOS (⌘ shortcuts, room
    // for the traffic lights, see-through window background).
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
    colorScheme: theme,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message))

  await page.addInitScript((p) => (window.__MOSS_BRIDGE__ = `http://127.0.0.1:${p}`), port)
  await page.addInitScript({ path: join(HERE, 'tauri-stub.js') })
  await page.addInitScript(
    ({ prefs, theme }) => {
      try {
        localStorage.setItem('theme', theme)
        for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
      } catch {}
    },
    { prefs, theme },
  )
  // Steps every CSS transition, CSS animation and Web Animation (Motion uses
  // these for transforms and opacity) by `dt` ms, then finishes the ones that
  // reached their end so their `finished` promises resolve as usual.
  await page.addInitScript(() => {
    const seen = new WeakSet()
    window.__stepAnimations = (dt) => {
      for (const a of document.getAnimations()) {
        if (a.playState === 'finished') continue
        if (a.playState !== 'paused') a.pause()
        // Motion sets start times from the page's (fake) clock, which the
        // browser's real animation timeline doesn't share. The first time we
        // see an animation, start it from zero.
        if (!seen.has(a)) {
          seen.add(a)
          if (!(a.currentTime > 0)) a.currentTime = 0
        }
        const end = a.effect?.getComputedTiming().endTime ?? Infinity
        const next = (a.currentTime ?? 0) + dt * (a.playbackRate || 1)
        if (Number.isFinite(end) && next >= end) a.finish()
        else a.currentTime = next
      }
    }
  })

  await page.clock.install({ time: new Date(start) })
  await page.goto(APP_URL)
  // Let it load in real time, then freeze the clock.
  await page.waitForFunction(() => document.querySelector('nav[aria-label="Sidebar"]'), null, { timeout: 15000 })
  await sleep(1200)
  await page.clock.pauseAt(new Date(new Date(start).getTime() + 5000))
  if (wallpaper) {
    // What macOS shows through the see-through sidebar and background: the
    // wallpaper, blurred. compose.py puts the same wallpaper around the window.
    await page.addStyleTag({ content: `html { background: url(${wallpaper}) 0 0 / 100% 100% no-repeat !important; }` })
  }

  return new Recorder({ name, dir, page, browser, bridge, fps, width, height, format })
}

class Recorder {
  constructor(o) {
    Object.assign(this, o)
    this.dt = 1000 / o.fps
    this.frame = 0
    this.cursor = { x: o.width * 0.62, y: o.height * 0.7, visible: false }
    this.log = [] // per frame: cursor + keys shown
    this.keycap = null // { label, until }
    this.cursorKind = 'arrow'
    this.pressed = false
  }

  /** One frame: advance time, step animations, wait for the app, screenshot. */
  async tick() {
    const { page } = this
    await page.clock.runFor(this.dt)
    await page.evaluate((dt) => window.__stepAnimations(dt), this.dt)
    // Wait for any bridge command (and the reload after it) to finish, and
    // give React a moment to draw the result.
    for (let quiet = 0; quiet < 2; ) {
      await sleep(12)
      quiet = (await page.evaluate(() => window.__mossPending)) === 0 ? quiet + 1 : 0
    }
    await page.evaluate((dt) => window.__stepAnimations(0), this.dt)
    const ext = this.format === 'jpeg' ? 'jpg' : 'png'
    const file = join(this.dir, 'frames', `${String(this.frame).padStart(5, '0')}.${ext}`)
    await page.screenshot(this.format === 'jpeg' ? { path: file, type: 'jpeg', quality: 93 } : { path: file, type: 'png' })
    if (this.cursor.visible) {
      this.cursorKind = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y)
          return el && getComputedStyle(el).cursor === 'text' ? 'ibeam' : 'arrow'
        },
        this.cursor,
      )
    }
    const t = this.frame * this.dt
    this.log.push({
      ...this.cursor,
      kind: this.pressed ? 'arrow' : this.cursorKind,
      pressed: this.pressed,
      keycap: this.keycap && t < this.keycap.until ? this.keycap.label : null,
    })
    this.frame++
  }

  /** Lets time pass without recording, for getting into position before a clip. */
  async skip(ms) {
    for (let t = 0; t < ms; t += this.dt) {
      await this.page.clock.runFor(this.dt)
      await this.page.evaluate((dt) => window.__stepAnimations(dt), this.dt)
      await sleep(8)
    }
    while ((await this.page.evaluate(() => window.__mossPending)) > 0) await sleep(10)
    await sleep(30)
  }

  /** Clicks something without recording it (setup). */
  async setupClick(target) {
    await this.page.locator(target).first().click()
    await this.skip(600)
  }

  /** Puts the cursor somewhere without recording it moving there. */
  async place(target, at) {
    const p = await this.point(target, at)
    this.cursor = { ...p, visible: true }
    await this.page.mouse.move(p.x, p.y)
  }

  /** Frames with nothing happening. */
  async hold(ms) {
    const n = Math.round(ms / this.dt)
    for (let i = 0; i < n; i++) await this.tick()
  }

  /** Where an element is: its center, or `at` (0–1 fractions) inside it. */
  async point(target, at = { x: 0.5, y: 0.5 }) {
    if (typeof target !== 'string') return target
    const box = await this.page.locator(target).first().boundingBox()
    if (!box) throw new Error(`[${this.name}] can't see ${target}`)
    return { x: box.x + box.width * at.x, y: box.y + box.height * at.y }
  }

  /** Glides the cursor to a target over `ms`, sending real mouse moves. */
  async move(target, ms = 600, at) {
    const to = await this.point(target, at)
    const from = { ...this.cursor }
    this.cursor.visible = true
    const n = Math.max(1, Math.round(ms / this.dt))
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n)
      // A slight arc reads as a hand, not a robot.
      const lift = Math.sin(Math.PI * (i / n)) * Math.min(18, Math.hypot(to.x - from.x, to.y - from.y) * 0.06)
      this.cursor.x = from.x + (to.x - from.x) * k
      this.cursor.y = from.y + (to.y - from.y) * k - lift
      await this.page.mouse.move(this.cursor.x, this.cursor.y)
      await this.tick()
    }
  }

  async click(holdAfter = 120) {
    await this.page.mouse.down()
    this.pressed = true
    await this.tick()
    await this.tick()
    await this.page.mouse.up()
    this.pressed = false
    await this.hold(holdAfter)
  }

  /** Drags from where the cursor is to `target`, like a hand would. */
  async drag(target, ms = 900, at) {
    await this.page.mouse.down()
    this.pressed = true
    await this.hold(120)
    // dnd-kit starts a drag after a few pixels of movement.
    const start = { ...this.cursor }
    for (let i = 1; i <= 4; i++) {
      this.cursor.y = start.y + i * 2
      await this.page.mouse.move(this.cursor.x, this.cursor.y)
      await this.tick()
    }
    await this.move(target, ms, at)
    await this.hold(160)
    await this.page.mouse.up()
    this.pressed = false
    await this.hold(80)
  }

  /** Types like a person: a little uneven, a few characters a second. */
  async type(text, cps = 16) {
    this.cursor.visible = false // macOS hides the pointer while you type
    let seed = text.length
    for (const ch of text) {
      await this.page.keyboard.type(ch)
      seed = (seed * 9301 + 49297) % 233280
      const jitter = 0.7 + (seed / 233280) * 0.6
      await this.hold((1000 / cps) * jitter * (ch === ' ' ? 1.3 : 1))
    }
  }

  /** A key or shortcut ("Enter", "Meta+N"). `show` puts a key cap on screen. */
  async press(keys, { show } = {}) {
    if (show) this.keycap = { label: show, until: this.frame * this.dt + 900 }
    await this.page.keyboard.press(keys)
    await this.tick()
  }

  /** Runs code in the page, e.g. to scroll something into view without frames. */
  async eval(fn, arg) {
    return this.page.evaluate(fn, arg)
  }

  async close() {
    writeFileSync(
      join(this.dir, 'clip.json'),
      JSON.stringify({ name: this.name, fps: this.fps, width: this.width, height: this.height, frames: this.log }),
    )
    await this.browser.close()
    this.bridge.kill()
    console.log(`[${this.name}] ${this.frame} frames`)
  }
}
