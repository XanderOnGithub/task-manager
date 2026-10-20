// Switch: an on/off toggle whose knob slides.

import { motion } from 'motion/react'
import { spring } from '../../lib/motion'

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 disabled:opacity-50 ${
        checked ? 'justify-end bg-accent' : 'justify-start bg-border-strong'
      }`}
    >
      <motion.span layout transition={spring.pop} className="size-3.5 rounded-full bg-fg shadow-seg" />
    </button>
  )
}
