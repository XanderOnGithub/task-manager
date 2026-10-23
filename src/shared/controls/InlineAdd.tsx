// Inline add: a quiet "+ Add a task" row that turns into a text field.

import { useState } from 'react'
import { Plus } from 'lucide-react'

export function InlineAdd({
  id,
  label,
  onAdd,
  onDone,
  autoFocus = false,
  className = '',
}: {
  /** Lets other buttons focus this field (e.g. "+ Task" in the header). */
  id?: string
  label: string
  /** Resolves true when it was added. On false the text stays, so a failed add never loses what was typed. */
  onAdd: (title: string) => Promise<boolean>
  /** Called on Escape, or when the field loses focus while empty. */
  onDone?: () => void
  /** For a field that appears because of something you just did (a click on "Add"). */
  autoFocus?: boolean
  className?: string
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const title = value.trim()
    if (!title || busy) return
    setBusy(true)
    const added = await onAdd(title)
    setBusy(false)
    if (added) setValue('') // stays focused, ready for the next one
  }

  return (
    <label
      className={`group flex h-8 items-center gap-2 rounded-control border border-dashed border-transparent px-2 text-placeholder transition-colors duration-100 focus-within:border-border-dashed focus-within:text-fg-3 hover:text-fg-3 ${className}`}
    >
      <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
      <input
        id={id}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value.trim() && onDone?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') {
            setValue('')
            e.currentTarget.blur()
            onDone?.()
          }
        }}
        placeholder={label}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-placeholder group-hover:placeholder:text-fg-3"
      />
      {value && <kbd className="font-mono text-label font-normal">↵</kbd>}
    </label>
  )
}
