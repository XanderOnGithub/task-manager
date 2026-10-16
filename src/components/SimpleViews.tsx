// Read-only Unsorted and Docs views, so those sections aren't empty yet.
// The real Unsorted flow (Create as → destination → Undo) is M3; the notes
// editor is M6.

import { FileText } from 'lucide-react'
import { childrenOf, type Item, type UnsortedEntry } from '../lib/api'
import { icon } from '../lib/items'
import { Panel, PanelHeader } from './ui'

export function UnsortedView({ entries }: { entries: UnsortedEntry[] }) {
  return (
    <Panel label="Unsorted" className="flex-1">
      <PanelHeader>
        <span className="flex-1">Unsorted</span>
      </PanelHeader>
      <div className="flex flex-1 justify-center overflow-y-auto px-7 py-8">
        <div className="flex w-full max-w-[680px] flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-title">Unsorted</h1>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-badge px-2 text-[14px] font-semibold text-fg-2">
              {entries.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={`${entry.line}:${entry.raw}`} className="flex h-10 items-center gap-2.5 rounded-[10px] px-3">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-fg-3" />
                <span className="flex-1 truncate text-[14px]">{entry.text}</span>
                {entry.added && <span className="text-meta font-normal text-fg-3">{timeLabel(entry.added)}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  )
}

export function DocsView({ items }: { items: Item[] }) {
  return (
    <Panel label="Docs" className="flex-1">
      <PanelHeader>
        <span className="flex-1">Docs</span>
      </PanelHeader>
      <div className="flex-1 overflow-y-auto px-7 py-6">
        <NoteTree items={items} parent={null} depth={0} />
      </div>
    </Panel>
  )
}

function NoteTree({ items, parent, depth }: { items: Item[]; parent: string | null; depth: number }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {childrenOf(items, parent, true).map((note) => (
        <li key={note.id}>
          <div className="flex h-row items-center gap-2 rounded-row px-2" style={{ paddingLeft: 8 + depth * 20 }}>
            <FileText {...icon} className="text-fg-2" />
            {note.title}
          </div>
          {note.isFolder && <NoteTree items={items} parent={note.id} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

/** "10:42 PM" today, "Yesterday", otherwise "Oct 12". */
function timeLabel(stamp: string): string {
  const [date, time] = stamp.split(' ')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const when = new Date(y, m - 1, d, hh, mm)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.round((startOfToday.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000)
  if (days === 0) return when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
