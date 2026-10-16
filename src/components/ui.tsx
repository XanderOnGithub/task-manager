// Small building blocks used across screens. Each one matches a piece of the
// design canvas, so screens read as layout, not styling.

import type { CSSProperties, ReactNode } from 'react'
import { Calendar } from 'lucide-react'
import type { Item, MilestoneColor, Status } from '../lib/api'
import { dueLabel, dueTone } from '../lib/dates'

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

/** The 48px bar at the top of a panel. */
export function PanelHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border pr-3.5 pl-[18px]">{children}</header>
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
}: {
  title: string
  color: MilestoneColor | null
  header?: boolean
}) {
  const style = { '--ms': `var(--color-ms-${color ?? 'sand'})` } as CSSProperties
  return (
    <span className={`milestone-chip ${header ? 'milestone-chip-header' : ''}`} style={style}>
      {title}
    </span>
  )
}

/**
 * Status circle. Todo is an empty gray ring, Doing is half-filled amber, Done
 * is a filled sage circle with a check. Milestones use open/done the same way.
 */
export function StatusIcon({ status, size = 16 }: { status: Status | null; size?: number }) {
  if (status === 'done') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="12" r="9" className="fill-done" />
        <path
          d="m8.5 12 2.5 2.5 4.5-5"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-on-accent"
        />
      </svg>
    )
  }
  if (status === 'doing') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-doing">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 6.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-todo">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

/** Due date with a calendar icon, colored by urgency. Renders nothing without a date. */
export function DueDate({ item, className = '' }: { item: Item; className?: string }) {
  if (!item.due) return null
  const tone = dueTone(item.due, item.status === 'done')
  const color = { normal: 'text-due', soon: 'text-due-soon', overdue: 'text-overdue' }[tone]
  return (
    <span className={`flex shrink-0 items-center gap-1 text-meta font-normal ${color} ${className}`}>
      <Calendar size={12} strokeWidth={2} aria-hidden="true" />
      {dueLabel(item.due)}
    </span>
  )
}

/** Thin progress bar. */
export function Progress({ done, total, className = '' }: { done: number; total: number; className?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <span aria-hidden="true" className={`flex h-[3px] overflow-hidden rounded-full bg-track ${className}`}>
      <span className="rounded-full bg-accent transition-[width] duration-300 ease-snappy" style={{ width: `${pct}%` }} />
    </span>
  )
}
