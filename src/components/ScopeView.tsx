// The middle panel in Tasks: an area, project or milestone, as a list or as a
// board grouped by status (Board.tsx).
// - Area: its projects with their open tasks (AreaList.tsx).
// - Project: milestones holding tasks, or loose tasks (ProjectList.tsx).
// - Milestone: its tasks (ProjectList.tsx with the milestone as container).

import { useState } from 'react'
import { Calendar, List, Plus, SquareKanban } from 'lucide-react'
import { childrenOf, type Item, type ProjectStatus } from '../lib/api'
import { AreaList } from './AreaList'
import { dueLabel } from '../lib/dates'
import { statusLabel, taskCounts, trailOf } from '../lib/items'
import type { Actions } from '../lib/useActions'
import { Board } from './Board'
import { BodyEditor, EditableTitle, Menu, Segmented } from './controls'
import { itemMenu } from './itemMenu'
import { ProjectList } from './ProjectList'
import { Panel, PanelHeader } from './ui'

export type Layout = 'list' | 'board'

interface Props {
  items: Item[]
  /** The area, project or milestone being shown. */
  scope: Item
  layout: Layout
  onLayout: (layout: Layout) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCycleStatus: (task: Item) => void
  /** Opens another area, project or milestone (breadcrumb, "open" buttons). */
  onOpen: (id: string) => void
  actions: Actions
}

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'done', 'dropped']

export function ScopeView(props: Props) {
  const { items, scope, layout, onLayout, selectedId, onSelect, onCycleStatus, onOpen, actions } = props
  const trail = trailOf(items, scope.id).slice(0, -1)
  const milestones = scope.kind === 'project' ? childrenOf(items, scope.id).filter((c) => c.kind === 'milestone') : []
  const { done, total } = taskCounts(items, scope.id)
  const [renaming, setRenaming] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // "+ Task" adds to the selected milestone (or the selected task's), else the first open one.
  const selected = selectedId ? items.find((i) => i.id === selectedId) : undefined
  const targetMilestone =
    (selected?.kind === 'milestone' && selected.parent === scope.id ? selected : undefined) ??
    (selected?.kind === 'task' ? milestones.find((m) => m.id === selected.parent) : undefined) ??
    milestones.find((m) => m.status !== 'done') ??
    milestones[0]

  const addTask = () => {
    if (scope.kind === 'area') {
      onLayout('list')
      requestAnimationFrame(() => document.getElementById(`add-project-${scope.id}`)?.focus())
      return
    }
    const target = targetMilestone ?? scope
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
    <Panel label={scope.kind[0].toUpperCase() + scope.kind.slice(1)} className="flex-1">
      <PanelHeader>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-fg-3">
          {trail.map((parent) => (
            <span key={parent.id} className="flex min-w-0 items-center gap-1.5">
              <button onClick={() => onOpen(parent.id)} className="truncate transition-colors duration-100 hover:text-fg-2">
                {parent.title}
              </button>
              <span aria-hidden="true">/</span>
            </span>
          ))}
          <span className="truncate text-fg">{scope.title}</span>
        </nav>
        <Segmented<Layout>
          label="View"
          size="sm"
          value={layout}
          onChange={onLayout}
          options={[
            { value: 'list', label: 'List', icon: <List size={13} strokeWidth={2} aria-hidden="true" /> },
            { value: 'board', label: 'Board', icon: <SquareKanban size={13} strokeWidth={2} aria-hidden="true" /> },
          ]}
        />
        {scope.kind === 'project' && (
          <Menu
            label="Project status"
            trigger={
              <span className="flex h-6 items-center gap-1.5 rounded-full bg-raised px-2.5 text-meta text-fg-2 transition-colors duration-100 hover:text-fg">
                <span className={`size-[7px] rounded-full ${scope.status === 'active' ? 'bg-accent' : 'bg-fg-3'}`} />
                {statusLabel(scope.status)}
              </span>
            }
            items={PROJECT_STATUSES.map((status) => ({
              label: statusLabel(status),
              onSelect: () => void actions.setStatus(scope, status),
            }))}
          />
        )}
        <button
          onClick={addTask}
          className="flex h-7 items-center gap-1.5 rounded-row bg-accent px-3 font-medium text-on-accent transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.97]"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          {scope.kind === 'area' ? 'Project' : 'Task'}
        </button>
        <Menu items={itemMenu(scope, actions, () => setRenaming((n) => n + 1))} />
      </PanelHeader>

      {layout === 'list' ? (
        <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6">
          <div className="flex flex-col gap-2">
            <EditableTitle
              key={`${scope.id}:${renaming}`}
              editing={renaming > 0}
              value={scope.title}
              onSave={(title) => actions.rename(scope, title)}
              className="w-fit text-title"
            />
            <BodyEditor item={scope} onSave={(body) => actions.writeBody(scope, body)} placeholder="Add a description" />
            <div className="flex items-center gap-3.5 text-meta font-normal text-fg-3">
              {scope.due && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} strokeWidth={1.75} aria-hidden="true" />
                  Due {dueLabel(scope.due)}
                </span>
              )}
              {total > 0 && <span>{`${done} of ${total} done`}</span>}
            </div>
          </div>

          {scope.kind === 'area' ? (
            <AreaList
              items={items}
              area={scope}
              selectedId={selectedId}
              onSelect={onSelect}
              onCycleStatus={onCycleStatus}
              onOpen={onOpen}
              actions={actions}
            />
          ) : (
            <ProjectList
              key={scope.id}
              items={items}
              container={scope}
              collapsed={collapsed}
              onToggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
              onCycleStatus={onCycleStatus}
              onOpen={onOpen}
              actions={actions}
            />
          )}
        </div>
      ) : (
        <Board
          key={scope.id}
          items={items}
          scope={scope}
          selectedId={selectedId}
          onSelect={onSelect}
          onCycleStatus={onCycleStatus}
          actions={actions}
        />
      )}
    </Panel>
  )
}
