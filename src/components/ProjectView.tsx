// The middle panel in Tasks: one project, as a list grouped by milestone
// (ProjectList.tsx) or as a board grouped by status (Board.tsx).

import { useState } from 'react'
import { Calendar, List, Plus, SquareKanban } from 'lucide-react'
import { childrenOf, type Item, type ProjectStatus } from '../lib/api'
import { dueLabel } from '../lib/dates'
import { statusLabel, taskCounts } from '../lib/items'
import type { Actions } from '../lib/useActions'
import { Board } from './Board'
import { BodyEditor, EditableTitle, Menu, Segmented } from './controls'
import { itemMenu } from './itemMenu'
import { ProjectList } from './ProjectList'
import { Panel, PanelHeader } from './ui'

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
  const milestones = childrenOf(items, project.id).filter((c) => c.kind === 'milestone')
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
          className="flex h-7 items-center gap-1.5 rounded-row bg-accent px-3 font-medium text-on-accent transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97]"
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

          <ProjectList
            items={items}
            project={project}
            collapsed={collapsed}
            onToggle={toggle}
            selectedId={selectedId}
            onSelect={onSelect}
            onCycleStatus={onCycleStatus}
            actions={actions}
          />
        </div>
      ) : (
        <Board
          items={items}
          project={project}
          selectedId={selectedId}
          onSelect={onSelect}
          onCycleStatus={onCycleStatus}
          actions={actions}
        />
      )}
    </Panel>
  )
}
