import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContextMenu } from './ContextMenu'
import { ROW_ACTIONS } from '../drag/hold'

const items = [{ label: 'Delete task', danger: true, onSelect: vi.fn() }]

function setup() {
  render(
    <>
      <div data-item="T1" data-testid="row">
        Pick tile
      </div>
      <ContextMenu menuFor={() => items} titleFor={() => 'Pick tile'} />
    </>,
  )
  return screen.getByTestId('row')
}

const touch = (type: string, target: EventTarget, x = 10, y = 10) => {
  const t = { clientX: x, clientY: y, target } as unknown as Touch
  target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t] }))
}

afterEach(() => vi.useRealTimers())

describe('touch: the actions of a row', () => {
  it('open as a sheet after a long press, once the finger lifts', () => {
    vi.useFakeTimers()
    const row = setup()
    touch('touchstart', row)
    act(() => void vi.advanceTimersByTime(600))
    expect(screen.queryByRole('menu')).toBeNull() // not under the finger yet
    act(() => touch('touchend', row))
    expect(screen.getByRole('menu', { name: 'Pick tile' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete task' })).toBeTruthy()
  })

  it("don't open after a short tap or a scroll", () => {
    vi.useFakeTimers()
    const row = setup()
    touch('touchstart', row)
    act(() => void vi.advanceTimersByTime(100))
    act(() => touch('touchend', row))
    touch('touchstart', row)
    touch('touchmove', row, 10, 60)
    act(() => void vi.advanceTimersByTime(600))
    act(() => touch('touchend', row))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('open when a held row is let go without moving (drag.ts asks)', () => {
    setup()
    act(() => void window.dispatchEvent(new CustomEvent(ROW_ACTIONS, { detail: 'T1' })))
    expect(screen.getByRole('menu', { name: 'Pick tile' })).toBeTruthy()
  })
})
