import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../sound/sounds', () => ({ play: vi.fn() }))

import { MarkdownEditor } from './MarkdownEditor'

describe('MarkdownEditor start-up', () => {
  it('shows the placeholder at once for an empty text, without building the editor', () => {
    const { container } = render(<MarkdownEditor value="" onSave={vi.fn()} placeholder="Add a description" label="Description" />)
    const standIn = screen.getByRole('textbox', { name: 'Description' })
    expect(standIn.getAttribute('data-placeholder')).toBe('Add a description')
    expect(standIn.tabIndex).toBe(0)
    // The real editor (contenteditable) isn't there until you click or tab in.
    expect(container.querySelector('[contenteditable="true"]')).toBeNull()
  })
})
