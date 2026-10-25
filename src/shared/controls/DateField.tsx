// Date field: "Add a due date" until there is one, then the system date picker.

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export function DateField({
  value,
  onChange,
  label,
}: {
  value: string | null
  onChange: (date: string | null) => void
  label: string
}) {
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    input.current?.focus()
    try {
      input.current?.showPicker()
    } catch {
      // Not every web view can open the picker from code; the field is focused anyway.
    }
  }, [editing])

  if (!value && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="-mx-1.5 h-7 rounded-control px-1.5 text-placeholder transition-colors duration-100 hover:bg-hover hover:text-fg-3"
      >
        Add a due date
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <input
        ref={input}
        type="date"
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value || null)
          if (e.target.value) setEditing(false)
        }}
        onBlur={() => setEditing(false)}
        aria-label={label}
        className="-mx-1.5 h-7 rounded-control bg-transparent px-1.5 text-compact text-fg outline-none transition-colors duration-100 hover:bg-hover focus:bg-hover"
      />
      {value && (
        <button
          onClick={() => onChange(null)}
          aria-label={`Clear ${label.toLowerCase()}`}
          title="Clear"
          className="flex rounded-md p-1 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg-2"
        >
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
