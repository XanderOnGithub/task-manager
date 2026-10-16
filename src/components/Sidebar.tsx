// The left column: quick capture, the three sections, the areas tree, settings.
// It sits on the window's vibrancy (no panel behind it).

import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { spring } from '../lib/motion'
import { BookOpen, Layers, ListChecks, PanelLeft, Plus, Settings, type LucideIcon } from 'lucide-react'
import type { Item } from '../lib/api'
import { icon } from '../lib/items'
import { isMac } from '../lib/platform'
import type { Actions } from '../lib/useActions'
import { AreaTree } from './AreaTree'
import { MossMark } from './Brand'
import { SectionLabel } from './ui'

export type Section = 'unsorted' | 'tasks' | 'docs'

interface Props {
  items: Item[]
  unsortedCount: number
  section: Section
  onSection: (section: Section) => void
  /** The open project (also when one of its milestones is open). */
  projectId: string | null
  /** The open area, when an area page is open. */
  areaId: string | null
  /** Opens an area or project page. */
  onOpen: (id: string) => void
  expanded: Set<string>
  onToggleArea: (id: string) => void
  onQuickCapture: () => void
  onSettings: () => void
  onAddArea: (title: string) => Promise<unknown>
  onAddProject: (areaId: string, title: string) => Promise<unknown>
  actions: Actions
}

export function Sidebar(props: Props) {
  const { items, unsortedCount, section, onSection, projectId, areaId, onOpen, expanded, onToggleArea } = props
  // Where an inline "add" field is open: 'area' for a new area, or an area id for a new project.
  const [adding, setAdding] = useState<string | null>(null)

  return (
    <nav aria-label="Sidebar" className="flex w-sidebar shrink-0 flex-col gap-3.5 pt-3.5 pr-2.5 pb-3 pl-3">
      {/* Top row: the traffic lights (on a Mac), the app's name, and a drag
          handle for the window. The name doesn't take clicks, so dragging
          there moves the window. */}
      <div data-tauri-drag-region className="flex h-5 items-center">
        <span
          className={`pointer-events-none flex items-center gap-1.5 select-none ${isMac ? 'pl-[62px]' : 'pl-1'}`}
        >
          <MossMark className="h-[15px] w-auto" />
          <span className="text-[14px] leading-none font-semibold tracking-tight text-fg">moss</span>
        </span>
        <span data-tauri-drag-region className="flex-1 self-stretch" />
        <button
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
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
        <kbd className="font-mono text-label font-normal text-fg-3">⌘N</kbd>
      </button>

      <div className="flex flex-col gap-0.5">
        <NavItem Icon={Layers} active={section === 'unsorted'} onClick={() => onSection('unsorted')}>
          Unsorted
          {unsortedCount > 0 && (
            <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-1.5 text-label text-fg">
              {unsortedCount}
            </span>
          )}
        </NavItem>
        <NavItem Icon={ListChecks} active={section === 'tasks'} onClick={() => onSection('tasks')}>
          Tasks
        </NavItem>
        <NavItem Icon={BookOpen} active={section === 'docs'} onClick={() => onSection('docs')}>
          Docs
        </NavItem>
      </div>

      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        <div className="group flex items-center pr-1 pb-1.5 pl-2.5">
          <SectionLabel className="flex-1">Areas</SectionLabel>
          <AddButton label="Add an area" onClick={() => setAdding('area')} />
        </div>

        <AreaTree
          items={items}
          activeProjectId={section === 'tasks' ? projectId : null}
          activeAreaId={section === 'tasks' ? areaId : null}
          onOpen={onOpen}
          expanded={expanded}
          onToggleArea={onToggleArea}
          adding={adding}
          setAdding={setAdding}
          onAddArea={props.onAddArea}
          onAddProject={props.onAddProject}
          actions={props.actions}
        />
      </div>

      <div className="mt-auto">
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
