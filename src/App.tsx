// The app shell: sidebar on the window's vibrancy, solid panels on the right.
// Layout follows the design canvas linked in CLAUDE.md.

import { useSyncOnFocus } from './features/sync/useSync'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring } from './shared/motion/springs'
import { onSyncConflicts, type Item, type TaskStatus } from './platform/api'
import { setBlockedItems } from './app/blockedStore'
import { useToast } from './shared/toast/toast'
import { childrenOf, trailOf } from './domain/items'
import { NEXT_STATUS } from './domain/lanes'
import { requestAdd, requestRename, type AddWhat } from './app/requests'
import { itemMenu } from './shared/itemMenu'
import { ContextMenu, type MenuItem } from './shared/controls'
import { isMac, keys } from './platform/os'
import { readPref, writePref } from './platform/prefs'
import {
  ArrowUpRight,
  FilePlus,
  Flag,
  Target,
  CalendarCheck,
  CircleAlert,
  Undo2,
  FileText,
  Layers,
  ListChecks,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Settings as SettingsIcon,
  Sun,
  SunMoon,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { play, setSoundSettings, soundSettings } from './sound/sounds'
import { saveTheme, toggleTheme } from './platform/theme'
import { CommandPalette, type PaletteAction } from './features/search/CommandPalette'
import { useActions } from './app/useActions'
import { useLibrary } from './app/useLibrary'
import { Sidebar, type Overview } from './features/navigation/Sidebar'
import { ScopeView, type Layout } from './features/tasks/ScopeView'
import { DetailsPanel } from './features/tasks/DetailsPanel'
import { UnsortedView } from './features/capture/Unsorted'
import { PagesOverview, PageView } from './features/pages/Pages'
import { TrashView } from './features/trash/Trash'
import { IssuesView } from './features/issues/Issues'
import { TodayView } from './features/today/Today'
import { dueNowCount } from './features/today/plan'
import { useTrash } from './features/trash/useTrash'
import { useRowKeys } from './features/navigation/rowKeys'
import { useLaunchCheck } from './platform/updates'
import { QuickCapture } from './features/capture/QuickCapture'
import { HistoryDialog } from './features/history/History'
import { Settings } from './features/settings/Settings'
import { ConfirmHost } from './shared/confirm/ConfirmHost'
import { Onboarding } from './features/onboarding/Onboarding'
import { Panel } from './shared/ui'

/** What each overview is called in the window title. */
const OVERVIEW_TITLES: Record<Overview, string> = {
  unsorted: 'Unsorted',
  today: 'Today',
  tasks: 'Tasks',
  pages: 'Pages',
  trash: 'Trash',
  issues: 'Issues',
}

/** Matches --spacing-sidebar in tokens.css. */
const SIDEBAR_WIDTH = 244


export default function App() {
  const { snapshot, error, needsFolder, byId, loads, reload } = useLibrary()
  useSyncOnFocus()
  const actions = useActions(reload, snapshot?.items ?? [])
  const toast = useToast()
  // Rows ask this store what their task waits on (app/blockedStore.ts).
  const libraryItems = snapshot?.items
  useLayoutEffect(() => setBlockedItems(libraryItems ?? []), [libraryItems])

  // A sync that kept both versions of a file says so, and where to look.
  useEffect(() => {
    const stop = onSyncConflicts((count) =>
      toast({ message: `Kept both versions of ${count === 1 ? 'a file' : `${count} files`}. See Issues.` }),
    )
    return () => void stop.then((off) => off()).catch(() => {})
  }, [toast])
  const trash = useTrash(snapshot, loads)
  const mainRef = useRef<HTMLElement>(null)
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
  const [dialog, setDialog] = useState<'capture' | 'settings' | 'search' | 'history' | null>(null)
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
    { id: 'history', label: 'Recent changes', Icon: Undo2, keywords: 'undo history', run: () => setDialog('history') },
    { id: 'unsorted', label: 'Go to Unsorted', Icon: Layers, keywords: 'inbox', run: () => openOverview('unsorted') },
    { id: 'today', label: 'Go to Today', Icon: CalendarCheck, keywords: 'due overdue upcoming', run: () => openOverview('today') },
    { id: 'tasks', label: 'Go to Tasks', Icon: ListChecks, keywords: 'projects all board', run: () => openOverview('tasks') },
    { id: 'pages', label: 'Go to Pages', Icon: FileText, keywords: 'docs notes all', run: () => openOverview('pages') },
    ...(snapshot?.issues.length
      ? [{ id: 'issues', label: 'Go to Issues', Icon: CircleAlert, keywords: 'problems errors files', run: () => openOverview('issues') }]
      : []),
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
    { id: 'toggle-theme', label: 'Toggle dark mode', Icon: SunMoon, keywords: 'theme light switch appearance', run: toggleTheme },
    { id: 'light', label: 'Light mode', Icon: Sun, keywords: 'theme appearance', run: () => saveTheme('light') },
    { id: 'dark', label: 'Dark mode', Icon: Moon, keywords: 'theme appearance', run: () => saveTheme('dark') },
    { id: 'system', label: 'Match system mode', Icon: Monitor, keywords: 'theme appearance auto light dark', run: () => saveTheme('system') },
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

  // Stable, so memoized rows don't redraw just because App did.
  const cycleStatus = useCallback(
    (task: Item) => actions.setStatus(task, NEXT_STATUS[(task.status as TaskStatus | null) ?? 'todo']),
    [actions],
  )

  // Arrows, Enter, S, Delete and Esc on the focused row (lib/rowKeys.ts).
  useRowKeys({
    byId,
    open: openId,
    select: setSelectedId,
    selectedId,
    cycleStatus,
    trash: actions.trash,
  })

  // What the window is called, and what a screen reader hears when you move
  // between sections (the page itself doesn't reload, so nothing else says so).
  const viewTitle = open ? open.title : overview ? OVERVIEW_TITLES[overview] : 'Tasks'
  useEffect(() => {
    document.title = `${viewTitle} · Moss`
  }, [viewTitle])

  const content = () => {
    if (error || !snapshot) {
      return (
        <Panel label="Loading" className="flex-1 items-center justify-center text-fg-3">
          {error ?? 'Loading'}
        </Panel>
      )
    }
    if (overview === 'unsorted') return <UnsortedView entries={snapshot.unsorted} items={items} actions={actions} />
    if (overview === 'today') return <TodayView items={items} onOpen={openId} onCycleStatus={cycleStatus} />
    if (overview === 'trash') return <TrashView entries={trash} actions={actions} />
    if (overview === 'issues') return <IssuesView issues={snapshot.issues} onOpen={openId} />
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
      {/* First stop for the keyboard: jump past the sidebar to the content. */}
      <button
        onClick={() => mainRef.current?.focus()}
        className="sr-only z-50 rounded-control border border-border-menu bg-menu px-3 py-1.5 text-fg shadow-menu focus:not-sr-only focus:fixed focus:top-2 focus:left-1/2 focus:-translate-x-1/2"
      >
        Skip to content
      </button>
      <div role="status" className="sr-only">
        {viewTitle}
      </div>
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
          dueCount={dueNowCount(items)}
          trashCount={trash.length}
          issueCount={snapshot?.issues.length ?? 0}
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

      {/* A strip along the top edge of the window, like the title bar in other
          apps: drag it to move the window (the sidebar's top row and every
          panel header do the same). */}
      <div data-tauri-drag-region aria-hidden="true" className="fixed inset-x-0 top-0 z-10 h-2" />

      <main
        ref={mainRef}
        tabIndex={-1}
        className={`flex min-w-0 flex-1 py-2 pr-2 outline-none transition-[padding] duration-150 ease-snappy ${
          sidebarOpen
            ? ''
            : `pl-2 ${isMac ? '[&>div>section:first-child>header]:pl-[112px]' : '[&>div>section:first-child>header]:pl-12'}`
        }`}
      >
        {/* Switching sections fades the new one in. Opacity only: a slide here
            read as the whole panel jumping. */}
        <motion.div
          key={needsFolder ? 'folder' : (overview ?? (open?.kind === 'page' ? 'page' : 'scope'))}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
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
      {dialog === 'history' && <HistoryDialog onClose={() => setDialog(null)} />}
      {dialog === 'capture' && <QuickCapture onCapture={actions.capture} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <Settings dataFolder={snapshot?.dataFolder ?? null} onClose={() => setDialog(null)} onFolderChanged={reload} />
      )}
    </div>
  )
}
