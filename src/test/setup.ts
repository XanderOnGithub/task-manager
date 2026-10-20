// Test setup. jsdom (the browser stand-in) has no layout, so every element
// reports "nothing to draw" and focus helpers that skip hidden elements would
// skip everything. Report one box for any element that is attached and not
// `hidden`.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
  configurable: true,
  value(this: HTMLElement) {
    const visible = this.isConnected && !this.closest('[hidden]')
    return (visible ? [{ x: 0, y: 0, width: 10, height: 10 }] : []) as unknown as DOMRectList
  },
})

// The page's one mount point, as in index.html. Dialogs make it inert.
const root = document.createElement('div')
root.id = 'root'
document.body.append(root)

afterEach(() => {
  cleanup()
  root.removeAttribute('inert')
  root.replaceChildren()
})

export const appRoot = root
