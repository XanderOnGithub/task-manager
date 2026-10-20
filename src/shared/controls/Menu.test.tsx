import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { appRoot } from '../../test/setup'
import { Menu } from './Menu'
import { Segmented } from './Segmented'

const container = () => appRoot.appendChild(document.createElement('div'))

describe('Menu', () => {
  function setup() {
    const rename = vi.fn()
    const remove = vi.fn()
    render(
      <Menu
        label="Item actions"
        items={[{ label: 'Rename', onSelect: rename }, 'divider', { label: 'Delete', danger: true, onSelect: remove }]}
      />,
      { container: container() },
    )
    return { rename, remove, button: screen.getByRole('button', { name: 'Item actions' }) }
  }

  it('opens with the Down arrow and puts focus on the first row', async () => {
    const user = userEvent.setup()
    const { button } = setup()
    button.focus()
    await user.keyboard('{ArrowDown}')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu', { name: 'Item actions' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }))
  })

  it('moves with the arrows, wraps, and Home/End jump', async () => {
    const user = userEvent.setup()
    const { button } = setup()
    await user.click(button)
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rename' }))
  })

  it('Escape closes it and returns focus to the button; Tab does too', async () => {
    const user = userEvent.setup()
    const { button } = setup()
    await user.click(button)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
    await user.click(button)
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('Enter on a row runs it and closes the menu', async () => {
    const user = userEvent.setup()
    const { button, rename } = setup()
    await user.click(button)
    await user.keyboard('{Enter}')
    expect(rename).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Segmented', () => {
  function setup(initial: 'list' | 'board' | 'timeline' = 'list') {
    const onChange = vi.fn()
    render(
      <Segmented
        label="Layout"
        value={initial}
        onChange={onChange}
        options={[
          { value: 'list', label: 'List' },
          { value: 'board', label: 'Board' },
          { value: 'timeline', label: 'Timeline' },
        ]}
      />,
      { container: container() },
    )
    return onChange
  }

  it('is a radio group with one Tab stop: the chosen option', () => {
    setup('board')
    expect(screen.getByRole('radiogroup', { name: 'Layout' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Board' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('radio', { name: 'List' }).getAttribute('tabindex')).toBe('-1')
    expect(screen.getByRole('radio', { name: 'Timeline' }).getAttribute('tabindex')).toBe('-1')
  })

  it('the arrow keys choose the next and previous option, wrapping', async () => {
    const user = userEvent.setup()
    const onChange = setup('list')
    screen.getByRole('radio', { name: 'List' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('board')
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('timeline') // wraps from the first
  })
})
