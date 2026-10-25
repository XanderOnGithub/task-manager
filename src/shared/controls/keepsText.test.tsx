// A failed save must never throw away what someone typed (CLAUDE.md: "Never lose
// what someone wrote"). Each field here is given a save that fails, then one
// that works.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InlineAdd } from './InlineAdd'
import { EditableTitle } from './EditableTitle'
import { QuickCapture } from '../../features/capture/QuickCapture'

describe('InlineAdd', () => {
  it('keeps the text when adding fails, and clears it when adding works', async () => {
    const onAdd = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<InlineAdd label="Add a task" onAdd={onAdd} />)
    const field = screen.getByLabelText('Add a task') as HTMLInputElement
    await userEvent.type(field, 'Paint the walls{Enter}')
    expect(onAdd).toHaveBeenCalledWith('Paint the walls')
    expect(field.value).toBe('Paint the walls')
    await userEvent.type(field, '{Enter}')
    expect(field.value).toBe('')
  })
})

describe('InlineAdd on a phone', () => {
  it("asks the keyboard for a Done key and adds on submit, so a phone's Next can't jump to the next field", async () => {
    const onAdd = vi.fn().mockResolvedValue(true)
    render(<InlineAdd label="Add a task" onAdd={onAdd} />)
    const field = screen.getByLabelText('Add a task') as HTMLInputElement
    expect(field.getAttribute('enterkeyhint')).toBe('done')
    await userEvent.type(field, 'Paint the walls')
    // What a phone keyboard's Done/Go does: submit the form the field is in.
    field.form!.requestSubmit()
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledWith('Paint the walls'))
  })
})

describe('EditableTitle', () => {
  it('stays open with the new title when saving fails', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<EditableTitle value="Sink" onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sink' }))
    const field = screen.getByLabelText('Title') as HTMLInputElement
    await userEvent.clear(field)
    await userEvent.type(field, 'Tile{Enter}')
    // Refused: the field is still there, holding what was typed, with focus back in it.
    const stillThere = await screen.findByLabelText('Title')
    expect((stillThere as HTMLInputElement).value).toBe('Tile')
    expect(document.activeElement).toBe(stillThere)
    await userEvent.type(stillThere, '{Enter}')
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(screen.queryByLabelText('Title')).toBeNull()
  })
})

describe('QuickCapture', () => {
  it('stays open with the text when it could not be added, and closes when it was', async () => {
    const onCapture = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onClose = vi.fn()
    render(<QuickCapture onCapture={onCapture} onClose={onClose} />)
    const field = screen.getByLabelText('Add to Unsorted') as HTMLInputElement
    await userEvent.type(field, 'call Bob{Enter}')
    expect(onClose).not.toHaveBeenCalled()
    expect(field.value).toBe('call Bob')
    await userEvent.type(field, '{Enter}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
