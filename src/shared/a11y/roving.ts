// Arrow keys for a radio group, the way every native radio group works.
//
// Only the chosen radio is a Tab stop (the first one when nothing is chosen),
// and the arrow keys move the choice and the focus together, wrapping around.
// Use `groupProps` on the element with role="radiogroup" and `itemProps(i)` on
// each role="radio" button.

import { useRef, type KeyboardEvent } from 'react'

export function useRovingRadios(chosen: number, count: number, choose: (index: number) => void) {
  const buttons = useRef<(HTMLElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step || count === 0) return
    e.preventDefault()
    const from = chosen >= 0 ? chosen : buttons.current.findIndex((b) => b === document.activeElement)
    const next = (Math.max(from, 0) + step + count) % count
    choose(next)
    buttons.current[next]?.focus()
  }

  return {
    groupProps: { onKeyDown },
    itemProps: (index: number) => ({
      ref: (el: HTMLElement | null) => {
        buttons.current[index] = el
      },
      tabIndex: index === chosen || (chosen < 0 && index === 0) ? 0 : -1,
    }),
  }
}
