// The sidebar's areas and projects, draggable.
// - Drag an area to reorder areas (they all fold shut while you do).
// - Drag a project to reorder it, or into another area (drop on the area's
//   name to put it first, even if the area is closed).

import { useCallback, useMemo, type CSSProperties } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'motion/react'
import { ChevronDown, Folder, Plus, Target } from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import { collisionFor, dropSettle, SLIDE, useDragSensors } from '../lib/drag'
import { taskCounts } from '../lib/items'
import { spring } from '../lib/motion'
import type { Actions } from '../lib/useActions'
import { useTwoLevelDrag, type Order } from '../lib/useTwoLevelDrag'
import { InlineAdd } from './controls'
import { Lifted } from './Lifted'
import { Collapse } from './motion'

const ROOT = 'areas'

interface Props {
  items: Item[]
  activeProjectId: string | null
  onProject: (id: string) => void
  expanded: Set<string>
  onToggleArea: (id: string) => void
  /** Where an inline "add" field is open: 'area', or an area id for a new project. */
  adding: string | null
  setAdding: (where: string | null) => void
  onAddArea: (title: string) => Promise<unknown>
  onAddProject: (areaId: string, title: string) => Promise<unknown>
  actions: Actions
}

export function AreaTree(props: Props) {
  const { items, actions } = props
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const sensors = useDragSensors()

  const base = useMemo<Order>(() => {
    const areas = childrenOf(items, null)
    const order: Order = { [ROOT]: areas.map((a) => a.id) }
    for (const a of areas) order[a.id] = childrenOf(items, a.id).map((p) => p.id)
    return order
  }, [items])

  const commit = useCallback(
    (id: string, parent: string | null, before: string | null, from: { parent: string | null; before: string | null }) => {
      const item = byId.get(id)
      if (!item) return Promise.resolve()
      // Keep a folded area open after a project is dropped into it.
      if (parent && item.kind === 'project' && !props.expanded.has(parent)) props.onToggleArea(parent)
      return actions.move(item, { id: parent, title: parent ? (byId.get(parent)?.title ?? '') : 'Areas' }, before, from)
    },
    [byId, actions, props],
  )

  const drag = useTwoLevelDrag({ base, rootKey: ROOT, rootParent: null, groupType: 'area', itemType: 'project', commit })
  const areas = (drag.order[ROOT] ?? []).map((id) => byId.get(id)).filter((a): a is Item => !!a)
  const dragged = drag.activeId ? byId.get(drag.activeId) : undefined
  const movingArea = dragged?.kind === 'area'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionFor({ project: ['area'] })}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragEnd={(e) => void drag.onDragEnd(e)}
      onDragCancel={drag.onDragCancel}
    >
      <SortableContext items={areas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        {areas.map((area) => (
          <SortableArea
            key={area.id}
            area={area}
            projects={(drag.order[area.id] ?? []).map((id) => byId.get(id)).filter((p): p is Item => !!p)}
            // A folded area opens while it holds the dragged project, so the gap
            // shows where it will land (and the list doesn't shrink under the pointer).
            open={
              !movingArea &&
              (props.expanded.has(area.id) ||
                props.adding === area.id ||
                (!!drag.activeId && (drag.order[area.id] ?? []).includes(drag.activeId)))
            }
            {...props}
          />
        ))}
      </SortableContext>

      {props.adding === 'area' && (
        <InlineAdd
          autoFocus
          label="Area name"
          className="h-7"
          onAdd={async (title) => {
            await props.onAddArea(title)
            props.setAdding(null)
          }}
          onDone={() => props.setAdding(null)}
        />
      )}
      {areas.length === 0 && props.adding !== 'area' && (
        <button onClick={() => props.setAdding('area')} className="px-2.5 py-1 text-left text-fg-3 hover:text-fg-2">
          Add an area
        </button>
      )}

      <DragOverlay dropAnimation={dropSettle}>
        {dragged && drag.active && (
          <Lifted grab={drag.active.grab} width={drag.active.width} className="rounded-control">
            {/* Same padding as the row it came from, so nothing jumps on pickup. */}
            {dragged.kind === 'area' ? (
              <div className="flex h-7 items-center gap-1.5 rounded-control border border-border-menu bg-menu px-2 text-fg">
                <ChevronDown size={14} strokeWidth={2} className="-rotate-90 text-fg-3" aria-hidden="true" />
                <Folder size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
                <span className="truncate">{dragged.title}</span>
              </div>
            ) : (
              <div className="flex h-7 items-center gap-2 rounded-control border border-border-menu bg-menu pr-2 pl-[34px] text-fg">
                <Target size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
                <span className="truncate">{dragged.title}</span>
              </div>
            )}
          </Lifted>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function SortableArea({
  area,
  projects,
  open,
  items,
  activeProjectId,
  onProject,
  onToggleArea,
  adding,
  setAdding,
  onAddProject,
}: Props & { area: Item; projects: Item[]; open: boolean }) {
  const sortable = useSortable({ id: area.id, data: { type: 'area' }, transition: SLIDE })
  const style: CSSProperties = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }

  return (
    <div ref={sortable.setNodeRef} style={style} className="flex flex-col gap-0.5">
      <div
        className={`group relative flex rounded-control transition-colors duration-100 ${
          sortable.isDragging ? 'bg-hover [&>*]:invisible' : ''
        }`}
      >
        <button
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={() => onToggleArea(area.id)}
          aria-expanded={open}
          className="flex h-7 flex-1 items-center gap-1.5 rounded-control px-2 text-left text-fg transition-colors duration-100 hover:bg-hover"
        >
          <motion.span initial={false} animate={{ rotate: open ? 0 : -90 }} transition={spring.snappy} className="flex">
            <ChevronDown size={14} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
          </motion.span>
          <Folder size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
          <span className="truncate">{area.title}</span>
        </button>
        <span className="absolute top-1 right-1">
          <button
            onClick={() => setAdding(area.id)}
            aria-label={`Add a project to ${area.title}`}
            title={`Add a project to ${area.title}`}
            className="flex rounded-md p-0.5 text-fg-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-hover hover:text-fg-2 focus-visible:opacity-100"
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      </div>

      <Collapse open={open} className="flex flex-col gap-0.5">
        <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {projects.map((project) => (
            <SortableProject
              key={project.id}
              project={project}
              items={items}
              active={project.id === activeProjectId}
              onProject={onProject}
            />
          ))}
        </SortableContext>
      </Collapse>

      {adding === area.id && (
        <InlineAdd
          autoFocus
          label="Project name"
          className="ml-[26px] h-7"
          onAdd={async (title) => {
            await onAddProject(area.id, title)
            setAdding(null)
          }}
          onDone={() => setAdding(null)}
        />
      )}
    </div>
  )
}

function SortableProject({
  project,
  items,
  active,
  onProject,
}: {
  project: Item
  items: Item[]
  active: boolean
  onProject: (id: string) => void
}) {
  const sortable = useSortable({ id: project.id, data: { type: 'project' }, transition: SLIDE })
  const style: CSSProperties = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }
  const { done, total } = taskCounts(items, project.id)
  const finished = project.status === 'done' || project.status === 'dropped'

  return (
    <button
      ref={sortable.setNodeRef}
      style={style}
      {...sortable.attributes}
      {...sortable.listeners}
      onClick={() => onProject(project.id)}
      aria-current={active ? 'true' : undefined}
      className={`relative flex h-7 shrink-0 items-center gap-2 rounded-control pr-2 pl-[34px] text-left transition-colors duration-100 ${
        sortable.isDragging
          ? 'bg-hover [&>*]:invisible'
          : active
            ? 'font-medium text-fg'
            : `${finished ? 'text-fg-3' : 'text-fg-2'} hover:bg-hover`
      }`}
    >
      {/* One highlight that slides to whichever project is open. */}
      {active && !sortable.isDragging && (
        <motion.span layoutId="sidebar-project" transition={spring.snappy} className="absolute inset-0 rounded-control bg-selected" />
      )}
      <Target
        size={15}
        strokeWidth={1.75}
        className={`relative transition-colors duration-100 ${active ? 'text-accent' : ''}`}
        aria-hidden="true"
      />
      <span className="relative flex-1 truncate">{project.title}</span>
      {total > 0 && <span className="relative text-label font-normal text-fg-3">{`${done}/${total}`}</span>}
    </button>
  )
}
