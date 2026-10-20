// Editable title: looks like text, becomes a field on click.

import { useState } from 'react'

export function EditableTitle({
  value,
  onSave,
  className = '',
  editing: startEditing = false,
}: {
  value: string
  onSave: (title: string) => Promise<unknown>
  className?: string
  editing?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(startEditing ? value : null)

  // Reads the field itself, not state, so the last keystrokes are never lost.
  const commit = async (text: string) => {
    const title = text.trim()
    setDraft(null)
    if (title && title !== value) await onSave(title)
  }

  if (draft === null) {
    return (
      <button
        onClick={() => setDraft(value)}
        title="Rename"
        className={`-mx-1 rounded-control px-1 text-left transition-colors duration-100 hover:bg-hover ${className}`}
      >
        {value}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => void commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(null)
      }}
      aria-label="Title"
      className={`-mx-1 rounded-control bg-hover px-1 outline-none ${className}`}
    />
  )
}
