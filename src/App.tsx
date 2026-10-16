// The app shell: sidebar on the window's vibrancy, solid panels on the right.
// Layout follows the design canvas linked in CLAUDE.md.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from './lib/motion'
import { childrenOf, type Item, type TaskStatus } from './lib/api'
import { trailOf } from './lib/items'
import { useActions } from './lib/useActions'
import { useLibrary } from './lib/useLibrary'
import { Sidebar, type Section } from './components/Sidebar'
import { ScopeView, type Layout } from './components/ScopeView'
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
  // The open area, project or milestone page.
  const [chosenScope, setChosenScope] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>('list')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [shownArea, setShownArea] = useState<string | undefined>()
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

  // Until you pick one, show the first project (or the first area if there
  // are no projects). If the chosen one disappears (deleted, or in Finder),
  // fall back the same way.
  const areas = childrenOf(items, null)
  const firstProject = areas.flatMap((a) => childrenOf(items, a.id)).find((i) => i.kind === 'project')
  const chosen = chosenScope ? byId.get(chosenScope) : undefined
  const scope =
    chosen && (chosen.kind === 'area' || chosen.kind === 'project' || chosen.kind === 'milestone')
      ? chosen
      : (firstProject ?? areas[0])
  // Where the open page sits, for the sidebar highlight.
  const trail = scope ? trailOf(items, scope.id) : []
  const area = trail[0]
  const project = trail.find((i) => i.kind === 'project')
  const selected = selectedId ? byId.get(selectedId) : undefined

  // Areas you open stay open. The open project's area opens whenever the open
  // project changes (or moves to another area), so you can always see it.
  if (area?.id !== shownArea) {
    setShownArea(area?.id)
    if (area && !expanded.has(area.id)) setExpanded(new Set(expanded).add(area.id))
  }

  const toggleArea = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openScope = (id: string) => {
    setSection('tasks')
    setChosenScope(id)
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
    if (!scope) {
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
        <ScopeView
          items={items}
          scope={scope}
          onOpen={openScope}
          layout={layout}
          onLayout={setLayout}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onCycleStatus={cycleStatus}
          actions={actions}
        />
        {/* The details panel grows in from the right; the project panel
            resizes smoothly instead of jumping. */}
        <AnimatePresence initial={false}>
          {selected && (selected.kind === 'task' || selected.kind === 'milestone') && (
            <motion.div
              key="details"
              initial={{ width: 0, opacity: 0, marginLeft: -8 }}
              animate={{ width: 340, opacity: 1, marginLeft: 0 }}
              exit={{ width: 0, opacity: 0, marginLeft: -8 }}
              transition={spring.smooth}
              className="flex shrink-0 justify-end overflow-hidden"
            >
              <DetailsPanel
                items={items}
                item={selected}
                parent={selected.parent ? byId.get(selected.parent) : undefined}
                onSelect={setSelectedId}
                actions={actions}
              />
            </motion.div>
          )}
        </AnimatePresence>
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
        areaId={scope?.kind === 'area' ? scope.id : null}
        onOpen={openScope}
        expanded={expanded}
        onToggleArea={toggleArea}
        onQuickCapture={() => setDialog('capture')}
        onSettings={() => setDialog('settings')}
        onAddArea={(title) => actions.create('area', null, title)}
        onAddProject={async (areaId, title) => {
          const id = await actions.create('project', areaId, title)
          if (id) openScope(id)
        }}
        actions={actions}
      />

      <main className="flex min-w-0 flex-1 py-2 pr-2">
        {/* Switching sections fades the new one in quickly. */}
        <motion.div
          key={needsFolder ? 'folder' : section}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.snappy}
          className="flex min-w-0 flex-1 gap-2"
        >
          {content()}
        </motion.div>
      </main>

      {dialog === 'capture' && <QuickCapture onCapture={actions.capture} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <Settings dataFolder={snapshot?.dataFolder ?? null} onClose={() => setDialog(null)} onFolderChanged={reload} />
      )}
    </div>
  )
}
