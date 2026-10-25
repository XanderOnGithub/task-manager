// The phone layout's pieces: the drawer and the sheet behave as dialogs, the
// bottom bar names its buttons the way a screen reader should say them, and the
// breakpoint hook follows the window.

import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Drawer } from './Drawer'
import { Sheet } from './Sheet'
import { BottomNav } from '../features/navigation/BottomNav'
import { useCompact } from '../platform/layout'

describe('Drawer and Sheet', () => {
  it.each([
    ['Drawer', Drawer],
    ['Sheet', Sheet],
  ])('%s is a dialog: focus goes in, Escape closes it, focus comes back', async (_name, Panel) => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(
      <Panel label="Menu" onClose={onClose}>
        <button>Inside</button>
      </Panel>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

describe('BottomNav', () => {
  it('names each button with the words on it, count after, and marks the open place', async () => {
    const onOverview = vi.fn()
    render(<BottomNav overview="unsorted" unsortedCount={3} dueCount={0} onOverview={onOverview} onQuickCapture={() => {}} />)
    const unsorted = screen.getByRole('button', { name: 'Unsorted 3' })
    expect(unsorted.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-current')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(onOverview).toHaveBeenCalledWith('tasks')
    expect(screen.getByRole('button', { name: 'Quick capture' })).toBeTruthy()
  })
})

describe('useCompact', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })

  it('is false without matchMedia, and follows the window when there is one', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    expect(renderHook(() => useCompact()).result.current).toBe(false)

    let listener: () => void = () => {}
    let narrow = true
    window.matchMedia = (() => ({
      get matches() {
        return narrow
      },
      addEventListener: (_: string, l: () => void) => (listener = l),
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useCompact())
    expect(result.current).toBe(true)
    narrow = false
    act(() => listener())
    expect(result.current).toBe(false)
  })
})
