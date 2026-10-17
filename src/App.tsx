// The app shell: sidebar on the window's vibrancy, solid panels on the right.
// Layout follows the design canvas linked in CLAUDE.md.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from './lib/motion'
import { childrenOf, type Item, type TaskStatus } from './lib/api'
import { trailOf } from './lib/items'
import { NEXT_STATUS } from './lib/lanes'
import { requestAdd, requestRename, type AddWhat } from './lib/requests'
import { itemMenu } from './components/itemMenu'
import { ContextMenu, type MenuItem } from './components/controls'
import { isMac, keys } from './lib/platform'
import { readPref, writePref } from './lib/prefs'
import {
  ArrowUpRight,
  FilePlus,
  Flag,
  Target,
  FileText,
  Layers,
  ListChecks,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Settings as SettingsIcon,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { play, setSoundSettings, soundSettings } from './lib/sounds'
import { saveTheme } from './lib/theme'
import { CommandPalette, type PaletteAction } from './components/CommandPalette'
import { useActions } from './lib/useActions'
import { useLibrary } from './lib/useLibrary'
import { Sidebar, type Overview } from './components/Sidebar'
import { ScopeView, type Layout } from './components/ScopeView'
import { DetailsPanel } from './components/DetailsPanel'
import { UnsortedView } from './components/Unsorted'
import { PagesOverview, PageView } from './components/Pages'
import { TrashView } from './components/Trash'
import { useTrash } from './lib/useTrash'
import { useLaunchCheck } from './lib/updates'
import { ConfirmHost, QuickCapture, Settings } from './components/Dialogs'
import { Onboarding } from './components/Onboarding'
import { Panel } from './components/ui'

/** Matches --spacing-sidebar in tokens.css. */
const SIDEBAR_WIDTH = 244


export default function App() {
  const { snapshot, error, needsFolder, byId, reload } = useLibrary()
  const actions = useActions(reload, snapshot?.items ?? [])
  const trash = useTrash(snapshot)
  useLaunchCheck()

  // What's open: an overview (Unsorted, Tasks, Pages), or an area, project,
  // milestone or page by id. `page` remembers which overview to fall back to
  // if the open item disappears (deleted, or removed in Finder).
  const [view, setView] = useState<{ overview: Overview } | { id: string; page: boolean }>({ overview: 'tasks' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>('list')
  // Sidebar tree: open areas (and projects showing their pages), and pages with folded subpages.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set())
  const [revealed, setRevealed] = useState<string | undefined>()
  const [dialog, setDialog] = useState<'capture' | 'settings' | 'search' | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => readPref('sidebarOpen', true))
  const toggleSidebar = () =>
    setSidebarOpen((open) => {
      writePref('sidebarOpen', !open)
      return !open
    })

  // ⌘N opens Quick capture from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setDialog('capture')
      }
      // ⌘K opens search (or closes it).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setDialog((d) => {
          if (d !== 'search') play('open')
          return d === 'search' ? null : 'search'
        })
      }
      // ⌘\ hides or shows the sidebar.
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setSidebarOpen((open) => {
          writePref('sidebarOpen', !open)
          return !open
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = snapshot?.items ?? []

  const open = 'id' in view ? byId.get(view.id) : undefined
  const overview: Overview | null = open ? null : 'overview' in view ? view.overview : view.page ? 'pages' : 'tasks'
  const trail = open ? trailOf(items, open.id) : []
  // The open area, project or milestone, for task views and "+ Task".
  const scope = open && open.kind !== 'page' ? open : undefined
  const selected = selectedId ? byId.get(selectedId) : undefined
  // What the sidebar highlights: a milestone shows as its project.
  const sidebarOpenId = open?.kind === 'milestone' ? (open.parent ?? null) : (open?.id ?? null)

  // Whenever something new opens, unfold the sidebar down to it, so you can
  // always see where you are. (Folding things yourself afterwards sticks.)
  if (open?.id !== revealed) {
    setRevealed(open?.id)
    if (open) {
      const above = trail.slice(0, -1)
      // Its area (or the area itself), and its project if it's a page.
      const toOpen = trail.filter((i) => i.kind === 'area' || (i.kind === 'project' && open.kind === 'page'))
      if (toOpen.some((i) => !expanded.has(i.id))) setExpanded(new Set([...expanded, ...toOpen.map((i) => i.id)]))
      if (above.some((i) => collapsedPages.has(i.id))) {
        setCollapsedPages(new Set([...collapsedPages].filter((id) => !above.some((i) => i.id === id))))
      }
    }
  }

  const toggleIn = (setter: typeof setExpanded) => (id: string) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openOverview = (o: Overview) => {
    setView({ overview: o })
    setSelectedId(null)
  }

  // Opens anything by id: areas, projects, milestones and pages open
  // themselves; a task opens its milestone or project with the task selected.
  const openId = (id: string) => {
    const item = byId.get(id)
    if (!item) return
    if (item.kind === 'task') {
      if (item.parent) setView({ id: item.parent, page: false })
      setSelectedId(item.id)
      return
    }
    setView({ id, page: item.kind === 'page' })
    setSelectedId(null)
  }
  const openItem = (item: Item) => openId(item.id)

  // Where a new page goes from ⌘K: the open area or project, next to the open
  // page, or a milestone's project.
  const pagePlace = open
    ? open.kind === 'page' || open.kind === 'milestone'
      ? open.parent
        ? byId.get(open.parent)
        : undefined
      : open.kind === 'area' || open.kind === 'project'
        ? open
        : undefined
    : undefined

  const paletteActions: PaletteAction[] = [
    { id: 'capture', label: 'Quick capture', Icon: Plus, keywords: 'add new unsorted', shortcut: keys('N'), run: () => setDialog('capture') },
    { id: 'unsorted', label: 'Go to Unsorted', Icon: Layers, keywords: 'inbox', run: () => openOverview('unsorted') },
    { id: 'tasks', label: 'Go to Tasks', Icon: ListChecks, keywords: 'projects all board', run: () => openOverview('tasks') },
    { id: 'pages', label: 'Go to Pages', Icon: FileText, keywords: 'docs notes all', run: () => openOverview('pages') },
    {
      id: 'sidebar',
      label: sidebarOpen ? 'Hide sidebar' : 'Show sidebar',
      Icon: PanelLeft,
      keywords: 'toggle',
      shortcut: keys('\\'),
      run: toggleSidebar,
    },
    {
      id: 'sounds',
      label: soundSettings().on ? 'Turn sounds off' : 'Turn sounds on',
      Icon: soundSettings().on ? VolumeX : Volume2,
      keywords: 'mute audio',
      run: () => {
        const on = !soundSettings().on
        setSoundSettings({ ...soundSettings(), on })
        if (on) play('complete')
      },
    },
    { id: 'light', label: 'Light appearance', Icon: Sun, keywords: 'theme mode', run: () => saveTheme('light') },
    { id: 'dark', label: 'Dark appearance', Icon: Moon, keywords: 'theme mode', run: () => saveTheme('dark') },
    { id: 'system', label: 'Match system appearance', Icon: Monitor, keywords: 'theme mode auto', run: () => saveTheme('system') },
    { id: 'settings', label: 'Settings', Icon: SettingsIcon, keywords: 'preferences folder', run: () => setDialog('settings') },
  ]

  // Actions made from what you typed.
  const typedActions = (text: string): PaletteAction[] => {
    if (!text) return []
    const out: PaletteAction[] = [
      { id: 'capture-text', label: `Add “${text}” to Unsorted`, Icon: Layers, run: () => void actions.capture(text) },
    ]
    // A new task goes where "+ Task" would put it: the open milestone, or the
    // open project's first open milestone, or the project itself.
    const home =
      scope?.kind === 'milestone'
        ? scope
        : scope?.kind === 'project'
          ? (childrenOf(items, scope.id).find((c) => c.kind === 'milestone' && c.status !== 'done') ??
            (childrenOf(items, scope.id).some((c) => c.kind === 'milestone') ? undefined : scope))
          : undefined
    if (home) {
      out.push({
        id: 'task-text',
        label: `New task “${text}” in ${home.title}`,
        Icon: Plus,
        run: () => void actions.create('task', home.id, text).then(() => openId(home.id)),
      })
    }
    if (pagePlace) {
      out.push({
        id: 'page-text',
        label: `New page “${text}” in ${pagePlace.title}`,
        Icon: FilePlus,
        run: () => void actions.create('page', pagePlace.id, text).then((id) => id && openId(id)),
      })
    }
    return out
  }

  // Right-click on any row (it carries data-item): open it, or its ⋯ menu.
  const menuFor = (target: HTMLElement): (MenuItem | 'divider')[] | null => {
    const id = target.closest<HTMLElement>('[data-item]')?.dataset.item
    const item = id ? byId.get(id) : undefined
    if (!item) return null
    const add = (what: AddWhat) => () => {
      openId(item.id)
      requestAdd(item.id, what)
    }
    return [
      { label: 'Open', Icon: ArrowUpRight, onSelect: () => openId(item.id) },
      ...newItems(item, add),
      'divider',
      ...itemMenu(item, actions, () => {
        openId(item.id)
        requestRename(item.id)
      }),
    ]
  }

  // "New …" in the right-click menu: only what can go inside this item. A
  // project holds milestones or loose tasks, never both (see CLAUDE.md).
  const newItems = (item: Item, add: (what: AddWhat) => () => void): MenuItem[] => {
    const children = childrenOf(items, item.id)
    switch (item.kind) {
      case 'area':
        return [
          { label: 'New project', Icon: Target, onSelect: add('project') },
          { label: 'New page', Icon: FilePlus, onSelect: add('page') },
        ]
      case 'project': {
        const hasMilestones = children.some((c) => c.kind === 'milestone')
        const hasTasks = children.some((c) => c.kind === 'task')
        return [
          ...(hasMilestones ? [] : [{ label: 'New task', Icon: Plus, onSelect: add('task') }]),
          ...(hasTasks ? [] : [{ label: 'New milestone', Icon: Flag, onSelect: add('milestone') }]),
          { label: 'New page', Icon: FilePlus, onSelect: add('page') },
        ]
      }
      case 'milestone':
        return [{ label: 'New task', Icon: Plus, onSelect: add('task') }]
      case 'page':
        return [{ label: 'New subpage', Icon: FilePlus, onSelect: add('page') }]
      default:
        return []
    }
  }

  const cycleStatus = (task: Item) =>
    void actions.setStatus(task, NEXT_STATUS[(task.status as TaskStatus | null) ?? 'todo'])

  const content = () => {
    if (error || !snapshot) {
      return (
        <Panel label="Loading" className="flex-1 items-center justify-center text-fg-3">
          {error ?? 'Loading'}
        </Panel>
      )
    }
    if (overview === 'unsorted') return <UnsortedView entries={snapshot.unsorted} items={items} actions={actions} />
    if (overview === 'trash') return <TrashView entries={trash} actions={actions} />
    if (overview === 'pages') return <PagesOverview items={items} onOpen={openId} actions={actions} />
    if (open?.kind === 'page') return <PageView key={open.id} items={items} page={open} onOpen={openId} actions={actions} />
    return (
      <>
        <ScopeView
          items={items}
          scope={scope ?? null}
          onOpen={openId}
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

  // First launch: no folder yet, so the welcome screens fill the window.
  if (needsFolder) {
    return (
      <>
        <Onboarding onDone={reload} />
        <ContextMenu menuFor={() => null} />
      </>
    )
  }

  return (
    // On a Mac the background is see-through so the blur behind the window
    // shows; other systems draw no blur, so they get the same color, solid.
    <div className={`flex h-full ${isMac ? 'bg-window' : 'bg-window-solid'}`}>
      {/* The sidebar slides shut to zero width. Its contents keep their size
          and get clipped, so nothing reflows while it moves. */}
      <motion.div
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={spring.smooth}
        className="flex shrink-0 overflow-hidden"
        inert={!sidebarOpen}
      >
        <Sidebar
          items={items}
          unsortedCount={snapshot?.unsorted.length ?? 0}
          trashCount={trash.length}
          overview={overview}
          onOverview={openOverview}
          openId={sidebarOpenId}
          onOpen={openId}
          expanded={expanded}
          onToggle={toggleIn(setExpanded)}
          collapsedPages={collapsedPages}
          onTogglePage={toggleIn(setCollapsedPages)}
          onToggleSidebar={toggleSidebar}
          onQuickCapture={() => setDialog('capture')}
          onSettings={() => setDialog('settings')}
          onAdd={async (kind, parent, title) => {
            const id = await actions.create(kind, parent, title)
            if (id && kind !== 'area') openId(id)
          }}
          actions={actions}
        />

      </motion.div>

      {/* With the sidebar hidden, a button to bring it back sits in the
          top-left corner (after the traffic lights on a Mac), and the first
          panel's header makes room for it. */}
      <AnimatePresence>
        {!sidebarOpen && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring.snappy}
            onClick={toggleSidebar}
            aria-label="Show sidebar"
            title={`Show sidebar (${keys('\\')})`}
            className={`fixed top-[19px] z-20 flex rounded-md p-1 text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg-2 ${
              isMac ? 'left-[84px]' : 'left-4'
            }`}
          >
            <PanelLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      <main
        className={`flex min-w-0 flex-1 py-2 pr-2 transition-[padding] duration-150 ease-snappy ${
          sidebarOpen
            ? ''
            : `pl-2 ${isMac ? '[&>div>section:first-child>header]:pl-[112px]' : '[&>div>section:first-child>header]:pl-12'}`
        }`}
      >
        {/* Switching sections fades the new one in quickly. */}
        <motion.div
          key={needsFolder ? 'folder' : (overview ?? (open?.kind === 'page' ? 'page' : 'scope'))}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.snappy}
          className="flex min-w-0 flex-1 gap-2"
        >
          {content()}
        </motion.div>
      </main>

      <AnimatePresence>
        {dialog === 'search' && (
          <CommandPalette
            key="search"
            items={items}
            actions={paletteActions}
            makeActions={typedActions}
            onOpenItem={openItem}
            onClose={() => setDialog(null)}
          />
        )}
      </AnimatePresence>
      <ContextMenu menuFor={menuFor} />
      <ConfirmHost />
      {dialog === 'capture' && <QuickCapture onCapture={actions.capture} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <Settings dataFolder={snapshot?.dataFolder ?? null} onClose={() => setDialog(null)} onFolderChanged={reload} />
      )}
    </div>
  )
}
