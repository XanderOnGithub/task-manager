// Gathers each recorded shot's clip.json (frame count, cursor positions, key
// caps) into src/shots.json, which the trailer imports.
//   node scripts/index-shots.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(new URL('.', import.meta.url).pathname, '..')
const dir = join(root, 'public', 'shots')
const shots = {}
for (const name of readdirSync(dir)) {
  const file = join(dir, name, 'clip.json')
  if (!existsSync(file)) continue
  const clip = JSON.parse(readFileSync(file, 'utf8'))
  // Round cursor positions; the file is imported into the bundle.
  clip.frames = clip.frames.map((f) => ({
    x: Math.round(f.x * 10) / 10,
    y: Math.round(f.y * 10) / 10,
    v: f.visible ? 1 : 0,
    k: f.kind === 'ibeam' ? 'i' : 'a',
    p: f.pressed ? 1 : 0,
    c: f.keycap ?? undefined,
  }))
  shots[name] = clip
}
writeFileSync(join(root, 'src', 'shots.json'), JSON.stringify(shots))
console.log('shots:', Object.entries(shots).map(([n, s]) => `${n} (${s.frames.length} @ ${s.fps}fps)`).join(', '))
