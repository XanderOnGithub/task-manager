// An area's list: each project as a section with its open tasks, so you can
// see everything going on in, say, Home at once. Done tasks are counted in the
// header but not listed (open the project to see them). Drag and drop lives in
// the project and milestone pages, where there's one place to drop into.

import { memo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, ChevronDown, Target } from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import { statusLabel, tasksUnder } from '../lib/items'
import { spring } from '../lib/motion'
import type { Actions } from '../lib/useActions'
import { InlineAdd } from './controls'
import { Collapse, ListRow } from './motion'
import { DueDate, MilestoneChip, Progress, StatusIcon, TaskTitle } from './ui'

interface Props {
  items: Item[]
  area: Item
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCycleStatus: (task: Item) => void
  onOpen: (id: string) => void
  actions: Actions
  /** The "Add a project" row at the end. Off in the Tasks overview. */
  showAdd?: boolean
}

export function AreaList({ items, area, selectedId, onSelect, onCycleStatus, onOpen, actions, showAdd = true }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const projects = childrenOf(items, area.id)

  return (
    <div className="flex flex-col gap-[22px]">
      {projects.map((project) => {
        const all = tasksUnder(items, project.id)
        const open = all.filter(({ task }) => task.status !== 'done')
        const done = all.length - open.length
        const isOpen = !collapsed.has(project.id)
        const finished = project.status === 'done' || project.status === 'dropped'
        return (
          <section key={project.id} className="flex flex-col gap-0.5">
            <div
              data-item={project.id}
              className="group flex h-row items-center gap-1 rounded-row pr-1 pl-0.5 transition-colors duration-100 hover:bg-hover"
            >
              <button
                onClick={() =>
                  setCollapsed((c) => {
                    const next = new Set(c)
                    if (next.has(project.id)) next.delete(project.id)
                    else next.add(project.id)
                    return next
                  })
                }
                aria-label={isOpen ? `Collapse ${project.title}` : `Expand ${project.title}`}
                aria-expanded={isOpen}
                className="flex rounded-md p-1 text-fg-3 hover:text-fg-2"
              >
                <motion.span initial={false} animate={{ rotate: isOpen ? 0 : -90 }} transition={spring.snappy} className="flex">
                  <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                </motion.span>
              </button>
              <button
                onClick={() => onOpen(project.id)}
                className="@container flex h-full min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Target size={15} strokeWidth={1.75} className="shrink-0 text-fg-2" aria-hidden="true" />
                <span className={`min-w-0 truncate font-semibold ${finished ? 'text-fg-3' : 'text-fg'}`}>{project.title}</span>
                {project.status !== 'active' && (
                  <span className="shrink-0 rounded-full bg-raised px-2 text-meta text-fg-3">{statusLabel(project.status)}</span>
                )}
                <span className="shrink-0 text-meta font-normal text-fg-3">{`${done} / ${all.length}`}</span>
                <DueDate item={project} className="@max-[20rem]:hidden" />
                <Progress done={done} total={all.length} className="ml-1.5 max-w-[120px] min-w-6 flex-1 @max-[24rem]:hidden" />
              </button>
              <button
                onClick={() => onOpen(project.id)}
                aria-label={`Open ${project.title}`}
                title="Open project"
                className="flex rounded-md p-1 text-fg-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-hover hover:text-fg-2 focus-visible:opacity-100"
              >
                <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <Collapse open={isOpen} className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {open.map(({ task, milestone }) => (
                  <ListRow key={task.id}>
                    <AreaTaskRow
                      task={task}
                      milestone={milestone}
                      selected={task.id === selectedId}
                      onSelect={onSelect}
                      onCycleStatus={onCycleStatus}
                    />
                  </ListRow>
                ))}
              </AnimatePresence>
              {open.length === 0 && (
                <p className="flex h-row items-center pl-7 text-fg-3">
                  {all.length === 0 ? 'No tasks yet' : 'All tasks done'}
                </p>
              )}
            </Collapse>
          </section>
        )
      })}

      {showAdd && (
        <InlineAdd
          id={`add-project-${area.id}`}
          label="Add a project"
          onAdd={(title) => actions.create('project', area.id, title)}
        />
      )}
      {!showAdd && projects.length === 0 && <p className="flex h-row items-center pl-1 text-fg-3">No projects yet</p>}
    </div>
  )
}

/** One open task under its project. Memoized: a reload only redraws the rows whose task changed (see lib/share.ts). */
const AreaTaskRow = memo(function AreaTaskRow({
  task,
  milestone,
  selected,
  onSelect,
  onCycleStatus,
}: {
  task: Item
  milestone: Item | null
  selected: boolean
  onSelect: (id: string) => void
  onCycleStatus: (task: Item) => void
}) {
  return (
    <div
      data-item={task.id}
      className={`flex h-row items-center gap-2.5 rounded-row pr-2.5 pl-7 transition-colors duration-100 ${
        selected ? 'bg-selected' : 'hover:bg-hover'
      }`}
    >
      <button
        onClick={() => onCycleStatus(task)}
        aria-label={`Status: ${statusLabel(task.status)}. Change status`}
        title="Change status"
        className="-m-1 rounded-full p-1 transition-transform duration-100 ease-pop active:scale-90"
      >
        <StatusIcon status={task.status} />
      </button>
      <button onClick={() => onSelect(task.id)} className="@container flex h-full min-w-0 flex-1 items-center gap-2.5 text-left">
        <TaskTitle title={task.title} done={false} />
        {milestone && (
          <MilestoneChip title={milestone.title} color={milestone.color} className="max-w-[45%] @max-[14rem]:hidden" />
        )}
        <DueDate item={task} />
      </button>
    </div>
  )
})
