import { afterEach, describe, expect, it } from 'vitest'
import type { DragStartEvent } from '@dnd-kit/core'
import { endHold, isHolding, startHold } from './hold'

const touchAt = (x: number, y: number) => new TouchEvent('touchstart', { touches: [{ clientX: x, clientY: y } as Touch] })
const start = (activatorEvent: Event) => startHold({ active: { id: 'T1' }, activatorEvent } as unknown as DragStartEvent)
const moveTo = (x: number, y: number) =>
  window.dispatchEvent(new TouchEvent('touchmove', { touches: [{ clientX: x, clientY: y } as Touch] }))

afterEach(() => void endHold())

describe('long press on a touch screen', () => {
  it('letting go without moving asks for the row actions', () => {
    start(touchAt(100, 100))
    expect(isHolding()).toBe(true)
    moveTo(104, 103) // a wobble, not a drag
    expect(endHold()).toBe('T1')
    expect(isHolding()).toBe(false)
  })

  it('moving while held is a drag, not a press', () => {
    start(touchAt(100, 100))
    moveTo(100, 140)
    expect(endHold()).toBeNull()
  })

  it('a mouse drag never opens the actions', () => {
    start(new MouseEvent('mousedown', { clientX: 100, clientY: 100 }))
    expect(endHold()).toBeNull()
  })
})
