// The left column: quick capture, the three sections, the areas tree, settings.
// It sits on the window's vibrancy (no panel behind it).

import { useState, type ReactNode } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Folder,
  Layers,
  ListChecks,
  PanelLeft,
  Plus,
  Settings,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import { icon, taskCounts } from '../lib/items'
import { InlineAdd } from './controls'
import { SectionLabel } from './ui'

export type Section = 'unsorted' | 'tasks' | 'docs'

interface Props {
  items: Item[]
  unsortedCount: number
  section: Section
  onSection: (section: Section) => void
  projectId: string | null
  onProject: (id: string) => void
  expanded: Set<string>
  onToggleArea: (id: string) => void
  onQuickCapture: () => void
  onSettings: () => void
  onAddArea: (title: string) => Promise<unknown>
  onAddProject: (areaId: string, title: string) => Promise<unknown>
}

export function Sidebar(props: Props) {
  const { items, unsortedCount, section, onSection, projectId, onProject, expanded, onToggleArea } = props
  const areas = childrenOf(items, null)
  // Where an inline "add" field is open: 'area' for a new area, or an area id for a new project.
  const [adding, setAdding] = useState<string | null>(null)

  return (
    <nav aria-label="Sidebar" className="flex w-sidebar shrink-0 flex-col gap-3.5 pt-3.5 pr-2.5 pb-3 pl-3">
      {/* Top row: room for the traffic lights, and a drag handle for the window. */}
      <div data-tauri-drag-region className="flex h-5 items-center justify-end">
        <button
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
          className="flex rounded-md p-1 text-fg-3 transition-colors duration-150 hover:bg-hover hover:text-fg-2"
        >
          <PanelLeft {...icon} />
        </button>
      </div>

      <button
        onClick={props.onQuickCapture}
        className="flex h-8 items-center gap-2 rounded-row border border-border bg-field px-2.5 text-left text-fg-2 transition-colors duration-150 hover:text-fg"
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

        {areas.map((area) => {
          const open = expanded.has(area.id) || adding === area.id
          const projects = childrenOf(items, area.id)
          return (
            <div key={area.id} className="flex flex-col gap-0.5">
              <div className="group relative flex">
                <button
                  onClick={() => onToggleArea(area.id)}
                  aria-expanded={open}
                  className="flex h-7 flex-1 items-center gap-1.5 rounded-control px-2 text-left text-fg transition-colors duration-150 hover:bg-hover"
                >
                  {open ? (
                    <ChevronDown size={14} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight size={14} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
                  )}
                  <Folder size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
                  <span className="truncate">{area.title}</span>
                </button>
                <span className="absolute top-1 right-1">
                  <AddButton label={`Add a project to ${area.title}`} onClick={() => setAdding(area.id)} />
                </span>
              </div>

              {open &&
                projects.map((project) => {
                  const active = section === 'tasks' && project.id === projectId
                  const { done, total } = taskCounts(items, project.id)
                  const finished = project.status === 'done' || project.status === 'dropped'
                  return (
                    <button
                      key={project.id}
                      onClick={() => onProject(project.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex h-7 items-center gap-2 rounded-control pr-2 pl-[34px] text-left transition-colors duration-150 ${
                        active ? 'bg-selected font-medium text-fg' : `${finished ? 'text-fg-3' : 'text-fg-2'} hover:bg-hover`
                      }`}
                    >
                      <Target size={15} strokeWidth={1.75} className={active ? 'text-accent' : ''} aria-hidden="true" />
                      <span className="flex-1 truncate">{project.title}</span>
                      {total > 0 && <span className="text-label font-normal text-fg-3">{`${done}/${total}`}</span>}
                    </button>
                  )
                })}

              {adding === area.id && (
                <InlineAdd
                  autoFocus
                  label="Project name"
                  className="ml-[26px] h-7"
                  onAdd={async (title) => {
                    await props.onAddProject(area.id, title)
                    setAdding(null)
                  }}
                  onDone={() => setAdding(null)}
                />
              )}
            </div>
          )
        })}

        {adding === 'area' && (
          <InlineAdd
            autoFocus
            label="Area name"
            className="h-7"
            onAdd={async (title) => {
              await props.onAddArea(title)
              setAdding(null)
            }}
            onDone={() => setAdding(null)}
          />
        )}
        {areas.length === 0 && adding !== 'area' && (
          <button onClick={() => setAdding('area')} className="px-2.5 py-1 text-left text-fg-3 hover:text-fg-2">
            Add an area
          </button>
        )}
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
      className="flex rounded-md p-0.5 text-fg-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-hover hover:text-fg-2 focus-visible:opacity-100"
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
      className={`flex h-[30px] w-full items-center gap-2.5 rounded-control px-2.5 text-left transition-colors duration-150 ${
        active ? 'bg-hover font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'
      }`}
    >
      <Icon {...icon} />
      {children}
    </button>
  )
}
