import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearHistory } from './history'
import { useToast } from './toast'
import { appRoot } from '../../test/setup'
import { ToastProvider } from './Toasts'

// Sounds need an audio device, which the test browser doesn't have.
vi.mock('../../sound/sounds', () => ({ play: vi.fn() }))

function Shows({ undo, message = 'Deleted Pick tile', tone }: { undo?: () => void; message?: string; tone?: 'error' }) {
  const toast = useToast()
  useEffect(() => toast({ message, undo, tone }), [toast, message, undo, tone])
  return (
    <>
      <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Page text" />
      <input aria-label="Title" />
    </>
  )
}

const mount = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>, { container: appRoot.appendChild(document.createElement('div')) })

beforeEach(clearHistory)

describe('toasts', () => {
  it('⌘Z runs Undo from anywhere on the page', async () => {
    const undo = vi.fn()
    mount(<Shows undo={undo} />)
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('⌘Z in the page editor or a text field is typing undo, not toast Undo', async () => {
    const undo = vi.fn()
    mount(<Shows undo={undo} />)
    screen.getByRole('textbox', { name: 'Page text' }).focus()
    await userEvent.keyboard('{Control>}z{/Control}')
    screen.getByRole('textbox', { name: 'Title' }).focus()
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(undo).not.toHaveBeenCalled()
  })

  it('⌘Z keeps working after the toast is gone, going further back each time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const undo = vi.fn()
    mount(<Shows undo={undo} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000) // the toast has timed out
    })
    vi.useRealTimers()
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(undo).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(undo).toHaveBeenCalledTimes(1) // nothing older to undo
  })

  it('announces the message in a region that is always there, and errors assertively', () => {
    const view = mount(<Shows message="Moved to Bath" />)
    expect(screen.getAllByRole('status').some((r) => r.textContent === 'Moved to Bath')).toBe(true)
    view.unmount()
    mount(<Shows message="Couldn't save" tone="error" />)
    act(() => {})
    expect(screen.getByRole('alert').textContent).toBe("Couldn't save")
  })
})
