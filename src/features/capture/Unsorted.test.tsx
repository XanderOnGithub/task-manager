import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/api', () => ({}))
vi.mock('../../sound/sounds', () => ({ play: vi.fn() }))

import type { UnsortedEntry } from '../../platform/api'
import type { Actions } from '../../app/useActions'
import { UnsortedView } from './Unsorted'

const entry = (n: number): UnsortedEntry =>
  ({ line: n, raw: `- 2026-10-15 22:4${n} item ${n}`, text: `item ${n}`, added: '2026-10-15 22:4' + n }) as UnsortedEntry

const entries = [1, 2, 3, 4].map(entry)
const actions = { fileEntries: vi.fn(), removeEntry: vi.fn() } as unknown as Actions

describe('Unsorted bulk sort', () => {
  it('shows the bar once something is chosen, and Shift chooses a range', async () => {
    render(<UnsortedView entries={entries} items={[]} actions={actions} />)
    expect(screen.queryByRole('region', { name: 'Sort the chosen items' })).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Choose item 1' }))
    expect(screen.getByText('1 chosen')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Choose item 3' }), { shiftKey: true })
    expect(screen.getByText('3 chosen')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText(/chosen$/)).toBeNull()
  })

  it('Choose all picks every item', async () => {
    render(<UnsortedView entries={entries} items={[]} actions={actions} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Choose item 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choose all 4' }))
    expect(screen.getByText('4 chosen')).toBeTruthy()
  })
})
