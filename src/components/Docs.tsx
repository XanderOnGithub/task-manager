// Docs: the notes tree on the left, the open page on the right.
// Plain-text editing for now; the markdown editor comes in M6.

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { childrenOf, type Item } from '../lib/api'
import type { Actions } from '../lib/useActions'
import { BodyEditor, EditableTitle, InlineAdd, Menu } from './controls'
import { itemMenu } from './itemMenu'
import { Panel, PanelHeader, SectionLabel } from './ui'

export function DocsView({
  items,
  byId,
  noteId,
  onOpen,
  actions,
}: {
  items: Item[]
  byId: Map<string, Item>
  noteId: string | null
  onOpen: (id: string | null) => void
  actions: Actions
}) {
  // Until you open one, show the first page.
  const note = (noteId ? byId.get(noteId) : undefined) ?? childrenOf(items, null, true)[0]
  const [renaming, setRenaming] = useState(0)
  const [addingSub, setAddingSub] = useState(false)

  // Breadcrumb: the page's parents, top first.
  const trail: Item[] = []
  for (let p = note?.parent ? byId.get(note.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined) {
    trail.unshift(p)
  }

  return (
    <>
      <Panel label="Pages" className="w-[260px] shrink-0">
        <PanelHeader>
          <span className="flex-1">Docs</span>
        </PanelHeader>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <NoteTree items={items} parent={null} depth={0} openId={note?.id ?? null} onOpen={onOpen} />
          <InlineAdd
            label="Add a page"
            onAdd={async (title) => {
              const id = await actions.create('note', null, title)
              if (id) onOpen(id)
            }}
          />
        </div>
      </Panel>

      {note ? (
        <Panel label="Page" className="flex-1 animate-fade-in">
          <PanelHeader>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-fg-3">
              {trail.map((p) => (
                <span key={p.id} className="flex items-center gap-1.5">
                  <button onClick={() => onOpen(p.id)} className="truncate hover:text-fg-2">
                    {p.title}
                  </button>
                  <span aria-hidden="true">/</span>
                </span>
              ))}
              <span className="truncate text-fg">{note.title}</span>
            </div>
            <Menu
              items={[
                { label: 'Add a subpage', onSelect: () => setAddingSub(true) },
                'divider',
                ...itemMenu(note, actions, () => setRenaming((n) => n + 1)),
              ]}
            />
          </PanelHeader>
          <div className="flex flex-1 justify-center overflow-y-auto px-7 py-8">
            <div className="flex w-full max-w-[720px] flex-col gap-4">
              <EditableTitle
                key={`${note.id}:${renaming}`}
                editing={renaming > 0}
                value={note.title}
                onSave={(title) => actions.rename(note, title)}
                className="w-fit text-title"
              />
              <BodyEditor
                item={note}
                onSave={(body) => actions.writeBody(note, body)}
                placeholder="Start writing"
                tone="normal"
                className="min-h-[200px] text-[14px]"
              />
              {(note.isFolder || addingSub) && (
                <div className="flex flex-col gap-1 border-t border-border pt-4">
                  <SectionLabel className="pb-1">Subpages</SectionLabel>
                  {childrenOf(items, note.id, true).map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => onOpen(sub.id)}
                      className="flex h-8 items-center gap-2 rounded-control px-2 text-left transition-colors duration-150 hover:bg-hover"
                    >
                      <FileText size={15} strokeWidth={1.75} className="text-fg-2" aria-hidden="true" />
                      {sub.title}
                    </button>
                  ))}
                  <InlineAdd
                    autoFocus={addingSub}
                    label="Add a subpage"
                    onAdd={async (title) => {
                      await actions.create('note', note.id, title)
                      setAddingSub(false)
                    }}
                    onDone={() => setAddingSub(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </Panel>
      ) : (
        <Panel label="No pages" className="flex-1 items-center justify-center text-fg-3">
          Add a page to start
        </Panel>
      )}
    </>
  )
}

function NoteTree({
  items,
  parent,
  depth,
  openId,
  onOpen,
}: {
  items: Item[]
  parent: string | null
  depth: number
  openId: string | null
  onOpen: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  return (
    <ul className="flex flex-col gap-0.5">
      {childrenOf(items, parent, true).map((note) => {
        const hasChildren = items.some((i) => i.parent === note.id)
        const open = !collapsed.has(note.id)
        return (
          <li key={note.id}>
            <div
              className={`flex h-[30px] items-center gap-1 rounded-control pr-2 transition-colors duration-150 ${
                note.id === openId ? 'bg-selected font-medium' : 'hover:bg-hover'
              }`}
              style={{ paddingLeft: 4 + depth * 16 }}
            >
              {hasChildren ? (
                <button
                  onClick={() =>
                    setCollapsed((c) => {
                      const next = new Set(c)
                      if (next.has(note.id)) next.delete(note.id)
                      else next.add(note.id)
                      return next
                    })
                  }
                  aria-label={open ? `Collapse ${note.title}` : `Expand ${note.title}`}
                  aria-expanded={open}
                  className="flex rounded p-0.5 text-fg-3"
                >
                  {open ? (
                    <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span className="w-[17px]" />
              )}
              <button onClick={() => onOpen(note.id)} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
                <FileText size={15} strokeWidth={1.75} className="shrink-0 text-fg-2" aria-hidden="true" />
                <span className="truncate">{note.title}</span>
              </button>
            </div>
            {hasChildren && open && (
              <NoteTree items={items} parent={note.id} depth={depth + 1} openId={openId} onOpen={onOpen} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
