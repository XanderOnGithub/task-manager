// "Waiting on Pick tile": shown on a task row or card while a task it depends on is open.

import { Lock } from 'lucide-react'
import type { Item } from '../../platform/api'
import { useOpenBlockers } from '../../app/blockedStore'
import { waitingText } from '../../domain/blocked'

export function BlockedMark({ task, className = '' }: { task: Item; className?: string }) {
  const titles = useOpenBlockers(task)
  if (titles.length === 0 || task.status === 'done') return null
  const text = waitingText(titles)
  return (
    <span title={text} className={`flex min-w-0 shrink-0 items-center gap-1 text-meta font-normal text-fg-3 ${className}`}>
      <Lock size={12} strokeWidth={2} aria-hidden="true" />
      <span className="max-w-[12rem] truncate">{text}</span>
    </span>
  )
}
