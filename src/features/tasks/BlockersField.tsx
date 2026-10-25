// The "Waiting on" row of a task's details: the tasks that should be done first.

import { Check, Plus, X } from 'lucide-react'
import type { Item } from '../../platform/api'
import { blockerChoices, blockersOf } from '../../domain/blocked'
import { Menu } from '../../shared/controls'
import { useVocab } from '../../domain/vocab'

export function BlockersField({
  items,
  task,
  onChange,
  onOpen,
}: {
  items: Item[]
  task: Item
  onChange: (ids: string[]) => void
  onOpen: (id: string) => void
}) {
  const current = blockersOf(items, task)
  const choices = blockerChoices(items, task)
  const words = useVocab()
  return (
    <div className="flex flex-col items-start gap-1">
      {current.map((blocker) => (
        <span key={blocker.id} className="flex max-w-full items-center gap-1">
          <button
            onClick={() => onOpen(blocker.id)}
            title={`Open ${words.noun('task')}`}
            className={`min-w-0 truncate rounded-control px-1 text-left transition-colors duration-100 hover:bg-hover ${
              blocker.status === 'done' ? 'text-fg-3 line-through' : 'text-fg'
            }`}
          >
            {blocker.title}
          </button>
          {blocker.status === 'done' && <Check size={12} strokeWidth={2} className="shrink-0 text-done" aria-label="Done" />}
          <button
            onClick={() => onChange(task.blockedBy.filter((id) => id !== blocker.id))}
            aria-label={words.mode === 'agile' ? `Unblock from ${blocker.title}` : `Stop waiting on ${blocker.title}`}
            title="Remove"
            className="flex shrink-0 rounded-control p-0.5 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg-2"
          >
            <X size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      ))}
      {choices.length > 0 && (
        <Menu
          label={words.mode === 'agile' ? `Add a blocking ${words.noun('task')}` : `Add ${words.a('task')} to wait on`}
          align="left"
          trigger={
            <span className="-mx-1.5 flex h-7 items-center gap-1 rounded-control px-1.5 text-placeholder transition-colors duration-100 hover:bg-hover">
              <Plus size={12} strokeWidth={2} aria-hidden="true" />
              {current.length ? 'Add another' : `Choose ${words.a('task')}`}
            </span>
          }
          items={choices.slice(0, 30).map((choice) => ({
            label: choice.title,
            onSelect: () => onChange([...task.blockedBy, choice.id]),
          }))}
        />
      )}
      {current.length === 0 && choices.length === 0 && <span className="text-placeholder">{`No other open ${words.nouns('task')} in this ${words.noun('project')}`}</span>}
    </div>
  )
}
