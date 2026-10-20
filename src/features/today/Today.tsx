// Today: what is due, across every area and project. Overdue first, then today,
// then each of the next six days that has something due.
//
// Dates come from the tasks themselves. Type one when you add a task ("call Bob
// friday") or pick it in the task's details.

import { memo } from 'react'
import { statusLabel } from '../../domain/items'
import type { Item } from '../../platform/api'
import { DueDate, Panel, PanelHeader, SectionLabel, StatusIcon, TaskTitle } from '../../shared/ui'
import { planFor } from './plan'

export function TodayView({
  items,
  onOpen,
  onCycleStatus,
}: {
  items: Item[]
  /** Opens a task (its project, with the task selected). */
  onOpen: (id: string) => void
  onCycleStatus: (task: Item) => void
}) {
  const now = new Date()
  const groups = planFor(items, now)

  return (
    <Panel label="Today" className="flex-1">
      <PanelHeader>
        <span className="flex-1 truncate text-fg">Today</span>
      </PanelHeader>
      <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-title">Today</h1>
          <span className="text-meta font-normal text-fg-3">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col gap-1 text-fg-3">
            <p>Nothing due this week</p>
            <p className="text-meta font-normal">Add a date to a task, or type one when you add it: "call Bob friday".</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-labelledby={`today-${group.key}`} className="flex flex-col gap-0.5">
              <SectionLabel className={`pb-1 pl-2.5 ${group.key === 'overdue' ? 'text-overdue' : ''}`}>
                <h2 id={`today-${group.key}`}>{group.label}</h2>
              </SectionLabel>
              {group.tasks.map(({ task, milestone, project }) => (
                <TodayRow
                  key={task.id}
                  task={task}
                  where={[project?.title, milestone?.title].filter(Boolean).join(' / ')}
                  onOpen={onOpen}
                  onCycleStatus={onCycleStatus}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </Panel>
  )
}

/** One task. Memoized like the rows in the lists: a reload redraws only what changed. */
const TodayRow = memo(function TodayRow({
  task,
  where,
  onOpen,
  onCycleStatus,
}: {
  task: Item
  where: string
  onOpen: (id: string) => void
  onCycleStatus: (task: Item) => void
}) {
  return (
    <div
      data-item={task.id}
      tabIndex={-1}
      className="flex h-row items-center gap-2.5 rounded-row pr-2.5 pl-2.5 transition-colors duration-100 hover:bg-hover"
    >
      <button
        onClick={() => onCycleStatus(task)}
        aria-label={`Status: ${statusLabel(task.status)}. Change status`}
        title="Change status"
        className="-m-1 rounded-full p-1 transition-transform duration-100 ease-pop active:scale-90"
      >
        <StatusIcon status={task.status} />
      </button>
      <button onClick={() => onOpen(task.id)} className="@container flex h-full min-w-0 flex-1 items-center gap-2.5 text-left">
        <TaskTitle title={task.title} done={false} />
        {where && <span className="min-w-0 truncate text-meta font-normal text-fg-3 @max-[16rem]:hidden">{where}</span>}
        <span className="ml-auto" />
        <DueDate item={task} />
      </button>
    </div>
  )
})
