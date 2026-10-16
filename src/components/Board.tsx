// The board: the tasks inside an area, project or milestone, in Todo / Doing /
// Done columns.
// Drag a card into another column to change its status. Clicking a card's
// circle also changes status, and the card flies to its new column.

import { useEffect, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import { LayoutGroup, motion } from 'motion/react'
import type { Item, TaskStatus } from '../lib/api'
import { useDragSensors, useDragState } from '../lib/drag'
import { statusLabel, tasksUnder } from '../lib/items'
import { spring } from '../lib/motion'
import type { Actions } from '../lib/useActions'
import { Lifted } from './Lifted'
import { DueDate, MilestoneChip, StatusIcon } from './ui'

const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'todo', label: 'Todo', dot: 'bg-todo' },
  { status: 'doing', label: 'Doing', dot: 'bg-doing' },
  { status: 'done', label: 'Done', dot: 'bg-done' },
]

/** The column under the pointer, or the nearest one (for keyboard dragging). */
const columnCollision: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length ? under : closestCenter(args)
}

interface Props {
  items: Item[]
  /** The area, project or milestone whose tasks are shown. */
  scope: Item
  selectedId: string | null
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
  actions: Actions
}

export function Board({ items, scope, selectedId, onSelect, onCycleStatus, actions }: Props) {
  const sensors = useDragSensors()
  const drag = useDragState()
  // Status shown right away after a drop, before the save comes back.
  const [pending, setPending] = useState<{ id: string; status: TaskStatus } | null>(null)
  // The card just dropped appears in place instead of flying from its old column.
  const [landed, setLanded] = useState<string | null>(null)
  useEffect(() => {
    if (!landed) return
    const t = window.setTimeout(() => setLanded(null), 500)
    return () => window.clearTimeout(t)
  }, [landed])

  // Every task inside, in list order, with its milestone and project.
  const tasks = tasksUnder(items, scope.id)
  // Inside a milestone the chip would say the same thing on every card.
  const showMilestone = scope.kind !== 'milestone'
  // In an area, cards also say which project they're from.
  const showProject = scope.kind === 'area'
  const statusOf = (task: Item) => (pending?.id === task.id ? pending.status : task.status)
  const dragged = tasks.find(({ task }) => task.id === drag.active?.id)

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const task = tasks.find((t) => t.task.id === active.id)?.task
    const status = over?.data.current?.status as TaskStatus | undefined
    // A status change plays its own sound (complete / status), so no thud.
    drag.end(!task || !status || status === task.status)
    if (!task || !status || status === task.status) return
    setPending({ id: task.id, status })
    setLanded(task.id)
    await actions.setStatus(task, status)
    setPending(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnCollision}
      onDragStart={drag.start}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => drag.end(false)}
    >
      {/* The whole board scrolls as one (not each column), so a card can fly
          across columns without being clipped. Columns fill the height. */}
      <LayoutGroup>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-y-auto p-4 [grid-auto-rows:minmax(100%,max-content)]">
          {COLUMNS.map((column) => (
            <Column key={column.status} {...column} count={tasks.filter(({ task }) => statusOf(task) === column.status).length}>
              {tasks
                .filter(({ task }) => statusOf(task) === column.status)
                .map(({ task, milestone, project }) => (
                  <Card
                    key={task.id}
                    task={{ ...task, status: statusOf(task) }}
                    milestone={showMilestone ? milestone : null}
                    project={showProject ? project : null}
                    selected={task.id === selectedId}
                    landed={task.id === landed}
                    onSelect={onSelect}
                    onCycleStatus={onCycleStatus}
                  />
                ))}
            </Column>
          ))}
        </div>
      </LayoutGroup>

      {/* No drop animation: the card is already where you let go. */}
      <DragOverlay dropAnimation={null}>
        {dragged && drag.active && (
          <Lifted grab={drag.active.grab} width={drag.active.width} className="rounded-card">
            <CardFace
              task={dragged.task}
              milestone={showMilestone ? dragged.milestone : null}
              project={showProject ? dragged.project : null}
              lifted
            />
          </Lifted>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  label,
  dot,
  count,
  children,
}: {
  status: TaskStatus
  label: string
  dot: string
  count: number
  children: React.ReactNode
}) {
  const droppable = useDroppable({ id: `column:${status}`, data: { type: 'column', status } })
  return (
    <div
      ref={droppable.setNodeRef}
      className={`flex flex-col gap-2 rounded-[10px] p-2.5 transition-colors duration-150 ${
        droppable.isOver ? 'bg-hover' : 'bg-column'
      }`}
    >
      <div className="flex h-[26px] shrink-0 items-center gap-2 px-1">
        <span className={`size-2 rounded-full ${dot}`} />
        <span className="font-semibold">{label}</span>
        <span className="text-meta font-normal text-fg-3">{count}</span>
      </div>
      {children}
    </div>
  )
}

function Card({
  task,
  milestone,
  project,
  selected,
  landed,
  onSelect,
  onCycleStatus,
}: {
  task: Item
  milestone: Item | null
  project: Item | null
  selected: boolean
  landed: boolean
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
}) {
  const draggable = useDraggable({ id: task.id, data: { type: 'card' } })
  return (
    <motion.div
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      aria-label={`${task.title}, ${statusLabel(task.status)}. Press space to move.`}
      // A card that just landed from a drag skips the fly-in and settles in place.
      layoutId={landed ? undefined : task.id}
      initial={landed ? { scale: 1.02 } : false}
      animate={{ scale: 1 }}
      transition={landed ? spring.pop : spring.smooth}
      className={`relative z-10 shrink-0 rounded-card ${draggable.isDragging ? 'opacity-0' : ''}`}
    >
      <CardFace
        task={task}
        milestone={milestone}
        project={project}
        selected={selected}
        onSelect={onSelect}
        onCycleStatus={onCycleStatus}
      />
    </motion.div>
  )
}

function CardFace({
  task,
  milestone,
  project = null,
  selected = false,
  lifted = false,
  onSelect,
  onCycleStatus,
}: {
  task: Item
  milestone: Item | null
  project?: Item | null
  selected?: boolean
  lifted?: boolean
  onSelect?: (id: string) => void
  onCycleStatus?: (task: Item) => void
}) {
  return (
    <div
      className={`flex flex-col gap-2.5 rounded-card border bg-card p-3 shadow-card transition-colors duration-100 ${
        lifted || selected ? 'border-border-strong' : task.status === 'doing' ? 'border-doing/45' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => onCycleStatus?.(task)}
          aria-label={`Status: ${statusLabel(task.status)}. Change status`}
          className="mt-px rounded-full transition-transform duration-100 ease-pop active:scale-90"
        >
          <StatusIcon status={task.status} />
        </button>
        <button
          onClick={() => onSelect?.(task.id)}
          className={`flex-1 text-left leading-snug ${task.status === 'done' ? 'text-fg-2' : 'text-fg'}`}
        >
          {task.title}
        </button>
      </div>
      {(milestone || project || task.due) && (
        <div className="flex min-w-0 items-center gap-2">
          {project && <span className="truncate text-meta font-normal text-fg-3">{project.title}</span>}
          {milestone && <MilestoneChip title={milestone.title} color={milestone.color} />}
          <DueDate item={task} className="ml-auto" />
        </div>
      )}
    </div>
  )
}
