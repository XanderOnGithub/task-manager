// "Waiting on Pick tile": shown on a task row or card while a task it depends on is open.
// Rows show just the lock (the words would push the milestone chip out); the
// full text is its tooltip and what a screen reader hears. Board cards have
// room for the words.

import { Lock } from 'lucide-react'
import type { Item } from '../../platform/api'
import { useOpenBlockers } from '../../app/blockedStore'
import { waitingText } from '../../domain/blocked'
import { useVocab } from '../../domain/vocab'

export function BlockedMark({ task, iconOnly = false, className = '' }: { task: Item; iconOnly?: boolean; className?: string }) {
  const titles = useOpenBlockers(task)
  useVocab() // redraw when Formal mode changes the wording
  if (titles.length === 0 || task.status === 'done') return null
  const text = waitingText(titles)
  return (
    <span title={text} className={`flex min-w-0 shrink-0 items-center gap-1 text-meta font-normal text-fg-3 ${className}`}>
      <Lock size={12} strokeWidth={2} aria-hidden="true" />
      <span className={iconOnly ? 'sr-only' : 'max-w-[12rem] truncate'}>{text}</span>
    </span>
  )
}
