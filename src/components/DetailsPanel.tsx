// The right panel: details of the selected task or milestone.

import type { ReactNode } from 'react'
import { Ellipsis } from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import { useBody } from '../lib/useBody'
import { shortDate } from '../lib/dates'
import { icon, statusLabel } from '../lib/items'
import { DueDate, MilestoneChip, Panel, PanelHeader, Progress, SectionLabel, StatusIcon } from './ui'

interface Props {
  items: Item[]
  item: Item
  parent: Item | undefined
  onSelect: (id: string) => void
}

export function DetailsPanel({ items, item, parent, onSelect }: Props) {
  const body = useBody(item.id, item)
  const isMilestone = item.kind === 'milestone'
  const tasks = isMilestone ? childrenOf(items, item.id) : []
  const done = tasks.filter((t) => t.status === 'done').length

  return (
    <Panel label={isMilestone ? 'Milestone details' : 'Task details'} className="w-details shrink-0">
      <PanelHeader>
        {isMilestone ? (
          <SectionLabel>Milestone</SectionLabel>
        ) : (
          <span
            className={`flex h-6 items-center gap-1.5 rounded-full px-2.5 text-meta text-fg ${
              item.status === 'doing' ? 'bg-doing-soft' : 'bg-raised'
            }`}
          >
            <StatusIcon status={item.status} size={13} />
            {statusLabel(item.status)}
          </span>
        )}
        <span className="flex-1" />
        <button
          aria-label="More actions"
          className="flex rounded-md p-1.5 text-fg-3 transition-colors duration-150 hover:bg-hover hover:text-fg-2"
        >
          <Ellipsis {...icon} strokeWidth={2} />
        </button>
      </PanelHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 pt-5 pb-4">
        <h2 className="text-heading text-[18px] leading-6 tracking-tight">{item.title}</h2>

        <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-y-2.5 text-[12.5px]">
          {isMilestone ? (
            <>
              <Field label="Status">
                <span className="flex items-center gap-1.5">
                  <StatusIcon status={item.status} size={13} />
                  {statusLabel(item.status)}
                </span>
              </Field>
              {item.due && (
                <Field label="Due">
                  <DueDate item={item} className="text-[12.5px]" />
                </Field>
              )}
              <Field label="Color">
                <MilestoneChip title={colorName(item.color ?? 'sand')} color={item.color} />
              </Field>
              <Field label="Progress">
                <span className="flex items-center gap-2">
                  <Progress done={done} total={tasks.length} className="h-1 flex-1" />
                  <span className="text-fg-2">{`${done} of ${tasks.length}`}</span>
                </span>
              </Field>
            </>
          ) : (
            <>
              {parent?.kind === 'milestone' && (
                <Field label="Milestone">
                  <span className="flex">
                    <MilestoneChip title={parent.title} color={parent.color} />
                  </span>
                </Field>
              )}
              {item.due && (
                <Field label="Due">
                  <DueDate item={item} className="text-[12.5px]" />
                </Field>
              )}
              {item.created && <Field label="Created">{shortDate(item.created)}</Field>}
            </>
          )}
        </dl>

        <div className="h-px shrink-0 bg-border" />

        {/* Plain text for now. A markdown preview comes with the notes editor (M6). */}
        {body ? (
          <p className="leading-relaxed whitespace-pre-wrap text-fg-2 select-text">{body.trim()}</p>
        ) : (
          <p className="text-fg-3">No description</p>
        )}

        {isMilestone && tasks.length > 0 && (
          <div className="flex flex-col gap-1">
            <SectionLabel className="pb-1">Tasks</SectionLabel>
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onSelect(task.id)}
                className="flex h-[30px] items-center gap-2.5 rounded-control px-1.5 text-left transition-colors duration-150 hover:bg-hover"
              >
                <StatusIcon status={task.status} size={15} />
                <span className={`flex-1 truncate text-[12.5px] ${task.status === 'done' ? 'text-fg-3 line-through' : ''}`}>
                  {task.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-3">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </>
  )
}

/** "dusty-blue" → "Dusty blue" */
function colorName(color: string): string {
  const words = color.replace('-', ' ')
  return words[0].toUpperCase() + words.slice(1)
}
