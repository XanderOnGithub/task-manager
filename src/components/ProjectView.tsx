// The middle panel in Tasks: one project, as a list grouped by milestone or as
// a board grouped by status.

import { ChevronDown, Calendar, List, Plus, SquareKanban } from 'lucide-react'
import { childrenOf, type Item, type TaskStatus } from '../lib/api'
import { dueLabel } from '../lib/dates'
import { statusLabel, taskCounts } from '../lib/items'
import { useBody } from '../lib/useBody'
import { DueDate, MilestoneChip, Panel, PanelHeader, Progress, StatusIcon } from './ui'

export type ProjectLayout = 'list' | 'board'

interface Props {
  items: Item[]
  project: Item
  area: Item | undefined
  layout: ProjectLayout
  onLayout: (layout: ProjectLayout) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
}

export function ProjectView({ items, project, area, layout, onLayout, selectedId, onSelect, onCycleStatus }: Props) {
  const children = childrenOf(items, project.id)
  const milestones = children.filter((c) => c.kind === 'milestone')
  const looseTasks = children.filter((c) => c.kind === 'task')
  const { done, total } = taskCounts(items, project.id)

  return (
    <Panel label="Project" className="flex-1">
      <PanelHeader>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-fg-3">
          {area && <span className="truncate">{area.title}</span>}
          {area && <span aria-hidden="true">/</span>}
          <span className="truncate text-fg">{project.title}</span>
        </div>
        <LayoutSwitch layout={layout} onLayout={onLayout} />
        <span className="flex h-6 items-center gap-1.5 rounded-full bg-raised px-2.5 text-meta text-fg-2">
          <span className="size-[7px] rounded-full bg-accent" />
          {statusLabel(project.status)}
        </span>
        <button
          disabled
          title="Adding tasks comes in M4"
          className="flex h-7 items-center gap-1.5 rounded-row bg-accent px-3 font-medium text-on-accent disabled:opacity-60"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          Task
        </button>
      </PanelHeader>

      {layout === 'list' ? (
        <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6">
          <ProjectIntro project={project} done={done} total={total} />
          {milestones.map((milestone) => (
            <MilestoneGroup
              key={milestone.id}
              milestone={milestone}
              tasks={childrenOf(items, milestone.id)}
              selectedId={selectedId}
              onSelect={onSelect}
              onCycleStatus={onCycleStatus}
            />
          ))}
          {looseTasks.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {looseTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={task.id === selectedId}
                  onSelect={onSelect}
                  onCycleStatus={onCycleStatus}
                  indent={false}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Board items={items} project={project} selectedId={selectedId} onSelect={onSelect} onCycleStatus={onCycleStatus} />
      )}
    </Panel>
  )
}

function ProjectIntro({ project, done, total }: { project: Item; done: number; total: number }) {
  const description = useBody(project.id, project)?.trim()
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-title">{project.title}</h1>
      {description && <p className="leading-normal whitespace-pre-wrap text-fg-2">{description}</p>}
      <div className="flex items-center gap-3.5 text-meta font-normal text-fg-3">
        {project.due && (
          <span className="flex items-center gap-1.5">
            <Calendar size={13} strokeWidth={1.75} aria-hidden="true" />
            Due {dueLabel(project.due)}
          </span>
        )}
        {total > 0 && <span>{`${done} of ${total} done`}</span>}
      </div>
    </div>
  )
}

function MilestoneGroup({
  milestone,
  tasks,
  selectedId,
  onSelect,
  onCycleStatus,
}: {
  milestone: Item
  tasks: Item[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
}) {
  const done = tasks.filter((t) => t.status === 'done').length
  const selected = milestone.id === selectedId
  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={() => onSelect(milestone.id)}
        className={`flex h-row items-center gap-2 rounded-row pr-2 pl-1.5 text-left transition-colors duration-150 ${
          selected ? 'bg-selected' : 'hover:bg-hover'
        }`}
      >
        <ChevronDown size={14} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
        <MilestoneChip title={milestone.title} color={milestone.color} header />
        <span className="text-meta font-normal text-fg-3">{`${done} / ${tasks.length}`}</span>
        <DueDate item={milestone} />
        <Progress done={done} total={tasks.length} className="ml-1.5 max-w-[120px] flex-1" />
      </button>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          selected={task.id === selectedId}
          onSelect={onSelect}
          onCycleStatus={onCycleStatus}
          indent
        />
      ))}
    </div>
  )
}

function TaskRow({
  task,
  selected,
  onSelect,
  onCycleStatus,
  indent,
}: {
  task: Item
  selected: boolean
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
  indent: boolean
}) {
  const done = task.status === 'done'
  return (
    <div
      className={`group flex h-row items-center gap-2.5 rounded-row pr-2.5 transition-colors duration-150 ${
        indent ? 'pl-7' : 'pl-2.5'
      } ${selected ? 'bg-selected' : 'hover:bg-hover'}`}
    >
      <button
        onClick={() => onCycleStatus(task)}
        aria-label={`Status: ${statusLabel(task.status)}. Change status`}
        className="-m-1 rounded-full p-1 transition-transform duration-150 ease-pop active:scale-90"
      >
        <StatusIcon status={task.status} />
      </button>
      <button
        onClick={() => onSelect(task.id)}
        className={`flex h-full min-w-0 flex-1 items-center gap-2.5 text-left ${done ? 'text-fg-3 line-through' : 'text-fg'}`}
      >
        <span className="flex-1 truncate">{task.title}</span>
        <DueDate item={task} className="no-underline" />
      </button>
    </div>
  )
}

function LayoutSwitch({ layout, onLayout }: { layout: ProjectLayout; onLayout: (l: ProjectLayout) => void }) {
  const options = [
    { value: 'list' as const, label: 'List', Icon: List },
    { value: 'board' as const, label: 'Board', Icon: SquareKanban },
  ]
  return (
    <div role="radiogroup" aria-label="View" className="flex gap-0.5 rounded-row bg-raised p-0.5">
      {options.map(({ value, label, Icon }) => {
        const on = layout === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={on}
            onClick={() => onLayout(value)}
            className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-meta transition-colors duration-150 ${
              on ? 'bg-seg-on text-fg shadow-seg' : 'text-fg-2 hover:text-fg'
            }`}
          >
            <Icon size={13} strokeWidth={2} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'todo', label: 'Todo', dot: 'bg-todo' },
  { status: 'doing', label: 'Doing', dot: 'bg-doing' },
  { status: 'done', label: 'Done', dot: 'bg-done' },
]

function Board({
  items,
  project,
  selectedId,
  onSelect,
  onCycleStatus,
}: {
  items: Item[]
  project: Item
  selectedId: string | null
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
}) {
  // Every task in the project, in list order, with its milestone (if any).
  const tasks: { task: Item; milestone: Item | null }[] = []
  for (const child of childrenOf(items, project.id)) {
    if (child.kind === 'task') tasks.push({ task: child, milestone: null })
    else for (const task of childrenOf(items, child.id)) tasks.push({ task, milestone: child })
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 p-4">
      {COLUMNS.map((column) => {
        const cards = tasks.filter(({ task }) => task.status === column.status)
        return (
          <div key={column.status} className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[10px] bg-column p-2.5">
            <div className="flex h-[26px] items-center gap-2 px-1">
              <span className={`size-2 rounded-full ${column.dot}`} />
              <span className="font-semibold">{column.label}</span>
              <span className="text-meta font-normal text-fg-3">{cards.length}</span>
            </div>
            {cards.map(({ task, milestone }) => (
              <div
                key={task.id}
                className={`flex flex-col gap-2.5 rounded-card border bg-card p-3 shadow-card transition-colors duration-150 ${
                  task.id === selectedId
                    ? 'border-border-strong'
                    : task.status === 'doing'
                      ? 'border-doing/45'
                      : 'border-border'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    onClick={() => onCycleStatus(task)}
                    aria-label={`Status: ${statusLabel(task.status)}. Change status`}
                    className="mt-px rounded-full transition-transform duration-150 ease-pop active:scale-90"
                  >
                    <StatusIcon status={task.status} />
                  </button>
                  <button
                    onClick={() => onSelect(task.id)}
                    className={`flex-1 text-left leading-snug ${task.status === 'done' ? 'text-fg-2' : 'text-fg'}`}
                  >
                    {task.title}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {milestone && <MilestoneChip title={milestone.title} color={milestone.color} />}
                  <DueDate item={task} className="ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
