// The sidebar tree: areas → projects → pages, all draggable.
//
//   Area            chevron folds it; the name opens the area
//     Project       opens the project's tasks; its chevron (if it has pages) folds them
//       Page        opens the page
//     Page          an area's own pages come after its projects
//
// Dragging:
// - An area: reorder areas (they all fold shut while you do).
// - A project: reorder it, or move it into another area (drop on the area's
//   name to put it first, even if the area is closed). See useTwoLevelDrag.
// - A page: above / inside / below another page, or onto an area or project
//   to move it there. See PageTree.tsx.
// One DndContext holds all three, and the dragged thing's type decides which
// logic runs.

import { useCallback, useContext, useEffect, useMemo, type CSSProperties } from 'react'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  type CollisionDetection,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'motion/react'
import { ChevronDown, FilePlus, Folder, Plus, Target } from 'lucide-react'
import { type Item } from '../../platform/api'
import { childrenOf, taskCounts } from '../../domain/items'
import { collisionFor, dropSettle, SLIDE, useDragSensors } from '../../shared/drag/drag'
import { spring } from '../../shared/motion/springs'
import type { Actions } from '../../app/useActions'
import { useTwoLevelDrag, type Order } from '../../shared/drag/useTwoLevelDrag'
import { InlineAdd, Menu } from '../../shared/controls'
import { Lifted } from '../../shared/drag/Lifted'
import { Collapse } from '../../shared/motion/pieces'
import { INDENT, pageCollision, PageDropContext, TOGGLE, usePageDrag } from '../pages/pageDrag'
import { FoldButton, PageIcon, PageRows, SidebarHighlight } from '../pages/PageTree'

const ROOT = 'areas'
/** Left padding of a page row directly in an area / in a project, so the icons line up with the project icons above them. */
const AREA_PAGE_INDENT = 34 - TOGGLE
const PROJECT_PAGE_INDENT = AREA_PAGE_INDENT + INDENT

/** Where an inline "add" field is open. */
export type Adding = { kind: 'area' } | { kind: 'project' | 'page'; parent: string } | null

interface Props {
  items: Item[]
  /** What the sidebar highlights: the open area, project (also for its milestones) or page. */
  openId: string | null
  /** Opens an area, project or page. */
  onOpen: (id: string) => void
  /** Open areas, and projects showing their pages. */
  expanded: Set<string>
  onToggle: (id: string) => void
  /** Pages whose subpages are folded away. */
  collapsedPages: Set<string>
  onTogglePage: (id: string) => void
  adding: Adding
  setAdding: (adding: Adding) => void
  /** Creates an area, project or page and opens it. */
  onAdd: (kind: 'area' | 'project' | 'page', parent: string | null, title: string) => Promise<unknown>
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
      if (parent && item.kind === 'project' && !props.expanded.has(parent)) props.onToggle(parent)
      return actions.move(item, { id: parent, title: parent ? (byId.get(parent)?.title ?? '') : 'Areas' }, before, from)
    },
    [byId, actions, props],
  )

  const drag = useTwoLevelDrag({ base, rootKey: ROOT, rootParent: null, groupType: 'area', itemType: 'project', commit })
  const pageDrag = usePageDrag(items, actions, (parent) => {
    // Unfold whatever the page landed in, so you can see it there.
    if (byId.get(parent)?.kind === 'page') {
      if (props.collapsedPages.has(parent)) props.onTogglePage(parent)
    } else if (!props.expanded.has(parent)) {
      props.onToggle(parent)
    }
  })
  const areas = (drag.order[ROOT] ?? []).map((id) => byId.get(id)).filter((a): a is Item => !!a)
  const dragged = drag.activeId ? byId.get(drag.activeId) : undefined
  const movingArea = dragged?.kind === 'area'

  // Pages and areas/projects drag differently; the dragged thing's type decides.
  const isPage = (e: { active: { data: { current?: Record<string, unknown> } } }) => e.active.data.current?.type === 'page'
  const collision: CollisionDetection = useMemo(() => {
    const tasksSide = collisionFor({ project: ['area'] })
    return (args) => (args.active.data.current?.type === 'page' ? pageCollision(args) : tasksSide(args))
  }, [])

  // Picking up an area folds every area shut, and that fold animates. dnd-kit
  // normally measures rows once, at pickup, while they're still open and tall,
  // so it would slide the other rows by the old heights and briefly push them
  // past the bottom of the sidebar (the scrollbar flashed). Measuring on every
  // frame of the drag keeps the slide matched to the rows' real size.
  const dragging = !!drag.activeId || !!pageDrag.active
  // And while anything is held, keep the sidebar's scrollbar out of view
  // (base.css): rows moving under the pointer shouldn't make it flicker.
  useEffect(() => {
    if (!dragging) return
    document.documentElement.setAttribute('data-tree-dragging', '')
    return () => document.documentElement.removeAttribute('data-tree-dragging')
  }, [dragging])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={MEASURING}
      onDragStart={(e: DragStartEvent) => (isPage(e) ? pageDrag.onDragStart(e) : drag.onDragStart(e))}
      onDragMove={(e) => isPage(e) && pageDrag.onDragMove(e)}
      onDragOver={(e) => (isPage(e) ? pageDrag.onDragOver(e) : drag.onDragOver(e))}
      onDragEnd={(e) => (isPage(e) ? pageDrag.onDragEnd() : void drag.onDragEnd(e))}
      onDragCancel={(e) => (isPage(e) ? pageDrag.onDragCancel() : drag.onDragCancel())}
    >
      <PageDropContext.Provider value={{ activeId: pageDrag.active?.id ?? null, target: pageDrag.target }}>
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
                  (props.adding?.kind !== 'area' && props.adding?.parent === area.id) ||
                  (!!drag.activeId && (drag.order[area.id] ?? []).includes(drag.activeId)))
              }
              {...props}
            />
          ))}
        </SortableContext>
      </PageDropContext.Provider>

      {props.adding?.kind === 'area' && (
        <InlineAdd
          autoFocus
          label="Area name"
          className="h-7"
          onAdd={async (title) => {
            await props.onAdd('area', null, title)
            props.setAdding(null)
          }}
          onDone={() => props.setAdding(null)}
        />
      )}
      {areas.length === 0 && props.adding?.kind !== 'area' && (
        <button onClick={() => props.setAdding({ kind: 'area' })} className="px-2.5 py-1 text-left text-fg-3 hover:text-fg-2">
          Add an area
        </button>
      )}

      <DragOverlay dropAnimation={dropSettle}>
        {/* Same padding as the row it came from, so nothing jumps on pickup. */}
        {dragged && drag.active && (
          <Lifted grab={drag.active.grab} width={drag.active.width} className="rounded-control">
            {dragged.kind === 'area' ? (
              <div className="flex h-7 items-center gap-1 rounded-control border border-border-menu bg-menu px-2 text-fg">
                <ChevronDown size={14} strokeWidth={2} className="-rotate-90 text-fg-3" aria-hidden="true" />
                <span className="flex min-w-0 items-center gap-1.5">
                  <Folder size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
                  <span className="truncate">{dragged.title}</span>
                </span>
              </div>
            ) : (
              <div className="flex h-7 items-center gap-2 rounded-control border border-border-menu bg-menu pr-2 pl-[34px] text-fg">
                <Target size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
                <span className="truncate">{dragged.title}</span>
              </div>
            )}
          </Lifted>
        )}
        {pageDrag.dragged && pageDrag.active && (
          <Lifted grab={pageDrag.active.grab} width={pageDrag.active.width} className="rounded-control">
            <div
              className="flex h-7 items-center gap-2 rounded-control border border-border-menu bg-menu pr-2 text-fg"
              style={{ paddingLeft: pageIndent(pageDrag.dragged, byId) + TOGGLE }}
            >
              <PageIcon page={pageDrag.dragged} />
              <span className="truncate">{pageDrag.dragged.title}</span>
            </div>
          </Lifted>
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** See the comment above the DndContext: re-measure while a drag is going on. */
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }

/** A page row's left padding: deeper under a project, and one step per parent page. */
function pageIndent(page: Item, byId: Map<string, Item>): number {
  let depth = 0
  let parent = page.parent ? byId.get(page.parent) : undefined
  while (parent?.kind === 'page') {
    depth++
    parent = parent.parent ? byId.get(parent.parent) : undefined
  }
  return (parent?.kind === 'project' ? PROJECT_PAGE_INDENT : AREA_PAGE_INDENT) + depth * INDENT
}

function SortableArea({
  area,
  projects,
  open,
  items,
  openId,
  onOpen,
  onToggle,
  expanded,
  collapsedPages,
  onTogglePage,
  adding,
  setAdding,
  onAdd,
  actions,
}: Props & { area: Item; projects: Item[]; open: boolean }) {
  const sortable = useSortable({ id: area.id, data: { type: 'area' }, transition: SLIDE })
  const style: CSSProperties = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }
  const pageTarget = usePageTarget(area.id)
  const active = area.id === openId
  const addingHere = adding && adding.kind !== 'area' && adding.parent === area.id ? adding.kind : null

  return (
    <div ref={sortable.setNodeRef} style={style} className="flex flex-col gap-0.5">
      <div
        data-item={area.id}
        className={`group relative flex h-7 items-center rounded-control transition-colors duration-100 ${
          sortable.isDragging ? 'bg-hover [&>*]:invisible' : pageTarget ? 'bg-selected' : active ? '' : 'hover:bg-hover'
        }`}
      >
        {active && !sortable.isDragging && <SidebarHighlight />}
        {/* The chevron folds the area; the name opens the area's page. */}
        <button
          onClick={() => onToggle(area.id)}
          aria-label={open ? `Collapse ${area.title}` : `Expand ${area.title}`}
          aria-expanded={open}
          className="relative flex h-full items-center pr-1 pl-2 text-fg-3 hover:text-fg-2"
        >
          <motion.span initial={false} animate={{ rotate: open ? 0 : -90 }} transition={spring.snappy} className="flex">
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          </motion.span>
        </button>
        <button
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={() => onOpen(area.id)}
          aria-current={active ? 'true' : undefined}
          className={`relative flex h-full min-w-0 flex-1 items-center gap-1.5 pr-7 text-left text-fg ${active ? 'font-medium' : ''}`}
        >
          <Folder size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
          <span className="truncate">{area.title}</span>
        </button>
        <span className="absolute top-1 right-1">
          <Menu
            label={`Add to ${area.title}`}
            trigger={<AddIcon />}
            items={[
              { label: 'Add a project', Icon: Target, onSelect: () => setAdding({ kind: 'project', parent: area.id }) },
              { label: 'Add a page', Icon: FilePlus, onSelect: () => setAdding({ kind: 'page', parent: area.id }) },
            ]}
          />
        </span>
      </div>

      <Collapse open={open} className="flex flex-col gap-0.5">
        <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {projects.map((project) => (
            <SortableProject
              key={project.id}
              project={project}
              items={items}
              active={project.id === openId}
              openId={openId}
              onOpen={onOpen}
              showPages={expanded.has(project.id) || (adding?.kind === 'page' && adding.parent === project.id)}
              onToggle={onToggle}
              collapsedPages={collapsedPages}
              onTogglePage={onTogglePage}
              adding={adding}
              setAdding={setAdding}
              onAdd={onAdd}
              actions={actions}
            />
          ))}
        </SortableContext>
        {addingHere === 'project' && (
          <AddRow label="Project name" indent={26} onAdd={(title) => onAdd('project', area.id, title)} onDone={() => setAdding(null)} />
        )}
        <PageRows
          items={items}
          parent={area.id}
          indent={AREA_PAGE_INDENT}
          openId={openId}
          onOpen={onOpen}
          collapsed={collapsedPages}
          onToggle={onTogglePage}
          tools={{ actions, adding, setAdding, onAdd }}
        />
        {addingHere === 'page' && (
          <AddRow label="Page name" indent={26} onAdd={(title) => onAdd('page', area.id, title)} onDone={() => setAdding(null)} />
        )}
      </Collapse>
    </div>
  )
}

function SortableProject({
  project,
  items,
  active,
  openId,
  onOpen,
  showPages,
  onToggle,
  collapsedPages,
  onTogglePage,
  adding,
  setAdding,
  onAdd,
  actions,
}: Pick<
  Props,
  'items' | 'openId' | 'onOpen' | 'onToggle' | 'collapsedPages' | 'onTogglePage' | 'adding' | 'setAdding' | 'onAdd' | 'actions'
> & {
  project: Item
  active: boolean
  showPages: boolean
}) {
  const sortable = useSortable({ id: project.id, data: { type: 'project' }, transition: SLIDE })
  const style: CSSProperties = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }
  const pageTarget = usePageTarget(project.id)
  const { done, total } = taskCounts(items, project.id)
  const finished = project.status === 'done' || project.status === 'dropped'
  const hasPages = items.some((i) => i.kind === 'page' && i.parent === project.id)

  return (
    <div ref={sortable.setNodeRef} style={style} className="flex flex-col gap-0.5">
      <div
        data-item={project.id}
        className={`group relative flex h-7 shrink-0 items-center rounded-control transition-colors duration-100 ${
          sortable.isDragging
            ? 'bg-hover [&>*]:invisible'
            : pageTarget
              ? 'bg-selected'
              : active
                ? 'font-medium text-fg'
                : `${finished ? 'text-fg-3' : 'text-fg-2'} hover:bg-hover`
        }`}
      >
        {active && !sortable.isDragging && <SidebarHighlight />}
        {/* Only projects with pages can fold; the chevron sits just left of the icon. */}
        <span className="relative flex w-[34px] shrink-0 justify-end pr-0.5">
          {hasPages && <FoldButton title={project.title} open={showPages} onClick={() => onToggle(project.id)} />}
        </span>
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={() => onOpen(project.id)}
          aria-current={active ? 'true' : undefined}
          className="relative flex h-full min-w-0 flex-1 items-center gap-2 pr-2 text-left"
        >
          <Target
            size={15}
            strokeWidth={1.75}
            className={`transition-colors duration-100 ${active ? 'text-accent' : ''}`}
            aria-hidden="true"
          />
          <span className="flex-1 truncate">{project.title}</span>
          {total > 0 && (
            <span className="text-label font-normal text-fg-3 transition-opacity duration-100 group-hover:opacity-0">{`${done}/${total}`}</span>
          )}
        </button>
        <span className="absolute top-1 right-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => setAdding({ kind: 'page', parent: project.id })}
            aria-label={`Add a page to ${project.title}`}
            title="Add a page"
            className="flex rounded-md p-0.5 text-fg-3 hover:bg-hover hover:text-fg-2"
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      </div>

      <Collapse open={showPages} className="flex flex-col gap-0.5">
        <PageRows
          items={items}
          parent={project.id}
          indent={PROJECT_PAGE_INDENT}
          openId={openId}
          onOpen={onOpen}
          collapsed={collapsedPages}
          onToggle={onTogglePage}
          tools={{ actions, adding, setAdding, onAdd }}
        />
        {adding?.kind === 'page' && adding.parent === project.id && (
          <AddRow label="Page name" indent={42} onAdd={(title) => onAdd('page', project.id, title)} onDone={() => setAdding(null)} />
        )}
      </Collapse>
    </div>
  )
}

/** True while a dragged page would drop into this area or project. */
function usePageTarget(id: string) {
  const { activeId, target } = useContext(PageDropContext)
  return !!activeId && target?.id === id
}

function AddRow({
  label,
  indent,
  onAdd,
  onDone,
}: {
  label: string
  indent: number
  onAdd: (title: string) => Promise<unknown>
  onDone: () => void
}) {
  return (
    <div style={{ marginLeft: indent }}>
      <InlineAdd
        autoFocus
        label={label}
        className="h-7"
        onAdd={async (title) => {
          await onAdd(title)
          onDone()
        }}
        onDone={onDone}
      />
    </div>
  )
}

/** The "+" on a row, shown on hover. */
function AddIcon() {
  return (
    <span className="flex rounded-md p-0.5 text-fg-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100 in-focus-visible:opacity-100 in-aria-expanded:opacity-100 hover:bg-hover hover:text-fg-2">
      <Plus size={14} strokeWidth={2} aria-hidden="true" />
    </span>
  )
}
