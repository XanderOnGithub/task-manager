// The "Repeat" row of a task's details: how often it comes back.

import { Check, ChevronDown } from 'lucide-react'
import { REPEAT_CHOICES, repeatLabel } from '../../domain/repeat'
import { Menu } from '../../shared/controls'

export function RepeatField({ value, onChange }: { value: string | null; onChange: (repeat: string | null) => void }) {
  return (
    <Menu
      label={`Repeat: ${repeatLabel(value)}`}
      align="left"
      trigger={
        <span className="-mx-1.5 flex h-7 items-center gap-1 rounded-control px-1.5 transition-colors duration-100 hover:bg-hover">
          <span className={value ? 'text-fg' : 'text-placeholder'}>{repeatLabel(value)}</span>
          <ChevronDown size={12} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
        </span>
      }
      items={REPEAT_CHOICES.map((choice) => ({
        label: choice.label,
        Icon: choice.value === value ? Check : undefined,
        onSelect: () => onChange(choice.value),
      }))}
    />
  )
}
