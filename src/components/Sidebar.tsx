// The left column: quick capture, the overviews, the areas tree, settings.
// It sits on the window's vibrancy (no panel behind it).
//
// One tree for everything: areas → projects → pages (AreaTree.tsx). The three
// rows above it are overviews: Unsorted, every project (Tasks), every page
// (Pages).

import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { spring } from '../lib/motion'
import { FileText, Layers, ListChecks, PanelLeft, Plus, Settings, Trash2, type LucideIcon } from 'lucide-react'
import type { Item } from '../lib/api'
import { icon } from '../lib/items'
import { isMac, keys } from '../lib/platform'
import type { Actions } from '../lib/useActions'
import { AreaTree, type Adding } from './AreaTree'
import { MossWordmark } from './Brand'
import { SectionLabel } from './ui'

/** The overviews at the top of the sidebar. */
export type Overview = 'unsorted' | 'tasks' | 'pages' | 'trash'

interface Props {
  items: Item[]
  unsortedCount: number
  /** Things in the trash; the Trash row shows above Settings while there are any. */
  trashCount: number
  /** The open overview, or null when an area, project or page is open. */
  overview: Overview | null
  onOverview: (overview: Overview) => void
  /** The highlighted row in the tree: the open area, project (also for its milestones) or page. */
  openId: string | null
  /** Opens an area, project or page. */
  onOpen: (id: string) => void
  expanded: Set<string>
  onToggle: (id: string) => void
  collapsedPages: Set<string>
  onTogglePage: (id: string) => void
  onQuickCapture: () => void
  onSettings: () => void
  onToggleSidebar: () => void
  /** Creates an area, project or page and opens it. */
  onAdd: (kind: 'area' | 'project' | 'page', parent: string | null, title: string) => Promise<unknown>
  actions: Actions
}

export function Sidebar(props: Props) {
  const { items, unsortedCount, overview, onOverview } = props
  const [adding, setAdding] = useState<Adding>(null)

  return (
    <nav aria-label="Sidebar" className="flex w-sidebar shrink-0 flex-col gap-3.5 pt-2.5 pr-2.5 pb-2.5 pl-3">
      {/* Top row: the traffic lights (on a Mac), the app's name, and a drag
          handle for the window. The name doesn't take clicks, so dragging
          there moves the window. */}
      <div data-tauri-drag-region className="flex h-5 items-center">
        <span
          className={`pointer-events-none flex items-center gap-1.5 select-none ${isMac ? 'pl-20' : 'pl-1'}`}
        >
          <MossWordmark className=" h-[15px] w-auto" />
        </span>
        <span data-tauri-drag-region className="flex-1 self-stretch" />
        <button
          onClick={props.onToggleSidebar}
          aria-label="Hide sidebar"
          title={`Hide sidebar (${keys('\\')})`}
          className="flex rounded-md p-1 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg-2"
        >
          <PanelLeft {...icon} />
        </button>
      </div>

      <button
        onClick={props.onQuickCapture}
        className="flex h-8 items-center gap-2 rounded-row border border-border bg-field px-2.5 text-left text-fg-2 transition-colors duration-100 hover:text-fg"
      >
        <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="flex-1">Quick capture</span>
        <kbd className="font-mono text-label font-normal text-fg-3">{keys('N')}</kbd>
      </button>

      <div className="flex flex-col gap-0.5">
        <NavItem Icon={Layers} active={overview === 'unsorted'} onClick={() => onOverview('unsorted')}>
          Unsorted
          {unsortedCount > 0 && (
            <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-1.5 text-label text-fg">
              {unsortedCount}
            </span>
          )}
        </NavItem>
        <NavItem Icon={ListChecks} active={overview === 'tasks'} onClick={() => onOverview('tasks')}>
          Tasks
        </NavItem>
        <NavItem Icon={FileText} active={overview === 'pages'} onClick={() => onOverview('pages')}>
          Pages
        </NavItem>
      </div>

      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        <div className="group flex items-center pr-1 pb-1.5 pl-2.5">
          <SectionLabel className="flex-1">Areas</SectionLabel>
          <AddButton label="Add an area" onClick={() => setAdding({ kind: 'area' })} />
        </div>
        <AreaTree
          items={items}
          openId={props.openId}
          onOpen={props.onOpen}
          expanded={props.expanded}
          onToggle={props.onToggle}
          collapsedPages={props.collapsedPages}
          onTogglePage={props.onTogglePage}
          adding={adding}
          setAdding={setAdding}
          onAdd={props.onAdd}
          actions={props.actions}
        />
      </div>

      <div className="mt-auto flex flex-col gap-0.5">
        <NavItem Icon={Trash2} active={overview === 'trash'} onClick={() => onOverview('trash')}>
          Trash
          {props.trashCount > 0 && <span className="ml-auto text-label font-normal text-fg-3">{props.trashCount}</span>}
        </NavItem>
        <NavItem Icon={Settings} active={false} onClick={props.onSettings}>
          Settings
        </NavItem>
      </div>
    </nav>
  )
}

/** A small "+" that appears when hovering its row. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex rounded-md p-0.5 text-fg-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:bg-hover hover:text-fg-2 focus-visible:opacity-100"
    >
      <Plus size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}

function NavItem({
  Icon,
  active,
  onClick,
  children,
}: {
  Icon: LucideIcon
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-[30px] w-full items-center gap-2.5 rounded-control px-2.5 text-left transition-colors duration-100 ${
        active ? 'font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'
      }`}
    >
      {active && (
        <motion.span layoutId="sidebar-section" transition={spring.snappy} className="absolute inset-0 rounded-control bg-hover" />
      )}
      <span className="relative flex flex-1 items-center gap-2.5">
        <Icon {...icon} />
        {children}
      </span>
    </button>
  )
}
