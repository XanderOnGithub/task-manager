// For writing clips: runs setup clicks, then saves a screenshot and lists the
// buttons and fields on screen, so you can pick selectors.
//
//   node explore.mjs out.png "<selector>" "<selector>" ...
//   A step starting with "key:" presses keys instead, e.g. "key:Meta+k".
import { open } from './recorder.mjs'

const [shot, ...steps] = process.argv.slice(2)
const r = await open({ out: '/tmp/moss-explore', name: 'explore' })
for (const step of steps) {
  if (step.startsWith('key:')) {
    await r.page.keyboard.press(step.slice(4))
    await r.skip(500)
  } else if (step.startsWith('type:')) {
    await r.page.keyboard.type(step.slice(5))
    await r.skip(500)
  } else await r.setupClick(step)
}
await r.page.screenshot({ path: shot })
const seen = await r.eval(() =>
  [...document.querySelectorAll('button, input, [role=option], [role=menuitem], [contenteditable], [data-item]')]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      const b = el.getBoundingClientRect()
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 50)
      return `${el.tagName.toLowerCase()}${el.dataset.item ? `[data-item=${el.dataset.item}]` : ''} "${label}" @${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`
    }),
)
console.log(seen.join('\n'))
await r.close()
