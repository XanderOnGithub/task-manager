import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { openDialogs } from '../a11y/modalLayer'
import { appRoot } from '../../test/setup'
import { Modal } from './Modal'

/** A page with a button that opens a dialog, inside #root like the real app. */
function setup(onClose = vi.fn()) {
  function Page({ open }: { open: boolean }) {
    return (
      <>
        <button>Opener</button>
        {open && (
          <Modal label="Settings" onClose={onClose}>
            <button>First</button>
            <input aria-label="Name" />
            <button>Last</button>
          </Modal>
        )}
      </>
    )
  }
  const view = render(<Page open={false} />, { container: appRoot.appendChild(document.createElement('div')) })
  return { ...view, onClose, open: () => view.rerender(<Page open />), close: () => view.rerender(<Page open={false} />) }
}

describe('Modal', () => {
  it('is a labelled modal dialog that takes focus and makes the page behind inert', () => {
    const { open } = setup()
    screen.getByText('Opener').focus()
    open()
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(appRoot.hasAttribute('inert')).toBe(true)
    // It is drawn outside #root, or it would be inert too.
    expect(appRoot.contains(dialog)).toBe(false)
  })

  it('keeps Tab inside, wrapping at both ends', async () => {
    const user = userEvent.setup()
    const { open } = setup()
    open()
    const first = screen.getByText('First')
    const last = screen.getByText('Last')
    expect(document.activeElement).toBe(first)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(last)
    await user.tab()
    expect(document.activeElement).toBe(first)
  })

  it('closes with Escape, gives the page back and returns focus to the opener', async () => {
    const user = userEvent.setup()
    const { open, close, onClose } = setup()
    screen.getByText('Opener').focus()
    open()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    close()
    expect(appRoot.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(screen.getByText('Opener'))
    expect(openDialogs()).toBe(0)
  })

  it('Escape only closes the topmost of two dialogs', async () => {
    const user = userEvent.setup()
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Modal label="Outer" onClose={outer}>
          <button>a</button>
        </Modal>
        <Modal label="Inner" onClose={inner}>
          <button>b</button>
        </Modal>
      </>,
      { container: appRoot },
    )
    await user.keyboard('{Escape}')
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('a click on the backdrop closes it; a click inside does not', async () => {
    const user = userEvent.setup()
    const { open, onClose } = setup()
    open()
    await user.click(screen.getByText('First'))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
