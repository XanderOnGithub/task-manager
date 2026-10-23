// Small building blocks used across screens. Each one matches a piece of the
// design canvas, so screens read as layout, not styling.

import type { CSSProperties, ReactNode } from 'react'
import { Calendar, Menu as MenuIcon, Repeat } from 'lucide-react'
import * as m from 'motion/react-m'
import { spring } from './motion/springs'
import type { Item, MilestoneColor, Status } from '../platform/api'
import { dueLabel, dueTone } from '../domain/dates'
import { repeatPhrase } from '../domain/repeat'
import { useCompactNav } from './compactNav'

/** A rounded, solid content panel. */
export function Panel({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-border bg-panel ${className}`}
    >
      {children}
    </section>
  )
}

/**
 * The 48px bar at the top of a panel. It's a named container ("header"), so
 * controls inside can go compact when the panel is narrow: put
 * `@max-[34rem]/header:sr-only` on a label to keep only its icon.
 */
export function PanelHeader({ children }: { children: ReactNode }) {
  // On a narrow window the sidebar is a drawer, and every header starts with the button that opens it.
  const nav = useCompactNav()
  return (
    <header
      data-tauri-drag-region
      className={`@container/header flex h-12 shrink-0 items-center gap-2.5 border-b border-border pr-3.5 ${nav ? 'pl-2' : 'pl-[18px]'}`}
    >
      {nav && (
        <button
          onClick={nav.openMenu}
          aria-label="Open menu"
          className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-control text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
        >
          <MenuIcon size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      {children}
    </header>
  )
}

/** Small uppercase label above a group ("Areas", "Tasks"). */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-label tracking-label text-fg-3 uppercase ${className}`}>{children}</div>
}

/** Tinted milestone chip. `header` is the bigger version used as a list heading. */
export function MilestoneChip({
  title,
  color,
  header = false,
  className = '',
}: {
  title: string
  color: MilestoneColor | null
  header?: boolean
  /** Layout classes. The chip never grows, and shrinks (cutting its name with "…") when space runs out. */
  className?: string
}) {
  const style = { '--ms': `var(--color-ms-${color ?? 'sand'})` } as CSSProperties
  return (
    <span
      className={`milestone-chip max-w-full min-w-0 shrink whitespace-nowrap ${header ? 'milestone-chip-header' : ''} ${className}`}
      style={style}
      title={title}
    >
      <span className="truncate">{title}</span>
    </span>
  )
}

/**
 * Status circle. Todo is an empty gray ring, Doing is half-filled amber, Done
 * is a filled sage circle with a check. Milestones use open/done the same way.
 * The optional lanes: Later is a dashed gray ring, Waiting a lavender ring
 * with a small pause sign.
 *
 * All three are layers of one drawing, so changing status animates: the ring
 * changes color, the half fill swings in, the done circle pops and its check
 * draws itself. Nothing animates when it first appears.
 */
export function StatusIcon({ status, size = 16 }: { status: Status | null; size?: number }) {
  const done = status === 'done'
  const doing = status === 'doing'
  const waiting = status === 'waiting'
  const later = status === 'later'
  const ring = done ? 'text-done' : doing ? 'text-doing' : waiting ? 'text-waiting' : later ? 'text-later' : 'text-todo'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 overflow-visible ${ring}`}>
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        // Later: the ring breaks into dashes.
        strokeDasharray={later ? '3.2 2.6' : undefined}
        className="transition-colors duration-150"
      />
      <m.path
        d="M10 9v6M14 9v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ transformOrigin: '12px 12px' }}
        initial={false}
        animate={waiting ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
        transition={spring.snappy}
      />
      <m.path
        d="M12 6.5a5.5 5.5 0 0 1 0 11z"
        fill="currentColor"
        style={{ transformOrigin: '12px 12px' }}
        initial={false}
        animate={doing ? { opacity: 1, rotate: 0 } : { opacity: 0, rotate: -120 }}
        transition={spring.snappy}
      />
      <m.circle
        cx="12"
        cy="12"
        r="9"
        className="fill-done"
        style={{ transformOrigin: '12px 12px' }}
        initial={false}
        animate={done ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
        transition={done ? spring.pop : spring.snappy}
      />
      <m.path
        d="m8.5 12 2.5 2.5 4.5-5"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-on-accent"
        initial={false}
        animate={done ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={done ? { ...spring.snappy, delay: 0.08 } : { duration: 0.08 }}
      />
    </svg>
  )
}

/**
 * A task title that strikes itself through when done: the line sweeps left to
 * right while the text fades to muted, and sweeps back when un-done.
 */
export function TaskTitle({ title, done, className = '' }: { title: string; done: boolean; className?: string }) {
  // The outer span truncates long titles; the inner one is only as wide as the
  // text, so the line stops where the words stop.
  return (
    // At least ~half the row stays for the title, however long the chips next to it are.
    <span className={`min-w-[min(45%,10rem)] flex-1 truncate transition-colors duration-150 ${done ? 'text-fg-3' : 'text-fg'} ${className}`}>
      <m.span
        initial={false}
        animate={{ backgroundSize: done ? '100% 1px' : '0% 1px' }}
        transition={spring.smooth}
        className="bg-[linear-gradient(currentColor,currentColor)] bg-[position:0_58%] bg-no-repeat"
      >
        {title}
      </m.span>
    </span>
  )
}

/**
 * Due date with a calendar icon, colored by urgency, and a repeat mark for a
 * task that comes back. Renders nothing for an item with neither.
 */
export function DueDate({ item, className = '' }: { item: Item; className?: string }) {
  if (!item.due && !item.repeat) return null
  const tone = item.due ? dueTone(item.due, item.status === 'done') : 'normal'
  const color = { normal: 'text-due', soon: 'text-due-soon', overdue: 'text-overdue' }[tone]
  return (
    <span className={`flex shrink-0 items-center gap-1 text-meta font-normal ${color} ${className}`}>
      {item.repeat && (
        <span title={repeatPhrase(item.repeat)} className="flex">
          <Repeat size={12} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">{repeatPhrase(item.repeat)}</span>
        </span>
      )}
      {item.due && (
        <>
          <Calendar size={12} strokeWidth={2} aria-hidden="true" />
          {dueLabel(item.due)}
        </>
      )}
    </span>
  )
}

/** Thin progress bar. */
export function Progress({ done, total, className = '' }: { done: number; total: number; className?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <span aria-hidden="true" className={`flex h-[3px] overflow-hidden rounded-full bg-track ${className}`}>
      <m.span
        className="rounded-full bg-accent"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={spring.smooth}
      />
    </span>
  )
}
