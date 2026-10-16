// Docs: the notes tree on the left, the open page on the right.
// Pages are edited as rich text and saved as markdown (MarkdownEditor.tsx).

import { useState } from 'react'
import { childrenOf, type Item } from '../lib/api'
import type { Actions } from '../lib/useActions'
import { BodyEditor, EditableTitle, InlineAdd, Menu } from './controls'
import { itemMenu } from './itemMenu'
import { Panel, PanelHeader } from './ui'

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
  // Until you open one, show the first page. (The page tree lives in the
  // sidebar while you're in Docs; see Sidebar.tsx.)
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
                placeholder="Start writing, or type / for blocks"
                tone="normal"
                className="min-h-[200px] text-[14px]"
                // "/page": a subpage of this page, linked by its file name
                // (a relative link, so it also works in other markdown apps).
                onCreatePage={async (title) => {
                  const id = await actions.create('note', note.id, title)
                  return id ? encodeURI(`${title}.md`) : null
                }}
                onOpenPage={(href) => {
                  const title = decodeURI(href.split('/').pop() ?? '').replace(/\.md$/, '')
                  // A subpage of this page first, then any page with that name.
                  const page =
                    items.find((i) => i.kind === 'note' && i.parent === note.id && i.title === title) ??
                    items.find((i) => i.kind === 'note' && i.title === title)
                  if (page) onOpen(page.id)
                }}
              />
              {addingSub && (
                <InlineAdd
                  autoFocus
                  label="Subpage name"
                  onAdd={async (title) => {
                    const id = await actions.create('note', note.id, title)
                    setAddingSub(false)
                    if (id) onOpen(id)
                  }}
                  onDone={() => setAddingSub(false)}
                />
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
