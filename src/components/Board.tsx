// The board: the tasks inside an area, project or milestone (or every task,
// in the Tasks overview), in Todo / Doing / Done columns.
// Drag a card into another column to change its status. Clicking a card's
// circle also changes status, and the card flies to its new column.

import { memo, useEffect, useState } from 'react'
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
import { useLanes } from '../lib/lanes'
import { spring } from '../lib/motion'
import type { Actions } from '../lib/useActions'
import { Lifted } from './Lifted'
import { DueDate, MilestoneChip, StatusIcon } from './ui'


/** The column under the pointer, or the nearest one (for keyboard dragging). */
const columnCollision: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length ? under : closestCenter(args)
}

interface Props {
  items: Item[]
  /** The area, project or milestone whose tasks are shown. null = every task. */
  scope: Item | null
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
  const tasks = tasksUnder(items, scope?.id ?? null)
  // Todo, Doing, Done, plus Later and Waiting when they're on (or in use here).
  const lanes = useLanes(tasks.map(({ task }) => task))
  // Inside a milestone the chip would say the same thing on every card.
  const showMilestone = scope?.kind !== 'milestone'
  // In an area (or everywhere), cards also say which project they're from.
  const showProject = !scope || scope.kind === 'area'
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
      onDragOver={drag.over}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => drag.end(false)}
    >
      {/* Columns fill the height and each scrolls its own cards, so the
          board never gets taller than the window. They share the width
          between a readable minimum (the board scrolls sideways below it)
          and a maximum (on a wide screen they stop growing and sit left). */}
      <LayoutGroup>
        <div className="flex min-h-0 flex-1 overflow-x-auto">
          <div className="flex min-h-0 flex-1 gap-3 p-4">
            {lanes.map((column) => (
              <Column key={column.status} status={column.status} label={column.label} dot={column.dot} count={tasks.filter(({ task }) => statusOf(task) === column.status).length}>
                {tasks
                  .filter(({ task }) => statusOf(task) === column.status)
                  .map(({ task, milestone, project }) => (
                    <Card
                      key={task.id}
                      // Same object when nothing's remapped, so the card's memo holds.
                      task={statusOf(task) === task.status ? task : { ...task, status: statusOf(task) }}
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
      className={`flex min-h-0 max-w-[22rem] min-w-[12.5rem] flex-1 basis-0 flex-col gap-2 rounded-[10px] py-2.5 transition-colors duration-150 ${
        droppable.isOver ? 'bg-hover' : 'bg-column'
      }`}
    >
      <div className="mx-2.5 flex h-[26px] shrink-0 items-center gap-2 px-1">
        <span className={`size-2 rounded-full ${dot}`} />
        <span className="font-semibold">{label}</span>
        <span className="text-meta font-normal text-fg-3">{count}</span>
      </div>
      {/* The column's own scroll. layoutScroll lets cards that change
          column measure their start correctly even when it's scrolled. */}
      <motion.div layoutScroll className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-0.5">
        {children}
      </motion.div>
    </div>
  )
}

/** Memoized: a reload only redraws the cards whose task changed (see lib/share.ts). */
const Card = memo(function Card({
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
      data-item={task.id}
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
})

/** Memoized separately from Card: dnd-kit redraws every draggable card when the board changes, and this keeps those redraws to the outer wrapper. */
const CardFace = memo(function CardFace({
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
          className={`min-w-0 flex-1 text-left leading-snug break-words ${task.status === 'done' ? 'text-fg-2' : 'text-fg'}`}
        >
          {task.title}
        </button>
      </div>
      {(milestone || project || task.due) && (
        // Reads left to right like a sentence and wraps to the start of the
        // next line when the card is narrow, so nothing is left stranded.
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          {project && <span className="min-w-0 truncate text-meta font-normal text-fg-3">{project.title}</span>}
          {milestone && <MilestoneChip title={milestone.title} color={milestone.color} />}
          <DueDate item={task} />
        </div>
      )}
    </div>
  )
})
