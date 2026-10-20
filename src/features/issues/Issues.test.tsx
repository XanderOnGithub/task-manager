import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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
})
