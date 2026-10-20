// Segmented control (List / Board, Task / Page / Project, statuses).
//
// A radio group: one stop in the Tab order (the chosen option), and the arrow
// keys move the choice, as in any radio group.

import { useId, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { spring } from '../motion/springs'

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  iconsOnly = false,
}: {
  label: string
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T | null
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  /** Show only the icons (labels become tooltips and stay readable by screen readers). */
  iconsOnly?: boolean
}) {
  // The selected background is one element that slides between options.
  const thumbId = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const chosen = options.findIndex((o) => o.value === value)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    const from = chosen >= 0 ? chosen : buttons.current.findIndex((b) => b === document.activeElement)
    const next = (Math.max(from, 0) + step + options.length) % options.length
    onChange(options[next].value)
    buttons.current[next]?.focus()
  }

  return (
    // The arrow keys act on the radios inside; the group itself isn't a tab stop.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex w-fit gap-0.5 rounded-row bg-raised p-0.5">
      {options.map((option, i) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[i] = el
            }}
            role="radio"
            aria-checked={on}
            // Only the chosen option is a Tab stop (the first one when nothing is chosen).
            tabIndex={on || (chosen < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            title={option.icon ? option.label : undefined}
            aria-label={iconsOnly ? option.label : undefined}
            className={`relative flex items-center gap-1.5 rounded-md transition-colors duration-100 ${
              iconsOnly ? (size === 'sm' ? 'h-6 px-1.5' : 'h-[26px] px-2') : size === 'sm' ? 'h-6 px-2.5 text-meta' : 'h-[26px] px-3 text-[12.5px] font-medium'
            } ${on ? 'text-fg' : 'text-fg-2 hover:text-fg'}`}
          >
            {on && (
              <motion.span
                layoutId={thumbId}
                transition={spring.snappy}
                className="absolute inset-0 rounded-md bg-seg-on shadow-seg"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon}
              {/* In a narrow panel header, options with an icon show just the icon. */}
              <span className={iconsOnly ? 'sr-only' : option.icon ? '@max-[34rem]/header:sr-only' : ''}>{option.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
