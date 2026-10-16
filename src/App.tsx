// The app shell: sidebar on the window's vibrancy, solid panels on the right.
// Layout follows the design canvas linked in CLAUDE.md.

import { useState } from 'react'
import { childrenOf, setField, type Item, type TaskStatus } from './lib/api'
import { useLibrary } from './lib/useLibrary'
import { Sidebar, type Section } from './components/Sidebar'
import { ProjectView, type ProjectLayout } from './components/ProjectView'
import { DetailsPanel } from './components/DetailsPanel'
import { DocsView, UnsortedView } from './components/SimpleViews'
import { Panel } from './components/ui'

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' }

export default function App() {
  const { snapshot, error, byId, reload } = useLibrary()

  const [section, setSection] = useState<Section>('tasks')
  const [chosenProject, setChosenProject] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layout, setLayout] = useState<ProjectLayout>('list')
  const [toggledAreas, setToggledAreas] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const items = snapshot?.items ?? []

  // Until you pick one, show the first project. If the chosen one disappears
  // (deleted in Finder), fall back the same way.
  const firstProject = childrenOf(items, null)
    .flatMap((a) => childrenOf(items, a.id))
    .find((i) => i.kind === 'project')
  const project = (chosenProject && byId.get(chosenProject)) || firstProject
  const area = project?.parent ? byId.get(project.parent) : undefined
  const selected = selectedId ? byId.get(selectedId) : undefined

  // The open project's area starts expanded; clicking an area flips it.
  const expanded = new Set(items.filter((i) => i.kind === 'area' && (i.id === area?.id) !== toggledAreas.has(i.id)).map((i) => i.id))

  const toggleArea = (id: string) =>
    setToggledAreas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openProject = (id: string) => {
    setSection('tasks')
    setChosenProject(id)
    setSelectedId(null)
  }

  const cycleStatus = async (task: Item) => {
    try {
      await setField(task.id, 'status', NEXT_STATUS[(task.status as TaskStatus) ?? 'todo'])
      setActionError(null)
      await reload()
    } catch (e) {
      setActionError(String(e))
    }
  }

  return (
    <div className="flex h-full bg-window">
      <Sidebar
        items={items}
        unsortedCount={snapshot?.unsorted.length ?? 0}
        section={section}
        onSection={setSection}
        projectId={project?.id ?? null}
        onProject={openProject}
        expanded={expanded}
        onToggleArea={toggleArea}
      />

      <main className="flex min-w-0 flex-1 gap-2 py-2 pr-2">
        {error || !snapshot ? (
          <Panel label="Loading" className="flex-1 items-center justify-center text-fg-3">
            {error ?? 'Loading'}
          </Panel>
        ) : section === 'unsorted' ? (
          <UnsortedView entries={snapshot.unsorted} />
        ) : section === 'docs' ? (
          <DocsView items={items} />
        ) : project ? (
          <>
            <ProjectView
              items={items}
              project={project}
              area={area}
              layout={layout}
              onLayout={setLayout}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              onCycleStatus={cycleStatus}
            />
            {selected && (selected.kind === 'task' || selected.kind === 'milestone') && (
              <DetailsPanel
                items={items}
                item={selected}
                parent={selected.parent ? byId.get(selected.parent) : undefined}
                onSelect={setSelectedId}
              />
            )}
          </>
        ) : (
          <Panel label="No projects" className="flex-1 items-center justify-center text-fg-3">
            No projects yet
          </Panel>
        )}
      </main>

      {actionError && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 flex h-10 -translate-x-1/2 animate-toast-in items-center rounded-[10px] border border-border-menu bg-menu px-3.5 text-danger shadow-menu"
        >
          {actionError}
        </div>
      )}
    </div>
  )
}
