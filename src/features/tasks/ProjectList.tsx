// A project's list (milestones holding tasks, or loose tasks) or a milestone's
// list (its tasks), all draggable.
//
// - Drag a task to reorder it, or into another milestone (it opens a gap there
//   as you cross over). Dropping on a milestone header puts it at the top.
// - Drag a milestone by its header to reorder milestones. While you do, every
//   milestone folds shut so they're easy to move around, then reopens.

import { memo, useCallback, useMemo, type CSSProperties } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { type Item } from '../../platform/api'
import { childrenOf, statusLabel } from '../../domain/items'
import { collisionFor, dropSettle, SLIDE, useDragSensors, DRAG_ATTRIBUTES } from '../../shared/drag/drag'
import { spring } from '../../shared/motion/springs'
import type { Actions } from '../../app/useActions'
import { useTwoLevelDrag, type Order } from '../../shared/drag/useTwoLevelDrag'
import { InlineAdd } from '../../shared/controls'
import { Lifted } from '../../shared/drag/Lifted'
import { Collapse, ListRow } from '../../shared/motion/pieces'
import { DueDate, MilestoneChip, Progress, StatusIcon, TaskTitle } from '../../shared/ui'

interface Props {
  items: Item[]
  /** A project, or a milestone opened on its own. */
  container: Item
  collapsed: Set<string>
  onToggle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCycleStatus: (task: Item) => void
  /** Opens a milestone on its own page. */
  onOpen: (id: string) => void
  actions: Actions
}


export function ProjectList({ items, container, collapsed, onToggle, selectedId, onSelect, onCycleStatus, onOpen, actions }: Props) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const sensors = useDragSensors()

  // The real order: the container holds milestones or tasks; each milestone holds tasks.
  const base = useMemo<Order>(() => {
    const top = childrenOf(items, container.id)
    const order: Order = { [container.id]: top.map((c) => c.id) }
    for (const m of top) if (m.kind === 'milestone') order[m.id] = childrenOf(items, m.id).map((t) => t.id)
    return order
  }, [items, container.id])

  const commit = useCallback(
    (id: string, parent: string | null, before: string | null, from: { parent: string | null; before: string | null }) => {
      const item = byId.get(id)
      const target = parent ? byId.get(parent) : undefined
      if (!item) return Promise.resolve()
      return actions.move(item, { id: parent, title: target?.title ?? '' }, before, from)
    },
    [byId, actions],
  )

  const drag = useTwoLevelDrag({
    base,
    rootKey: container.id,
    rootParent: container.id,
    groupType: 'milestone',
    itemType: 'task',
    commit,
  })

  const top = (drag.order[container.id] ?? []).map((id) => byId.get(id)).filter((i): i is Item => !!i)
  const milestones = top.filter((i) => i.kind === 'milestone')
  const looseTasks = top.filter((i) => i.kind === 'task')
  const dragged = drag.activeId ? byId.get(drag.activeId) : undefined
  const movingMilestone = dragged?.kind === 'milestone'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionFor({ task: ['milestone'] })}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragEnd={(e) => void drag.onDragEnd(e)}
      onDragCancel={drag.onDragCancel}
    >
      <div className="-mt-[22px] flex flex-col">
        <SortableContext items={top.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {milestones.map((milestone) => (
              <ListRow key={milestone.id} className="pt-[22px]">
                <SortableMilestone
                  milestone={milestone}
                  tasks={(drag.order[milestone.id] ?? []).map((id) => byId.get(id)).filter((t): t is Item => !!t)}
                  collapsed={collapsed.has(milestone.id) || movingMilestone}
                  onToggle={() => onToggle(milestone.id)}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onCycleStatus={onCycleStatus}
                  onOpen={() => onOpen(milestone.id)}
                  actions={actions}
                />
              </ListRow>
            ))}
          </AnimatePresence>

          {milestones.length === 0 && (
            <div className="flex flex-col gap-0.5 pt-[22px]">
              <AnimatePresence initial={false}>
                {looseTasks.map((task) => (
                  <ListRow key={task.id}>
                    <SortableTask
                      task={task}
                      selected={task.id === selectedId}
                      onSelect={onSelect}
                      onCycleStatus={onCycleStatus}
                      indent={false}
                    />
                  </ListRow>
                ))}
              </AnimatePresence>
              <InlineAdd
                id={`add-task-${container.id}`}
                label="Add a task"
                onAdd={(title) => actions.create('task', container.id, title)}
              />
            </div>
          )}
        </SortableContext>

        {/* A project holds milestones or loose tasks, never both. Milestones
            hold only tasks. */}
        {looseTasks.length === 0 && container.kind === 'project' && (
          <InlineAdd
            id={`add-milestone-${container.id}`}
            label="Add a milestone"
            onAdd={(title) => actions.create('milestone', container.id, title)}
            className={milestones.length === 0 ? '' : 'mt-[22px]'}
          />
        )}
      </div>

      <DragOverlay dropAnimation={dropSettle}>
        {dragged && drag.active && (
          <Lifted grab={drag.active.grab} width={drag.active.width} className="rounded-row">
            {dragged.kind === 'milestone' ? (
              <div className="flex h-row items-center gap-2 rounded-row border border-border-strong bg-card pr-3 pl-2">
                <ChevronDown size={14} strokeWidth={2} className="-rotate-90 text-fg-3" aria-hidden="true" />
                <MilestoneChip title={dragged.title} color={dragged.color} header />
                <span className="text-meta font-normal text-fg-3">
                  {`${childrenOf(items, dragged.id).length} tasks`}
                </span>
              </div>
            ) : (
              <div
                className={`flex h-row items-center gap-2.5 rounded-row border border-border-strong bg-card pr-2.5 ${
                  milestones.length > 0 ? 'pl-7' : 'pl-2.5'
                }`}
              >
                <StatusIcon status={dragged.status} />
                <TaskTitle title={dragged.title} done={dragged.status === 'done'} />
                <DueDate item={dragged} />
              </div>
            )}
          </Lifted>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function SortableMilestone({
  milestone,
  tasks,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
  onCycleStatus,
  onOpen,
  actions,
}: {
  milestone: Item
  tasks: Item[]
  collapsed: boolean
  onToggle: () => void
  selectedId: string | null
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
  onOpen: () => void
  actions: Actions
}) {
  const sortable = useSortable({ id: milestone.id, data: { type: 'milestone' }, transition: SLIDE, attributes: DRAG_ATTRIBUTES })
  const done = tasks.filter((t) => t.status === 'done').length
  const selected = milestone.id === selectedId
  const style: CSSProperties = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  }

  return (
    <div ref={sortable.setNodeRef} style={style} className="flex flex-col gap-0.5">
      <div
        ref={sortable.setActivatorNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`${milestone.title}, milestone. Press space to move.`}
        data-item={milestone.id}
        className={`group/ms flex h-row items-center gap-1 rounded-row pr-1 pl-0.5 transition-colors duration-100 ${
          sortable.isDragging ? 'bg-hover [&>*]:invisible' : selected ? 'bg-selected' : 'hover:bg-hover'
        }`}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? `Expand ${milestone.title}` : `Collapse ${milestone.title}`}
          aria-expanded={!collapsed}
          className="flex rounded-md p-1 text-fg-3 hover:text-fg-2"
        >
          <motion.span initial={false} animate={{ rotate: collapsed ? -90 : 0 }} transition={spring.snappy} className="flex">
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          </motion.span>
        </button>
        <button
          onClick={() => onSelect(milestone.id)}
          className="@container flex h-full min-w-0 flex-1 items-center gap-2 text-left"
        >
          <MilestoneChip title={milestone.title} color={milestone.color} header />
          {milestone.status === 'done' && <StatusIcon status="done" size={14} />}
          <span className="shrink-0 text-meta font-normal text-fg-3">{`${done} / ${tasks.length}`}</span>
          <DueDate item={milestone} className="@max-[20rem]:hidden" />
          <Progress done={done} total={tasks.length} className="ml-1.5 max-w-[120px] min-w-6 flex-1 @max-[24rem]:hidden" />
        </button>
        <button
          onClick={onOpen}
          aria-label={`Open ${milestone.title}`}
          title="Open milestone"
          className="flex rounded-md p-1 text-fg-3 opacity-0 transition-opacity duration-100 group-hover/ms:opacity-100 hover:bg-hover hover:text-fg-2 focus-visible:opacity-100"
        >
          <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <Collapse open={!collapsed} className="flex flex-col gap-0.5">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <ListRow key={task.id}>
                <SortableTask
                  task={task}
                  selected={task.id === selectedId}
                  onSelect={onSelect}
                  onCycleStatus={onCycleStatus}
                  indent
                />
              </ListRow>
            ))}
          </AnimatePresence>
        </SortableContext>
        <InlineAdd
          id={`add-task-${milestone.id}`}
          label="Add a task"
          onAdd={(title) => actions.create('task', milestone.id, title)}
          className="ml-[22px]"
        />
      </Collapse>
    </div>
  )
}

/** Memoized: a reload only redraws the rows whose task changed (see lib/share.ts). */
const SortableTask = memo(function SortableTask({
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
  const sortable = useSortable({ id: task.id, data: { type: 'task' }, transition: SLIDE, attributes: DRAG_ATTRIBUTES })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  }
  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-label={`${task.title}, task. Press space to move.`}
      // While it's being dragged, its slot stays as a soft empty space.
      data-item={task.id}
      className={`group flex h-row items-center gap-2.5 rounded-row pr-2.5 transition-colors duration-100 ${
        indent ? 'pl-7' : 'pl-2.5'
      } ${sortable.isDragging ? 'bg-hover [&>*]:invisible' : selected ? 'bg-selected' : 'hover:bg-hover'}`}
    >
      <TaskRowContent task={task} onSelect={onSelect} onCycleStatus={onCycleStatus} />
    </div>
  )
})

/**
 * What's inside a task row. dnd-kit redraws every sortable row whenever the
 * list changes (its context changes), memo or not; keeping the row's insides
 * separate means those redraws stop at the outer div.
 */
const TaskRowContent = memo(function TaskRowContent({
  task,
  onSelect,
  onCycleStatus,
}: {
  task: Item
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
}) {
  return (
    <>
      <button
        onClick={() => onCycleStatus(task)}
        aria-label={`Status: ${statusLabel(task.status)}. Change status`}
        title="Change status"
        className="-m-1 rounded-full p-1 transition-transform duration-100 ease-pop active:scale-90"
      >
        <StatusIcon status={task.status} />
      </button>
      <button onClick={() => onSelect(task.id)} className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left">
        <TaskTitle title={task.title} done={task.status === 'done'} />
        <DueDate item={task} />
      </button>
    </>
  )
})
