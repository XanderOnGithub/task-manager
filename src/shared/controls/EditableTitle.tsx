// Editable title: looks like text, becomes a field on click.

import { useState } from 'react'

export function EditableTitle({
  value,
  onSave,
  className = '',
  editing: startEditing = false,
  heading = false,
}: {
  value: string
  onSave: (title: string) => Promise<unknown>
  className?: string
  editing?: boolean
  /** The page's main heading (an h1), for the title at the top of a view. */
  heading?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(startEditing ? value : null)

  // Reads the field itself, not state, so the last keystrokes are never lost.
  const commit = async (text: string) => {
    const title = text.trim()
    setDraft(null)
    if (title && title !== value) await onSave(title)
  }

  const wrap = (node: React.ReactNode) => (heading ? <h1 className="w-fit">{node}</h1> : node)

  if (draft === null) {
    return wrap(
      <button
        onClick={() => setDraft(value)}
        title="Rename"
        className={`-mx-1 rounded-control px-1 text-left transition-colors duration-100 hover:bg-hover ${className}`}
      >
        {value}
      </button>,
    )
  }
  return wrap(
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
    />,
  )
}
