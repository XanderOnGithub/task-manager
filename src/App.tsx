// The app shell: sidebar on the window's vibrancy, solid panels on the right.
// Layout follows the design canvas linked in CLAUDE.md.

import { useEffect, useState } from 'react'
import { childrenOf, type Item, type TaskStatus } from './lib/api'
import { useActions } from './lib/useActions'
import { useLibrary } from './lib/useLibrary'
import { Sidebar, type Section } from './components/Sidebar'
import { ProjectView, type ProjectLayout } from './components/ProjectView'
import { DetailsPanel } from './components/DetailsPanel'
import { UnsortedView } from './components/Unsorted'
import { DocsView } from './components/Docs'
import { ChooseFolder, QuickCapture, Settings } from './components/Dialogs'
import { InlineAdd } from './components/controls'
import { Panel } from './components/ui'

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' }

export default function App() {
  const { snapshot, error, needsFolder, byId, reload } = useLibrary()
  const actions = useActions(reload)

  const [section, setSection] = useState<Section>('tasks')
  const [chosenProject, setChosenProject] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [layout, setLayout] = useState<ProjectLayout>('list')
  const [toggledAreas, setToggledAreas] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<'capture' | 'settings' | null>(null)

  // ⌘N opens Quick capture from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setDialog('capture')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = snapshot?.items ?? []

  // Until you pick one, show the first project. If the chosen one disappears
  // (deleted, or in Finder), fall back the same way.
  const firstProject = childrenOf(items, null)
    .flatMap((a) => childrenOf(items, a.id))
    .find((i) => i.kind === 'project')
  const chosen = chosenProject ? byId.get(chosenProject) : undefined
  const project = chosen?.kind === 'project' ? chosen : firstProject
  const area = project?.parent ? byId.get(project.parent) : undefined
  const selected = selectedId ? byId.get(selectedId) : undefined

  // The open project's area starts expanded; clicking an area flips it.
  const expanded = new Set(
    items.filter((i) => i.kind === 'area' && (i.id === area?.id) !== toggledAreas.has(i.id)).map((i) => i.id),
  )

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

  const cycleStatus = (task: Item) =>
    void actions.setStatus(task, NEXT_STATUS[(task.status as TaskStatus | null) ?? 'todo'])

  const content = () => {
    if (needsFolder) return <ChooseFolder onChosen={reload} />
    if (error || !snapshot) {
      return (
        <Panel label="Loading" className="flex-1 items-center justify-center text-fg-3">
          {error ?? 'Loading'}
        </Panel>
      )
    }
    if (section === 'unsorted') return <UnsortedView entries={snapshot.unsorted} items={items} actions={actions} />
    if (section === 'docs') {
      return <DocsView items={items} byId={byId} noteId={noteId} onOpen={setNoteId} actions={actions} />
    }
    if (!project) {
      return (
        <Panel label="No projects" className="flex-1 items-center justify-center">
          <div className="flex w-[280px] flex-col gap-2 text-center text-fg-3">
            {childrenOf(items, null).length === 0 ? (
              <>
                <p>Add an area to start, like Home or School.</p>
                <InlineAdd label="Area name" onAdd={(title) => actions.create('area', null, title)} />
              </>
            ) : (
              <p>Add a project with the + next to an area.</p>
            )}
          </div>
        </Panel>
      )
    }
    return (
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
          actions={actions}
        />
        {selected && (selected.kind === 'task' || selected.kind === 'milestone') && (
          <DetailsPanel
            items={items}
            item={selected}
            parent={selected.parent ? byId.get(selected.parent) : undefined}
            onSelect={setSelectedId}
            actions={actions}
          />
        )}
      </>
    )
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
        onQuickCapture={() => setDialog('capture')}
        onSettings={() => setDialog('settings')}
        onAddArea={(title) => actions.create('area', null, title)}
        onAddProject={async (areaId, title) => {
          const id = await actions.create('project', areaId, title)
          if (id) openProject(id)
        }}
      />

      <main className="flex min-w-0 flex-1 gap-2 py-2 pr-2">{content()}</main>

      {dialog === 'capture' && <QuickCapture onCapture={actions.capture} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <Settings dataFolder={snapshot?.dataFolder ?? null} onClose={() => setDialog(null)} onFolderChanged={reload} />
      )}
    </div>
  )
}
