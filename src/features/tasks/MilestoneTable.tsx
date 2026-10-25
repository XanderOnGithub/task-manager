// Milestones as a table: the steps of each project, how far along each one is,
// and when it is due. The view for "where does the work stand?" across a
// project, an area or everything (the Tasks overview).
//
// Click a milestone to see its details beside the table; the arrow opens it on
// its own page with its tasks.

import { ArrowUpRight } from 'lucide-react'
import type { Item } from '../../platform/api'
import { statusLabel } from '../../domain/items'
import { milestoneRows } from '../../domain/milestones'
import { useVocab } from '../../domain/vocab'
import { DueDate, MilestoneChip, Progress, StatusIcon } from '../../shared/ui'

export function MilestoneTable({
  items,
  scope,
  title,
  selectedId,
  onSelect,
  onOpen,
}: {
  items: Item[]
  scope: Item | null
  /** The view's heading: the project's, area's or "Tasks". */
  title: string
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
}) {
  const rows = milestoneRows(items, scope)
  const words = useVocab()
  // Inside one project every row would name the same project.
  const showProject = scope?.kind !== 'project'
  const finished = rows.filter((r) => r.milestone.status === 'done').length

  return (
    <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6 max-md:px-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-title">{title}</h1>
        <div className="flex items-center gap-3.5 text-meta font-normal text-fg-3">
          <span>{words.count(rows.length, 'milestone')}</span>
          {rows.length > 0 && <span>{`${finished} of ${rows.length} done`}</span>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-fg-3">{`No ${words.nouns('milestone')} yet. Add one in ${words.a('project')}'s List view.`}</p>
      ) : (
        <table className="w-full border-separate border-spacing-0 text-left">
          <caption className="sr-only">{words.Nouns('milestone')}</caption>
          <thead>
            <tr className="text-label tracking-label text-fg-3 uppercase">
              <th scope="col" className="border-b border-border px-2 pb-2 font-medium">
                {words.Noun('milestone')}
              </th>
              {showProject && (
                <th scope="col" className="border-b border-border px-2 pb-2 font-medium max-md:hidden">
                  {words.Noun('project')}
                </th>
              )}
              <th scope="col" className="border-b border-border px-2 pb-2 font-medium">
                Progress
              </th>
              <th scope="col" className="border-b border-border px-2 pb-2 font-medium max-md:hidden">
                Due
              </th>
              <th scope="col" className="border-b border-border px-2 pb-2 font-medium max-md:hidden">
                Status
              </th>
              <th scope="col" className="w-8 border-b border-border pb-2">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ milestone, project, done, total }) => (
              <tr
                key={milestone.id}
                data-item={milestone.id}
                className={`group transition-colors duration-100 ${milestone.id === selectedId ? 'bg-selected' : 'hover:bg-hover'}`}
              >
                <td className="h-row border-b border-border px-2 first:rounded-l-row">
                  <button onClick={() => onSelect(milestone.id)} className="flex max-w-full min-w-0 flex-col items-start gap-0.5 py-1 text-left">
                    <MilestoneChip title={milestone.title} color={milestone.color} />
                    {/* On a phone the project and due date go under the name. */}
                    <span className="flex items-center gap-2 text-meta font-normal text-fg-3 md:hidden">
                      {showProject && <span className="truncate">{project.title}</span>}
                      <DueDate item={milestone} />
                    </span>
                  </button>
                </td>
                {showProject && (
                  <td className="border-b border-border px-2 text-meta font-normal text-fg-2 max-md:hidden">
                    <button onClick={() => onOpen(project.id)} className="truncate text-left hover:text-fg">
                      {project.title}
                    </button>
                  </td>
                )}
                <td className="border-b border-border px-2">
                  <span className="flex items-center gap-2">
                    <Progress done={done} total={total} className="w-20 max-md:w-12" />
                    <span className="text-meta font-normal whitespace-nowrap text-fg-3 tabular-nums">{`${done} of ${total}`}</span>
                  </span>
                </td>
                <td className="border-b border-border px-2 max-md:hidden">
                  <DueDate item={milestone} />
                </td>
                <td className="border-b border-border px-2 max-md:hidden">
                  <span className="flex items-center gap-1.5 text-meta font-normal text-fg-2">
                    <StatusIcon status={milestone.status} size={14} />
                    {statusLabel(milestone.status)}
                  </span>
                </td>
                <td className="border-b border-border px-1 last:rounded-r-row">
                  <button
                    onClick={() => onOpen(milestone.id)}
                    aria-label={`Open ${milestone.title}`}
                    title={`Open ${words.noun('milestone')}`}
                    className="flex rounded-md p-1 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg-2"
                  >
                    <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
