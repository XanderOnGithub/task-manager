// The middle panel for tasks: everything, an area, a project or a milestone,
// as a list or as a board grouped by status (Board.tsx).
// - Everything (scope null, the "Tasks" overview): every area with its
//   projects and their open tasks (AreaList.tsx per area).
// - Area: its projects with their open tasks (AreaList.tsx), then its pages.
// - Project: milestones holding tasks, or loose tasks (ProjectList.tsx), then
//   its pages.
// - Milestone: its tasks (ProjectList.tsx with the milestone as container).

import { useState } from 'react'
import { Calendar, Flag, List, Plus, SquareKanban } from 'lucide-react'
import { type Item, type ProjectStatus } from '../../platform/api'
import { childrenOf, statusLabel, taskCounts, trailOf, itemById } from '../../domain/items'
import { useVocab } from '../../domain/vocab'
import { AreaList } from './AreaList'
import { dueLabel } from '../../domain/dates'
import type { Actions } from '../../app/useActions'
import { useAddRequest, useRenameRequest } from '../../app/requests'
import { Board } from './Board'
import { EditableTitle, Menu, Segmented } from '../../shared/controls'
import { BodyEditor } from '../editor/BodyEditor'
import { itemMenu } from '../../shared/itemMenu'
import { OwnerHeading, PageSection } from '../pages/Pages'
import { ProjectList } from './ProjectList'
import { MilestoneTable } from './MilestoneTable'
import { Panel, PanelHeader } from '../../shared/ui'

/** List, Board, or Milestones (a table of the milestones inside, for project-level planning). */
export type Layout = 'list' | 'board' | 'milestones'

interface Props {
  items: Item[]
  /** The area, project or milestone being shown. null = everything (the Tasks overview). */
  scope: Item | null
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
  if (!props.scope) return <EverythingView {...props} />
  return <OneScopeView {...props} scope={props.scope} />
}

function OneScopeView(props: Props & { scope: Item }) {
  const { items, scope, layout, onLayout, selectedId, onSelect, onCycleStatus, onOpen, actions } = props
  const trail = trailOf(items, scope.id).slice(0, -1)
  const milestones = scope.kind === 'project' ? childrenOf(items, scope.id).filter((c) => c.kind === 'milestone') : []
  const { done, total } = taskCounts(items, scope.id)
  const [renaming, setRenaming] = useState(0)
  const words = useVocab()
  useRenameRequest(scope.id, () => {
    onLayout('list') // the title is edited in the List view
    setRenaming((n) => n + 1)
  })
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // A milestone has no milestones inside: its List view stands in.
  const shown: Layout = scope.kind === 'milestone' && layout === 'milestones' ? 'list' : layout

  // "+ Task" adds to the selected milestone (or the selected task's), else the first open one.
  const selected = selectedId ? itemById(items, selectedId) : undefined
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

  // "New …" from the right-click menu: focus the matching "Add a …" field.
  useAddRequest(scope.id, (what) => {
    if (what === 'task' || what === 'project') return addTask()
    onLayout('list')
    const field = what === 'milestone' ? `add-milestone-${scope.id}` : `add-page-${scope.id}`
    requestAnimationFrame(() => document.getElementById(field)?.focus())
  })

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Panel label={words.Noun(scope.kind)} className="flex-1">
      <PanelHeader>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-fg-3">
          {trail.map((parent) => (
            <span key={parent.id} className="flex min-w-0 items-center gap-1.5 @max-[34rem]/header:hidden">
              <button onClick={() => onOpen(parent.id)} className="truncate transition-colors duration-100 hover:text-fg-2">
                {parent.title}
              </button>
              <span aria-hidden="true">/</span>
            </span>
          ))}
          <span className="truncate text-fg">{scope.title}</span>
        </nav>
        <LayoutSwitch layout={shown} onLayout={onLayout} milestones={scope.kind !== 'milestone'} />
        {scope.kind === 'project' && (
          <Menu
            label={`${words.Noun('project')} status: ${statusLabel(scope.status)}`}
            trigger={
              <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-raised px-2.5 text-meta whitespace-nowrap text-fg-2 transition-colors duration-100 hover:text-fg">
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
          title={`Add ${words.a(scope.kind === 'area' ? 'project' : 'task')}`}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-row bg-accent px-3 font-medium text-on-accent transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.97] @max-[34rem]/header:px-2"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          <span className="@max-[34rem]/header:sr-only">{words.Noun(scope.kind === 'area' ? 'project' : 'task')}</span>
        </button>
        <Menu items={itemMenu(scope, actions, () => setRenaming((n) => n + 1))} />
      </PanelHeader>

      {shown === 'milestones' ? (
        <MilestoneTable items={items} scope={scope} title={scope.title} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} />
      ) : shown === 'list' ? (
        <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6 max-md:px-4">
          <div className="flex flex-col gap-2">
            <EditableTitle
              key={`${scope.id}:${renaming}`}
              editing={renaming > 0}
              value={scope.title}
              onSave={(title) => actions.rename(scope, title)}
              className="w-fit text-title"
              heading
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

          {scope.kind !== 'milestone' && <PageSection items={items} owner={scope} onOpen={onOpen} actions={actions} />}
        </div>
      ) : (
        <>
          {/* The board has no title of its own; the page still needs its heading. */}
          <h1 className="sr-only">{scope.title}</h1>
          <Board
            key={scope.id}
            items={items}
            scope={scope}
            selectedId={selectedId}
            onSelect={onSelect}
            onCycleStatus={onCycleStatus}
            actions={actions}
          />
        </>
      )}
    </Panel>
  )
}

/** List / Board / Milestones, the same switch on every task view. */
function LayoutSwitch({ layout, onLayout, milestones }: { layout: Layout; onLayout: (layout: Layout) => void; milestones: boolean }) {
  const words = useVocab()
  return (
    <Segmented<Layout>
      label="View"
      size="sm"
      value={layout}
      onChange={onLayout}
      options={[
        { value: 'list', label: 'List', icon: <List size={13} strokeWidth={2} aria-hidden="true" /> },
        { value: 'board', label: 'Board', icon: <SquareKanban size={13} strokeWidth={2} aria-hidden="true" /> },
        ...(milestones
          ? [{ value: 'milestones' as const, label: words.Nouns('milestone'), icon: <Flag size={13} strokeWidth={2} aria-hidden="true" /> }]
          : []),
      ]}
    />
  )
}

/**
 * The Tasks overview: every area, each with its projects (progress and open
 * tasks) as in an area's List view; or every task on one Board.
 */
function EverythingView({ items, layout, onLayout, selectedId, onSelect, onCycleStatus, onOpen, actions }: Props) {
  const areas = childrenOf(items, null)
  const projects = areas.flatMap((a) => childrenOf(items, a.id))
  const { done, total } = taskCounts(items, null)
  const words = useVocab()

  return (
    <Panel label={words.Nouns('task')} className="flex-1">
      <PanelHeader>
        <span className="flex-1 truncate text-fg">{words.Nouns('task')}</span>
        <LayoutSwitch layout={layout} onLayout={onLayout} milestones />
      </PanelHeader>

      {layout === 'milestones' ? (
        <MilestoneTable items={items} scope={null} title={words.Nouns('task')} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} />
      ) : layout === 'list' ? (
        <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6 max-md:px-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-title">{words.Nouns('task')}</h1>
            <div className="flex items-center gap-3.5 text-meta font-normal text-fg-3">
              <span>{words.count(projects.length, 'project')}</span>
              {total > 0 && <span>{`${done} of ${total} done`}</span>}
            </div>
          </div>
          {areas.map((area) => (
            <section key={area.id} className="flex flex-col gap-1.5">
              <OwnerHeading owner={area} onOpen={onOpen} />
              <AreaList
                items={items}
                area={area}
                selectedId={selectedId}
                onSelect={onSelect}
                onCycleStatus={onCycleStatus}
                onOpen={onOpen}
                actions={actions}
                showAdd={false}
              />
            </section>
          ))}
          {areas.length === 0 && <p className="text-fg-3">{`Add ${words.a('area')} to start, like Home or School.`}</p>}
        </div>
      ) : (
        <>
          <h1 className="sr-only">{words.Nouns('task')}</h1>
          <Board
            items={items}
            scope={null}
            selectedId={selectedId}
            onSelect={onSelect}
            onCycleStatus={onCycleStatus}
            actions={actions}
          />
        </>
      )}
    </Panel>
  )
}
