// The left column: quick capture, the overviews, the areas tree, settings.
// It sits on the window's vibrancy (no panel behind it).
//
// One tree for everything: areas → projects → pages (AreaTree.tsx). The three
// rows above it are overviews: Unsorted, every project (Tasks), every page
// (Pages).

import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { spring } from '../../shared/motion/springs'
import { AlertCircle, CalendarCheck, CircleAlert, ArrowDownToLine, Cloud, FileText, Layers, ListChecks, PanelLeft, Pause, Plus, RefreshCw, Settings, Trash2, type LucideIcon } from 'lucide-react'
import { installUpdate, useUpdates } from '../../platform/updates'
import { ago } from '../../domain/dates'
import { useSync } from '../sync/useSync'
import type { Item } from '../../platform/api'
import { icon } from '../../domain/items'
import { isMac, keys } from '../../platform/os'
import type { Actions } from '../../app/useActions'
import { AreaTree, type Adding } from './AreaTree'
import { MossWordmark } from '../../shared/Brand'
import { SectionLabel } from '../../shared/ui'

/** The overviews at the top of the sidebar. */
export type Overview = 'unsorted' | 'today' | 'tasks' | 'pages' | 'trash' | 'issues'

interface Props {
  items: Item[]
  unsortedCount: number
  /** Tasks overdue or due today; the Today row shows the number. */
  dueCount: number
  /** Things in the trash; the Trash row shows above Settings while there are any. */
  trashCount: number
  /** Problems found in the data folder; the Issues row shows while there are any. */
  issueCount: number
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
  onAdd: (kind: 'area' | 'project' | 'page', parent: string | null, title: string) => Promise<boolean>
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
      <div data-tauri-drag-region className="-mt-2.5 flex h-[30px] items-center pt-2.5">
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
        <NavItem Icon={CalendarCheck} active={overview === 'today'} onClick={() => onOverview('today')}>
          Today
          {props.dueCount > 0 && (
            <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-1.5 text-label text-fg">
              {props.dueCount}
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

      <div className="sidebar-scroll flex min-h-0 flex-col gap-0.5 overflow-y-auto">
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
        <UpdateRow />
        <SyncRow onClick={props.onSettings} />
        {props.issueCount > 0 && (
          <NavItem Icon={CircleAlert} active={overview === 'issues'} onClick={() => onOverview('issues')}>
            Issues
            <span className="ml-auto text-label font-normal text-fg-3">{props.issueCount}</span>
          </NavItem>
        )}
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

/**
 * Git sync status, only while this folder syncs: "Synced 2 min ago", "Syncing",
 * "Paused", or "Sync failed" in red. Opens Settings, where Sync lives.
 */
function SyncRow({ onClick }: { onClick: () => void }) {
  const { info, now } = useSync()
  if (!info?.repo) return null
  const failed = !!info.error && !info.syncing
  const label = info.paused
    ? 'Paused'
    : info.syncing
      ? 'Syncing'
      : failed
        ? 'Sync failed'
        : info.pending > 0
          ? 'Changes waiting'
          : info.lastSynced
            ? `Synced ${ago(info.lastSynced, now)}`
            : 'Sync on'
  const Icon = info.paused ? Pause : info.syncing ? RefreshCw : failed ? AlertCircle : Cloud
  return (
    <button
      onClick={onClick}
      title={failed ? info.error ?? undefined : `Syncing with ${info.repo}`}
      className={`flex h-[30px] w-full items-center gap-2.5 rounded-control px-2.5 text-left text-meta font-normal transition-colors duration-100 hover:bg-hover ${
        failed ? 'text-danger' : 'text-fg-3 hover:text-fg-2'
      }`}
    >
      <Icon {...icon} className={info.syncing && !info.paused ? 'animate-sync' : undefined} />
      <span className="flex-1 truncate">{label}</span>
    </button>
  )
}

/** "Update to 0.1.3" when a new version is out; shows progress while it installs. */
function UpdateRow() {
  const update = useUpdates()
  if (update.status !== 'available' && update.status !== 'installing') return null
  const installing = update.status === 'installing'
  return (
    <button
      onClick={() => void installUpdate()}
      disabled={installing}
      className="flex h-[30px] w-full items-center gap-2.5 rounded-control px-2.5 text-left font-medium text-accent transition-colors duration-100 hover:bg-hover disabled:hover:bg-transparent"
    >
      <ArrowDownToLine {...icon} />
      <span className="flex-1">{installing ? 'Updating' : `Update to ${update.version}`}</span>
      {installing && update.percent !== null && (
        <span className="text-label font-normal text-fg-3 tabular-nums">{update.percent}%</span>
      )}
    </button>
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
