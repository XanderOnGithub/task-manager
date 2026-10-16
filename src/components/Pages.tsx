// Pages: an open page, and the lists of pages.
//
// - PageView: one page, edited as rich text and saved as markdown
//   (MarkdownEditor.tsx). Its breadcrumb runs area → project → parent pages.
// - PagesOverview: every area with its pages and its projects' pages (the
//   "Pages" row in the sidebar).
// - PageSection: the same list for one area or project, under its tasks in
//   the area's or project's List view.
//
// The lists look like the task lists (same rows, same section headings), so
// moving between them never feels like a different app.

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { ArrowUpRight, Folder, Target } from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import { trailOf } from '../lib/items'
import { usePref } from '../lib/prefs'
import type { Actions } from '../lib/useActions'
import { BodyEditor, EditableTitle, InlineAdd, Menu } from './controls'
import type { TextStats } from './MarkdownEditor'
import { PageIconPicker } from './EmojiPicker'
import { itemMenu } from './itemMenu'
import { Collapse, ListRow } from './motion'
import { FoldButton, PageIcon } from './PageTree'
import { Panel, PanelHeader, SectionLabel } from './ui'

// ---------------------------------------------------------------------------
// One page
// ---------------------------------------------------------------------------

export function PageView({
  items,
  page,
  onOpen,
  actions,
}: {
  items: Item[]
  page: Item
  /** Opens an area, project or page (breadcrumb, links). */
  onOpen: (id: string) => void
  actions: Actions
}) {
  const [renaming, setRenaming] = useState(0)
  const [addingSub, setAddingSub] = useState(false)
  const [stats, setStats] = useState<TextStats | null>(null)
  const [showCount] = usePref('wordCount', true)
  // Breadcrumb: the area, project and parent pages, top first.
  const trail = trailOf(items, page.id).slice(0, -1)

  return (
    <Panel label="Page" className="relative flex-1 animate-fade-in">
      <PanelHeader>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-fg-3">
          {trail.map((p) => (
            <span key={p.id} className="flex min-w-0 items-center gap-1.5 @max-[34rem]/header:hidden">
              <button onClick={() => onOpen(p.id)} className="truncate transition-colors duration-100 hover:text-fg-2">
                {p.title}
              </button>
              <span aria-hidden="true">/</span>
            </span>
          ))}
          <span className="truncate text-fg">{page.title}</span>
        </nav>
        <Menu
          items={[
            { label: 'Add a subpage', onSelect: () => setAddingSub(true) },
            'divider',
            ...itemMenu(page, actions, () => setRenaming((n) => n + 1)),
          ]}
        />
      </PanelHeader>
      <div className="flex flex-1 justify-center overflow-y-auto px-12 py-8">
        <div className="flex w-full max-w-[720px] flex-col gap-4">
          <div className="group/title flex items-center">
            <PageIconPicker page={page} onChange={(icon) => void actions.setIcon(page, icon)} />
            <EditableTitle
              key={`${page.id}:${renaming}`}
              editing={renaming > 0}
              value={page.title}
              onSave={(title) => actions.rename(page, title)}
              className="w-fit text-title"
            />
          </div>
          <BodyEditor
            item={page}
            onSave={(body) => actions.writeBody(page, body)}
            placeholder="Start writing, or type / for blocks"
            onStats={showCount ? setStats : undefined}
            tone="normal"
            className="min-h-[200px] text-[14px]"
            // "/page": a subpage of this page, linked by its file name
            // (a relative link, so it also works in other markdown apps).
            onCreatePage={async (title) => {
              const id = await actions.create('page', page.id, title)
              return id ? encodeURI(`${title}.md`) : null
            }}
            onOpenPage={(href) => {
              const title = decodeURI(href.split('/').pop() ?? '').replace(/\.md$/, '')
              // A subpage of this page first, then a page next to it, then any page with that name.
              const named = items.filter((i) => i.kind === 'page' && i.title === title)
              const target =
                named.find((i) => i.parent === page.id) ?? named.find((i) => i.parent === page.parent) ?? named[0]
              if (target) onOpen(target.id)
            }}
          />
          {addingSub && (
            <InlineAdd
              autoFocus
              label="Subpage name"
              onAdd={async (title) => {
                const id = await actions.create('page', page.id, title)
                setAddingSub(false)
                if (id) onOpen(id)
              }}
              onDone={() => setAddingSub(false)}
            />
          )}
        </div>
      </div>
      {showCount && stats && <WordCount stats={stats} />}
    </Panel>
  )
}

/** The quiet count in the page's bottom-right corner. With text selected, it counts the selection. */
function WordCount({ stats }: { stats: TextStats }) {
  const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
  const shown = stats.selection ?? stats
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute right-3 bottom-3 rounded-control bg-panel/90 px-2 py-1 text-meta font-normal text-fg-3 tabular-nums"
    >
      {plural(shown.words, 'word')} · {plural(shown.characters, 'character')}
      {stats.selection && ' selected'}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Every page
// ---------------------------------------------------------------------------

export function PagesOverview({
  items,
  onOpen,
  actions,
}: {
  items: Item[]
  onOpen: (id: string) => void
  actions: Actions
}) {
  const areas = childrenOf(items, null)
  const count = items.filter((i) => i.kind === 'page').length

  return (
    <Panel label="Pages" className="flex-1">
      <PanelHeader>
        <span className="flex-1 truncate text-fg">Pages</span>
      </PanelHeader>
      <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-title">Pages</h1>
          <span className="text-meta font-normal text-fg-3">
            {count === 1 ? '1 page' : `${count} pages`} in {areas.length === 1 ? '1 area' : `${areas.length} areas`}
          </span>
        </div>
        {areas.map((area) => (
          <section key={area.id} className="flex flex-col gap-1.5">
            <OwnerHeading owner={area} onOpen={onOpen} />
            <PageList items={items} owner={area} withProjects onOpen={onOpen} actions={actions} />
          </section>
        ))}
        {areas.length === 0 && <p className="text-fg-3">Add an area to start, like Home or School.</p>}
      </div>
    </Panel>
  )
}

/** "Pages" under an area's or project's tasks, in its List view. */
export function PageSection({
  items,
  owner,
  onOpen,
  actions,
}: {
  items: Item[]
  owner: Item
  onOpen: (id: string) => void
  actions: Actions
}) {
  return (
    <section aria-label="Pages" className="flex flex-col gap-1.5">
      <SectionLabel className="pl-1">Pages</SectionLabel>
      <PageList items={items} owner={owner} withProjects={owner.kind === 'area'} onOpen={onOpen} actions={actions} />
    </section>
  )
}

/** An area or project as a heading in an overview list. Clicking it opens it. */
export function OwnerHeading({ owner, onOpen }: { owner: Item; onOpen: (id: string) => void }) {
  const Icon = owner.kind === 'area' ? Folder : Target
  return (
    <button
      onClick={() => onOpen(owner.id)}
      className="group flex h-row w-fit items-center gap-2 rounded-row pr-2 pl-1 text-left"
    >
      <Icon size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
      <span className={owner.kind === 'area' ? 'text-heading' : 'font-semibold'}>{owner.title}</span>
      <ArrowUpRight
        size={14}
        strokeWidth={2}
        className="text-fg-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  )
}

/**
 * An area's or project's pages, nested. With `withProjects`, each of the
 * area's projects that has pages follows as its own small section.
 */
function PageList({
  items,
  owner,
  withProjects = false,
  onOpen,
  actions,
}: {
  items: Item[]
  owner: Item
  withProjects?: boolean
  onOpen: (id: string) => void
  actions: Actions
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const projects = withProjects
    ? childrenOf(items, owner.id).filter((p) => items.some((i) => i.kind === 'page' && i.parent === p.id))
    : []

  return (
    <div className="flex flex-col gap-0.5">
      <PageListRows items={items} parent={owner.id} depth={0} onOpen={onOpen} collapsed={collapsed} onToggle={toggle} />
      {projects.map((project) => (
        <div key={project.id} className="flex flex-col gap-0.5 pt-1.5">
          <OwnerHeading owner={project} onOpen={onOpen} />
          <PageListRows items={items} parent={project.id} depth={0} onOpen={onOpen} collapsed={collapsed} onToggle={toggle} />
        </div>
      ))}
      <InlineAdd
        label={`Add a page to ${owner.title}`}
        onAdd={async (title) => {
          const id = await actions.create('page', owner.id, title)
          if (id) onOpen(id)
        }}
      />
    </div>
  )
}

function PageListRows({
  items,
  parent,
  depth,
  onOpen,
  collapsed,
  onToggle,
}: {
  items: Item[]
  parent: string
  depth: number
  onOpen: (id: string) => void
  collapsed: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <AnimatePresence initial={false}>
      {childrenOf(items, parent, true).map((page) => {
        const subpages = childrenOf(items, page.id, true).length
        const open = !collapsed.has(page.id)
        return (
          <ListRow key={page.id} className="flex flex-col gap-0.5">
            <div
              className="flex h-row items-center gap-1 rounded-row pr-2.5 transition-colors duration-100 hover:bg-hover"
              style={{ paddingLeft: 4 + depth * 20 }}
            >
              <span className="flex w-[18px] justify-center">
                {subpages > 0 && <FoldButton title={page.title} open={open} onClick={() => onToggle(page.id)} />}
              </span>
              <button onClick={() => onOpen(page.id)} className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left">
                <PageIcon page={page} />
                <span className="truncate">{page.title}</span>
                {subpages > 0 && (
                  <span className="text-meta font-normal text-fg-3">
                    {subpages === 1 ? '1 subpage' : `${subpages} subpages`}
                  </span>
                )}
              </button>
            </div>
            {subpages > 0 && (
              <Collapse open={open} className="flex flex-col gap-0.5">
                <PageListRows
                  items={items}
                  parent={page.id}
                  depth={depth + 1}
                  onOpen={onOpen}
                  collapsed={collapsed}
                  onToggle={onToggle}
                />
              </Collapse>
            )}
          </ListRow>
        )
      })}
    </AnimatePresence>
  )
}
