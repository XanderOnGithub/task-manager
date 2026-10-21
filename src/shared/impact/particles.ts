// A handful of specks drawn on one see-through canvas laid over the window.
// It ignores the mouse and the keyboard, is hidden from screen readers, and is
// only added to the page while specks are flying. Colors come from the theme
// tokens (tokens.css), read when a burst starts so light and dark both work.

export type BurstKind = 'done' | 'doing' | 'waiting' | 'dust'

interface Speck {
  x: number
  y: number
  vx: number
  vy: number
  /** Pulled down (positive) or up (negative) each second. */
  gravity: number
  size: number
  life: number
  age: number
  color: string
}

interface Recipe {
  count: number
  token: string
  /** Speed range in pixels per second. */
  speed: [number, number]
  /** Direction range in degrees (0 = right, 270 = up). */
  angle: [number, number]
  gravity: number
  size: [number, number]
  /** Seconds. */
  life: [number, number]
}

const RECIPES: Record<BurstKind, Recipe> = {
  // Sage specks rise and spread: finished.
  done: { count: 16, token: '--color-done', speed: [60, 190], angle: [200, 340], gravity: -60, size: [1.5, 3], life: [0.45, 0.8] },
  // Warm specks pop outward and fade fast: starting.
  doing: { count: 9, token: '--color-doing', speed: [70, 150], angle: [180, 360], gravity: 0, size: [1.5, 2.5], life: [0.3, 0.5] },
  // Cool specks drop: put on hold.
  waiting: { count: 9, token: '--color-waiting', speed: [30, 90], angle: [40, 140], gravity: 420, size: [1.5, 2.5], life: [0.4, 0.65] },
  // A little dust off the bottom edge when something is picked up.
  dust: { count: 6, token: '--color-fg-3', speed: [20, 70], angle: [160, 380], gravity: -20, size: [1, 2], life: [0.3, 0.5] },
}

let canvas: HTMLCanvasElement | null = null
let specks: Speck[] = []
let frame = 0
let last = 0

const between = (range: [number, number]) => range[0] + Math.random() * (range[1] - range[0])

/** Sends a burst from a point (window coordinates, in pixels). */
export function burst(kind: BurstKind, x: number, y: number, spread = 0) {
  const recipe = RECIPES[kind]
  const color = getComputedStyle(document.documentElement).getPropertyValue(recipe.token).trim() || 'currentColor'
  for (let i = 0; i < recipe.count; i++) {
    const angle = (between(recipe.angle) * Math.PI) / 180
    const speed = between(recipe.speed)
    specks.push({
      x: x + (Math.random() - 0.5) * spread,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: recipe.gravity,
      size: between(recipe.size),
      life: between(recipe.life),
      age: 0,
      color,
    })
  }
  start()
}

function start() {
  if (frame) return
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60'
  }
  const ratio = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * ratio
  canvas.height = window.innerHeight * ratio
  document.body.appendChild(canvas)
  last = performance.now()
  frame = requestAnimationFrame(tick)
}

function tick(now: number) {
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return stop()
  // Capped so a stalled frame (a busy reload) doesn't throw specks across the window.
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  const ratio = window.devicePixelRatio || 1
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  specks = specks.filter((s) => (s.age += dt) < s.life)
  for (const s of specks) {
    s.vy += s.gravity * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    const left = 1 - s.age / s.life
    ctx.globalAlpha = left * left
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size * (0.5 + left / 2), 0, Math.PI * 2)
    ctx.fill()
  }
  if (specks.length === 0) return stop()
  frame = requestAnimationFrame(tick)
}

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
  specks = []
  canvas?.remove()
}
