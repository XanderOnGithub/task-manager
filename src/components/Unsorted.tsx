// Unsorted: raw capture, and sorting each item into the hierarchy.
//
// Flow (see the design canvas, "Sorting an Unsorted item"):
//   1. click an item → only "Create as" shows (Task / Note / Project)
//   2. pick one → a filterable list of where it can go
//   3. pick a destination (or press Enter) → it's filed, a toast offers Undo,
//      and the next item opens so you can keep going.

import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from '../lib/motion'
import { Collapse } from './motion'
import { BookOpen, Folder, FileText, Search, Target, Trash2 } from 'lucide-react'
import { childrenOf, type Item, type Kind, type MilestoneColor, type UnsortedEntry } from '../lib/api'
import type { Actions } from '../lib/useActions'
import { InlineAdd, Segmented } from './controls'
import { MilestoneChip, Panel, PanelHeader, StatusIcon } from './ui'

type FileAs = 'task' | 'note' | 'project'

interface Destination {
  id: string | null
  name: string
  context: string
  kind: Kind | 'docs'
  color?: MilestoneColor | null
}

export function UnsortedView({ entries, items, actions }: { entries: UnsortedEntry[]; items: Item[]; actions: Actions }) {
  // Which entry is open, by its text in the file (stable across reloads).
  const [openRaw, setOpenRaw] = useState<string | null>(null)
  const [fileAs, setFileAs] = useState<FileAs | null>(null)

  const open = (entry: UnsortedEntry | undefined) => {
    setOpenRaw(entry?.raw ?? null)
    setFileAs(null)
  }

  const file = async (entry: UnsortedEntry, kind: FileAs, destination: Destination) => {
    const index = entries.findIndex((e) => e.raw === entry.raw)
    const next = entries[index + 1]
    const id = await actions.fileEntry(entry, kind, { id: destination.id, title: destination.name })
    // Keep going with the next item, keeping the same "Create as" choice.
    if (id !== undefined) {
      setOpenRaw(next?.raw ?? null)
      if (!next) setFileAs(null)
    }
  }

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

          <InlineAdd
            label="Add an item"
            onAdd={(text) => actions.capture(text)}
            className="h-10 border-border! px-3 text-[13.5px]"
          />

          {entries.length === 0 ? (
            <p className="px-3 text-fg-3">Nothing unsorted</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {/* A filed item slides off to the right while its height closes,
                  which pulls the rest of the list up into its place. */}
              <AnimatePresence initial={false}>
              {entries.map((entry) => {
                const isOpen = entry.raw === openRaw
                return (
                  <motion.li
                    key={entry.raw}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto', x: 0 }}
                    exit={{ opacity: 0, x: 40, height: 0, marginTop: -4 }}
                    transition={spring.smooth}
                    className={`flex flex-col overflow-hidden rounded-[10px] border transition-colors duration-100 ${
                      isOpen ? 'border-border-strong bg-field' : 'border-transparent'
                    }`}
                  >
                    <button
                      onClick={() => open(isOpen ? undefined : entry)}
                      aria-expanded={isOpen}
                      className={`flex h-10 items-center gap-2.5 px-3 text-left transition-colors duration-100 ${
                        isOpen ? '' : 'rounded-[10px] hover:bg-hover'
                      }`}
                    >
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fg-3" />
                      <span className="flex-1 truncate text-[14px]">{entry.text}</span>
                      {entry.added && <span className="text-meta font-normal text-fg-3">{timeLabel(entry.added)}</span>}
                    </button>

                    <Collapse open={isOpen}>
                      <div className="flex flex-col gap-3 pr-3 pb-3 pl-7">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[12.5px] text-fg-3">Create as</span>
                          <Segmented<FileAs>
                            label="Create as"
                            value={fileAs}
                            onChange={setFileAs}
                            options={[
                              { value: 'task', label: 'Task', icon: <StatusIcon status="todo" size={13} /> },
                              { value: 'note', label: 'Note', icon: <FileText size={13} strokeWidth={2} aria-hidden="true" /> },
                              { value: 'project', label: 'Project', icon: <Target size={13} strokeWidth={2} aria-hidden="true" /> },
                            ]}
                          />
                          <span className="flex-1" />
                          <button
                            onClick={() => void actions.removeEntry(entry)}
                            aria-label="Delete"
                            title="Delete"
                            className="flex rounded-md p-1.5 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-danger"
                          >
                            <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        </div>
                        {fileAs && (
                          <DestinationPicker
                            key={fileAs}
                            fileAs={fileAs}
                            items={items}
                            onPick={(d) => void file(entry, fileAs, d)}
                            onCancel={() => open(undefined)}
                          />
                        )}
                      </div>
                    </Collapse>
                  </motion.li>
                )
              })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </Panel>
  )
}

const TITLES: Record<FileAs, string> = {
  task: 'Choose a milestone or project',
  note: 'Choose a page',
  project: 'Choose an area',
}

function DestinationPicker({
  fileAs,
  items,
  onPick,
  onCancel,
}: {
  fileAs: FileAs
  items: Item[]
  onPick: (destination: Destination) => void
  onCancel: () => void
}) {
  const [filter, setFilter] = useState('')
  const [highlight, setHighlight] = useState(0)
  const all = useMemo(() => destinations(items, fileAs), [items, fileAs])
  const shown = all.filter((d) => `${d.name} ${d.context}`.toLowerCase().includes(filter.trim().toLowerCase()))
  const active = Math.min(highlight, shown.length - 1)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-fg-3">{TITLES[fileAs]}</span>
        <label className="flex h-[26px] w-[180px] items-center gap-1.5 rounded-control border border-border px-2 text-placeholder focus-within:border-border-strong">
          <Search size={12} strokeWidth={2} aria-hidden="true" />
          <input
            autoFocus
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setHighlight(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight(Math.min(active + 1, shown.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight(Math.max(active - 1, 0))
              } else if (e.key === 'Enter' && shown[active]) {
                onPick(shown[active])
              } else if (e.key === 'Escape') {
                onCancel()
              }
            }}
            placeholder="Filter"
            aria-label="Filter"
            className="min-w-0 flex-1 bg-transparent text-meta font-normal text-fg outline-none placeholder:text-placeholder"
          />
        </label>
      </div>

      <div role="listbox" aria-label={TITLES[fileAs]} className="-ml-1.5 flex max-h-[232px] flex-col gap-px overflow-y-auto">
        {shown.length === 0 && (
          <p className="px-2 py-1.5 text-[12.5px] text-fg-3">
            {all.length === 0 ? emptyMessage(fileAs) : 'No matches'}
          </p>
        )}
        {shown.map((d, i) => (
          <button
            key={d.id ?? 'top'}
            role="option"
            aria-selected={i === active}
            onClick={() => onPick(d)}
            onMouseEnter={() => setHighlight(i)}
            className={`flex h-8 shrink-0 items-center gap-2 rounded-control px-2 text-left ${i === active ? 'bg-selected' : ''}`}
          >
            <DestinationLabel destination={d} />
            <span className="flex-1 truncate text-meta font-normal text-fg-3">{d.context}</span>
            {i === active && <kbd className="font-mono text-label font-normal text-fg-3">↵</kbd>}
          </button>
        ))}
      </div>
    </div>
  )
}

function DestinationLabel({ destination: d }: { destination: Destination }): ReactNode {
  const iconProps = { size: 14, strokeWidth: 1.75, 'aria-hidden': true, className: 'shrink-0 text-fg-2' } as const
  if (d.kind === 'milestone') return <MilestoneChip title={d.name} color={d.color ?? null} />
  const Icon = { project: Target, note: FileText, area: Folder, docs: BookOpen, task: Target }[d.kind]
  return (
    <>
      <Icon {...iconProps} />
      <span className="truncate text-[12.5px]">{d.name}</span>
    </>
  )
}

/** Everything an entry can be filed into, in sidebar order. */
function destinations(items: Item[], fileAs: FileAs): Destination[] {
  const areas = childrenOf(items, null)
  if (fileAs === 'project') {
    return areas.map((a) => {
      const n = childrenOf(items, a.id).length
      return { id: a.id, name: a.title, context: n === 1 ? '1 project' : `${n} projects`, kind: 'area' }
    })
  }
  if (fileAs === 'task') {
    const out: Destination[] = []
    for (const area of areas) {
      for (const project of childrenOf(items, area.id)) {
        if (project.status === 'done' || project.status === 'dropped') continue
        const milestones = childrenOf(items, project.id).filter((c) => c.kind === 'milestone')
        if (milestones.length === 0) {
          out.push({ id: project.id, name: project.title, context: area.title, kind: 'project' })
        }
        for (const m of milestones) {
          if (m.status === 'done') continue
          out.push({ id: m.id, name: m.title, context: project.title, kind: 'milestone', color: m.color })
        }
      }
    }
    return out
  }
  // Notes: top level, then every page in tree order.
  const out: Destination[] = [{ id: null, name: 'Docs', context: 'Top level', kind: 'docs' }]
  const walk = (parent: Item | null) => {
    for (const note of childrenOf(items, parent?.id ?? null, true)) {
      out.push({ id: note.id, name: note.title, context: parent?.title ?? 'Docs', kind: 'note' })
      walk(note)
    }
  }
  walk(null)
  return out
}

function emptyMessage(fileAs: FileAs): string {
  return fileAs === 'project' ? 'Add an area first' : 'Add a project first'
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
