// Task priority: the small mark on rows and cards, and the "Priority" row in
// the details panel. Stored by the app, see app/priorityStore.ts.

import { Check, ChevronDown, ChevronUp, ChevronsUp, Equal, Minus, type LucideIcon } from 'lucide-react'
import { PRIORITIES, usePriority, type Priority } from '../../app/priorityStore'
import { useVocab } from '../../domain/vocab'
import { Menu } from '../../shared/controls'

const LOOK: Record<Priority, { Icon: LucideIcon; color: string }> = {
  1: { Icon: ChevronsUp, color: 'text-priority-urgent' },
  2: { Icon: ChevronUp, color: 'text-priority-high' },
  3: { Icon: Equal, color: 'text-priority-medium' },
  4: { Icon: ChevronDown, color: 'text-priority-low' },
}

/** The priority's icon in its color. */
export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const { Icon, color } = LOOK[priority]
  return <Icon size={size} strokeWidth={2} aria-hidden="true" className={`shrink-0 ${color}`} />
}

/** Shown on a task row or card when the task has a priority. Nothing otherwise. */
export function PriorityMark({ taskId, className = '' }: { taskId: string; className?: string }) {
  const priority = usePriority(taskId)
  const words = useVocab()
  if (!priority) return null
  const name = words.priority(priority)
  return (
    <span title={`Priority: ${name}`} className={`flex shrink-0 items-center ${className}`}>
      <PriorityIcon priority={priority} />
      <span className="sr-only">{`Priority: ${name}`}</span>
    </span>
  )
}

/** The details panel's "Priority" row: a menu with the four levels and None. */
export function PriorityField({ taskId, onChange }: { taskId: string; onChange: (priority: Priority | null) => void }) {
  const value = usePriority(taskId)
  const words = useVocab()
  const name = value ? words.priority(value) : 'None'
  return (
    <Menu
      label={`Priority: ${name}`}
      align="left"
      trigger={
        <span className="-mx-1.5 flex h-7 items-center gap-1.5 rounded-control px-1.5 transition-colors duration-100 hover:bg-hover">
          {value && <PriorityIcon priority={value} />}
          <span className={value ? 'text-fg' : 'text-placeholder'}>{name}</span>
          <ChevronDown size={12} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
        </span>
      }
      items={[
        ...PRIORITIES.map((p) => ({
          label: words.priority(p),
          Icon: p === value ? Check : LOOK[p].Icon,
          onSelect: () => onChange(p),
        })),
        { label: 'None', Icon: value === null ? Check : Minus, onSelect: () => onChange(null) },
      ]}
    />
  )
}
