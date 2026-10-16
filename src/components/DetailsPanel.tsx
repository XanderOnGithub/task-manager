// The right panel: details of the selected task or milestone, all editable.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { childrenOf, MILESTONE_COLORS, type Item, type MilestoneColor, type Status } from '../lib/api'
import { shortDate } from '../lib/dates'
import { statusLabel } from '../lib/items'
import type { Actions } from '../lib/useActions'
import { BodyEditor, DateField, EditableTitle, InlineAdd, Menu, Segmented } from './controls'
import { itemMenu } from './itemMenu'
import { MilestoneChip, Panel, PanelHeader, Progress, SectionLabel, StatusIcon, TaskTitle } from './ui'

interface Props {
  items: Item[]
  item: Item
  parent: Item | undefined
  onSelect: (id: string | null) => void
  actions: Actions
}

export function DetailsPanel({ items, item, parent, onSelect, actions }: Props) {
  const [renaming, setRenaming] = useState(0)
  const isMilestone = item.kind === 'milestone'
  const tasks = isMilestone ? childrenOf(items, item.id) : []
  const done = tasks.filter((t) => t.status === 'done').length
  const statuses: Status[] = isMilestone ? ['open', 'done'] : ['todo', 'doing', 'done']

  return (
    <Panel label={isMilestone ? 'Milestone details' : 'Task details'} className="h-full w-details shrink-0">
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
        <Menu items={itemMenu(item, actions, () => setRenaming((n) => n + 1))} />
        <button
          onClick={() => onSelect(null)}
          aria-label="Close details"
          title="Close"
          className="-mr-1 flex rounded-md p-1.5 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg-2"
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </PanelHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 pt-5 pb-4">
        <EditableTitle
          key={`${item.id}:${renaming}`}
          editing={renaming > 0}
          value={item.title}
          onSave={(title) => actions.rename(item, title)}
          className="text-[18px] leading-6 font-semibold tracking-tight"
        />

        <dl className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-y-2.5 text-[12.5px]">
          <Field label="Status">
            <Segmented<Status>
              label="Status"
              size="sm"
              value={item.status}
              onChange={(status) => void actions.setStatus(item, status)}
              options={statuses.map((s) => ({ value: s, label: statusLabel(s) }))}
            />
          </Field>

          {!isMilestone && parent?.kind === 'milestone' && (
            <Field label="Milestone">
              <button onClick={() => onSelect(parent.id)} className="flex" title="Open milestone">
                <MilestoneChip title={parent.title} color={parent.color} />
              </button>
            </Field>
          )}

          <Field label="Due">
            <DateField label="Due date" value={item.due} onChange={(due) => void actions.setDue(item, due)} />
          </Field>

          {isMilestone && (
            <>
              <Field label="Color">
                <ColorPicker value={item.color} onChange={(color) => void actions.setColor(item, color)} />
              </Field>
              <Field label="Progress">
                <span className="flex items-center gap-2">
                  <Progress done={done} total={tasks.length} className="h-1 flex-1" />
                  <span className="text-fg-2">{`${done} of ${tasks.length}`}</span>
                </span>
              </Field>
            </>
          )}

          {!isMilestone && item.created && <Field label="Created">{shortDate(item.created)}</Field>}
        </dl>

        <div className="h-px shrink-0 bg-border" />

        <BodyEditor item={item} onSave={(body) => actions.writeBody(item, body)} placeholder="Add a description" />

        {isMilestone && (
          <div className="flex flex-col gap-1">
            <SectionLabel className="pb-1">Tasks</SectionLabel>
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onSelect(task.id)}
                className="flex h-[30px] items-center gap-2.5 rounded-control px-1.5 text-left transition-colors duration-100 hover:bg-hover"
              >
                <StatusIcon status={task.status} size={15} />
                <TaskTitle title={task.title} done={task.status === 'done'} className="text-[12.5px]" />
              </button>
            ))}
            <InlineAdd label="Add a task" onAdd={(title) => actions.create('task', item.id, title)} />
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

function ColorPicker({ value, onChange }: { value: MilestoneColor | null; onChange: (c: MilestoneColor) => void }) {
  return (
    <span role="radiogroup" aria-label="Milestone color" className="flex gap-[7px]">
      {MILESTONE_COLORS.map((color) => {
        const on = color === value
        const name = color.replace('-', ' ')
        return (
          <button
            key={color}
            role="radio"
            aria-checked={on}
            aria-label={name}
            title={name}
            onClick={() => onChange(color)}
            style={{ '--ms': `var(--color-ms-${color})` } as CSSProperties}
            className={`size-[18px] rounded-[5px] border border-[color-mix(in_srgb,var(--ms)_70%,transparent)] bg-[color-mix(in_srgb,var(--ms)_30%,transparent)] transition-transform duration-100 ease-pop hover:scale-110 ${
              on ? 'ring-2 ring-(--ms) ring-offset-2 ring-offset-panel' : ''
            }`}
          />
        )
      })}
    </span>
  )
}
