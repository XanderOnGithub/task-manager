// The middle panel in Tasks: one project, as a list grouped by milestone or as
// a board grouped by status.

import { useState } from 'react'
import { Calendar, ChevronDown, ChevronRight, List, Plus, SquareKanban } from 'lucide-react'
import { childrenOf, type Item, type ProjectStatus, type TaskStatus } from '../lib/api'
import { dueLabel } from '../lib/dates'
import { statusLabel, taskCounts } from '../lib/items'
import type { Actions } from '../lib/useActions'
import { BodyEditor, EditableTitle, InlineAdd, Menu, Segmented } from './controls'
import { itemMenu } from './itemMenu'
import { DueDate, MilestoneChip, Panel, PanelHeader, Progress, StatusIcon } from './ui'

export type ProjectLayout = 'list' | 'board'

interface Props {
  items: Item[]
  project: Item
  area: Item | undefined
  layout: ProjectLayout
  onLayout: (layout: ProjectLayout) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCycleStatus: (task: Item) => void
  actions: Actions
}

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'done', 'dropped']

export function ProjectView(props: Props) {
  const { items, project, area, layout, onLayout, selectedId, onSelect, onCycleStatus, actions } = props
  const children = childrenOf(items, project.id)
  const milestones = children.filter((c) => c.kind === 'milestone')
  const looseTasks = children.filter((c) => c.kind === 'task')
  const { done, total } = taskCounts(items, project.id)
  const [renaming, setRenaming] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // "+ Task" adds to the selected milestone (or the selected task's), else the first open one.
  const selected = selectedId ? items.find((i) => i.id === selectedId) : undefined
  const targetMilestone =
    (selected?.kind === 'milestone' && selected.parent === project.id ? selected : undefined) ??
    (selected?.kind === 'task' ? milestones.find((m) => m.id === selected.parent) : undefined) ??
    milestones.find((m) => m.status !== 'done') ??
    milestones[0]

  const addTask = () => {
    const target = targetMilestone ?? project
    onLayout('list')
    setCollapsed((c) => {
      const next = new Set(c)
      next.delete(target.id)
      return next
    })
    requestAnimationFrame(() => document.getElementById(`add-task-${target.id}`)?.focus())
  }

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Panel label="Project" className="flex-1">
      <PanelHeader>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-fg-3">
          {area && <span className="truncate">{area.title}</span>}
          {area && <span aria-hidden="true">/</span>}
          <span className="truncate text-fg">{project.title}</span>
        </div>
        <Segmented<ProjectLayout>
          label="View"
          size="sm"
          value={layout}
          onChange={onLayout}
          options={[
            { value: 'list', label: 'List', icon: <List size={13} strokeWidth={2} aria-hidden="true" /> },
            { value: 'board', label: 'Board', icon: <SquareKanban size={13} strokeWidth={2} aria-hidden="true" /> },
          ]}
        />
        <Menu
          label="Project status"
          trigger={
            <span className="flex h-6 items-center gap-1.5 rounded-full bg-raised px-2.5 text-meta text-fg-2 transition-colors duration-150 hover:text-fg">
              <span className={`size-[7px] rounded-full ${project.status === 'active' ? 'bg-accent' : 'bg-fg-3'}`} />
              {statusLabel(project.status)}
            </span>
          }
          items={PROJECT_STATUSES.map((status) => ({
            label: statusLabel(status),
            onSelect: () => void actions.setStatus(project, status),
          }))}
        />
        <button
          onClick={addTask}
          className="flex h-7 items-center gap-1.5 rounded-row bg-accent px-3 font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          Task
        </button>
        <Menu items={itemMenu(project, actions, () => setRenaming((n) => n + 1))} />
      </PanelHeader>

      {layout === 'list' ? (
        <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6">
          <div className="flex flex-col gap-2">
            <EditableTitle
              key={`${project.id}:${renaming}`}
              editing={renaming > 0}
              value={project.title}
              onSave={(title) => actions.rename(project, title)}
              className="w-fit text-title"
            />
            <BodyEditor item={project} onSave={(body) => actions.writeBody(project, body)} placeholder="Add a description" />
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

          {milestones.map((milestone) => (
            <MilestoneGroup
              key={milestone.id}
              milestone={milestone}
              tasks={childrenOf(items, milestone.id)}
              collapsed={collapsed.has(milestone.id)}
              onToggle={() => toggle(milestone.id)}
              selectedId={selectedId}
              onSelect={onSelect}
              onCycleStatus={onCycleStatus}
              actions={actions}
            />
          ))}

          {milestones.length === 0 && (
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
              <InlineAdd
                id={`add-task-${project.id}`}
                label="Add a task"
                onAdd={(title) => actions.create('task', project.id, title)}
              />
            </div>
          )}

          {/* A project holds milestones or loose tasks, never both. */}
          {looseTasks.length === 0 && (
            <InlineAdd
              label="Add a milestone"
              onAdd={(title) => actions.create('milestone', project.id, title)}
              className={milestones.length === 0 ? '-mt-5' : ''}
            />
          )}
        </div>
      ) : (
        <Board items={items} project={project} selectedId={selectedId} onSelect={onSelect} onCycleStatus={onCycleStatus} />
      )}
    </Panel>
  )
}

function MilestoneGroup({
  milestone,
  tasks,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
  onCycleStatus,
  actions,
}: {
  milestone: Item
  tasks: Item[]
  collapsed: boolean
  onToggle: () => void
  selectedId: string | null
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
  actions: Actions
}) {
  const done = tasks.filter((t) => t.status === 'done').length
  const selected = milestone.id === selectedId
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={`flex h-row items-center gap-1 rounded-row pr-2 pl-0.5 transition-colors duration-150 ${
          selected ? 'bg-selected' : 'hover:bg-hover'
        }`}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? `Expand ${milestone.title}` : `Collapse ${milestone.title}`}
          aria-expanded={!collapsed}
          className="flex rounded-md p-1 text-fg-3 hover:text-fg-2"
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
        <button onClick={() => onSelect(milestone.id)} className="flex h-full flex-1 items-center gap-2 text-left">
          <MilestoneChip title={milestone.title} color={milestone.color} header />
          {milestone.status === 'done' && <StatusIcon status="done" size={14} />}
          <span className="text-meta font-normal text-fg-3">{`${done} / ${tasks.length}`}</span>
          <DueDate item={milestone} />
          <Progress done={done} total={tasks.length} className="ml-1.5 max-w-[120px] flex-1" />
        </button>
      </div>
      {!collapsed && (
        <>
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
          <InlineAdd
            id={`add-task-${milestone.id}`}
            label="Add a task"
            onAdd={(title) => actions.create('task', milestone.id, title)}
            className="ml-[22px]"
          />
        </>
      )}
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
        title="Change status"
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
            <div className="flex h-[26px] shrink-0 items-center gap-2 px-1">
              <span className={`size-2 rounded-full ${column.dot}`} />
              <span className="font-semibold">{column.label}</span>
              <span className="text-meta font-normal text-fg-3">{cards.length}</span>
            </div>
            {cards.map(({ task, milestone }) => (
              <div
                key={task.id}
                className={`flex shrink-0 flex-col gap-2.5 rounded-card border bg-card p-3 shadow-card transition-colors duration-150 ${
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
                {(milestone || task.due) && (
                  <div className="flex items-center gap-2">
                    {milestone && <MilestoneChip title={milestone.title} color={milestone.color} />}
                    <DueDate item={task} className="ml-auto" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
