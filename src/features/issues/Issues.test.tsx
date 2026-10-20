import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../platform/api', () => ({ revealPath: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../shared/toast/toast', () => ({ useToast: () => vi.fn() }))

import { revealPath, type Issue } from '../../platform/api'
import { IssuesView } from './Issues'

const issue = (over: Partial<Issue> = {}) =>
  ({
    type: 'strayFile',
    path: 'areas/Home/Notes.md',
    name: 'Notes',
    message: 'File is in a place where only folders belong',
    fixable: false,
    ...over,
  }) as Issue

beforeEach(() => {
  // `restoreMocks` in the test config clears mock implementations between tests.
  vi.mocked(revealPath).mockResolvedValue(undefined)
})

describe('IssuesView', () => {
  it('lists each problem with its name and wording, and says so when there are none', () => {
    const { rerender } = render(<IssuesView issues={[issue(), issue({ path: 'areas/Why not?', name: 'Why not?', message: 'x' })]} />)
    expect(screen.getByRole('heading', { name: 'Issues' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('File is in a place where only folders belong')).toBeTruthy()
    rerender(<IssuesView issues={[]} />)
    expect(screen.getByText('No issues')).toBeTruthy()
  })

  it('Reveal opens the file by its path, and its name says which one', async () => {
    render(<IssuesView issues={[issue()]} />)
    const button = screen.getByRole('button', { name: /Reveal Notes in the file manager/ })
    await userEvent.click(button)
    expect(revealPath).toHaveBeenCalledWith('areas/Home/Notes.md')
  })

  it('Open goes to the item an issue belongs to, and is left out when there is none', async () => {
    const onOpen = vi.fn()
    render(
      <IssuesView
        issues={[
          issue({ type: 'conflictCopy', name: 'Pick tile (from other computer)', itemId: 'abc' } as Partial<Issue>),
          issue({ itemId: null }),
        ]}
        onOpen={onOpen}
      />,
    )
    expect(screen.getAllByRole('button', { name: /^Open/ })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /Open Pick tile/ }))
    expect(onOpen).toHaveBeenCalledWith('abc')
  })
})
