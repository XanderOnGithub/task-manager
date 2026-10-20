// Rich text editing that saves plain markdown.
//
// Milkdown (ProseMirror + remark) shows formatted text while you type: `# ` makes
// a heading, `- ` a list, `[ ] ` a checkbox, **bold**, `code`, > quotes, and so
// on. What goes to disk is ordinary markdown, so files stay readable in any
// editor. Styles live in styles/editor.css.
//
// Saving: only after you actually change something (opening a page never
// rewrites it), on blur, and after a short pause while typing. The rules for
// keeping unsaved text safe (retry, one write at a time) are in lib/saveQueue.ts.
//
// On top of that: select text for a small format toolbar, or type "/" for a
// menu of blocks (headings, lists, checklists, dividers, tables, subpages).
// The menus live in editor/EditorMenus.tsx; the block list in editor/blocks.ts.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
} from '@milkdown/kit/core'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import {
  commonmark,
  hardbreakKeymap,
  remarkPreserveEmptyLinePlugin,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { gfm, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { TextSelection } from '@milkdown/kit/prose/state'
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
  findTable,
  goToNextCell,
  isInTable,
} from '@milkdown/kit/prose/tables'
import type { EditorView } from '@milkdown/kit/prose/view'
import { callCommand, replaceAll } from '@milkdown/kit/utils'
import { openUrl } from '@tauri-apps/plugin-opener'
import { play } from '../lib/sounds'
import { matchBlocks, type Block } from './editor/blocks'
import {
  SelectionToolbar,
  EmojiMenu,
  SlashMenu,
  TableBar,
  type MarkAction,
  type SlashState,
  type TableAction,
  type ToolbarState,
} from './editor/EditorMenus'
import { menuPlugin } from './editor/menuPlugin'
import { normalize, toEditor } from '../lib/markdown'
import { SaveQueue } from '../lib/saveQueue'
import { exactShortcode, matchShortcodes } from './editor/emojiShortcodes'

// Milkdown keeps empty paragraphs by writing `<br />` into the file. We'd
// rather keep files clean, so that one piece of the preset is left out.
// Shift+Enter is handled in the key handler below instead of by the preset,
// whose version turns a second break in a row into a new paragraph.
const leftOut: MilkdownPlugin[] = [remarkPreserveEmptyLinePlugin, hardbreakKeymap].flat()
const markdownBasics = commonmark.filter((plugin) => !leftOut.includes(plugin))

/** Word and character counts for the whole text, and for the selection if there is one. */
export interface TextStats {
  words: number
  characters: number
  selection: { words: number; characters: number } | null
}

/** Counts words (runs of non-space) and characters (everything but line breaks) between two positions. */
function countText(doc: EditorView['state']['doc'], from: number, to: number) {
  const text = doc.textBetween(from, to, '\n', '\n')
  return { words: text.match(/\S+/g)?.length ?? 0, characters: [...text.replace(/\n/g, '')].length }
}

export function MarkdownEditor({
  value,
  onSave,
  onSaveError,
  placeholder,
  label,
  className = '',
  onCreatePage,
  onOpenPage,
  onStats,
}: {
  /** The saved markdown. Mount with `key={item.id}` so each item gets its own editor. */
  value: string
  /** Writes the text. Must reject when it couldn't (the text is then kept and retried). */
  onSave: (markdown: string) => Promise<unknown> | void
  /** Called once when saving starts failing, so the person can be told. */
  onSaveError?: (error: unknown) => void
  placeholder: string
  label: string
  className?: string
  /** Makes "/page" available: creates a subpage and returns the link to it (or null). */
  onCreatePage?: (title: string) => Promise<string | null>
  /** Opens a page link (a relative "Name.md" link written by /page). */
  onOpenPage?: (href: string) => void
  /** Called as the text or selection changes, with fresh counts. */
  onStats?: (stats: TextStats) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const editor = useRef<Editor | null>(null)
  // Saving is handled by the queue: it knows what is on disk, what is still
  // waiting, and retries when a write fails.
  const save = useRef(onSave)
  save.current = onSave
  const saveError = useRef(onSaveError)
  saveError.current = onSaveError
  const [queue] = useState(
    () =>
      new SaveQueue(
        normalize(value),
        async (text) => {
          await save.current(text)
        },
        (error) => saveError.current?.(error),
      ),
  )
  const reportStats = useRef(onStats)
  reportStats.current = onStats

  // Menus. The editor reports changes through `bridge`; React draws the menus.
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [naming, setNaming] = useState(false)
  // Where the table the cursor is in sits on screen (for its small toolbar).
  const [tableBar, setTableBar] = useState<{ x: number; y: number } | null>(null)
  // Where Escape closed the "/" menu, so it stays closed for that "/".
  const dismissed = useRef<number | null>(null)
  // ":name" emoji menu: same shape as the "/" menu (range, query, caret).
  const [colon, setColon] = useState<SlashState | null>(null)
  const [colonIndex, setColonIndex] = useState(0)
  const colonDismissed = useRef<number | null>(null)
  const emojiMatches = colon ? matchShortcodes(colon.query) : []
  const blocks = slash ? matchBlocks(slash.query, !!onCreatePage) : []
  // The key handler runs inside ProseMirror, so it reads the latest values here.
  const live = useRef({ slash, blocks, slashIndex, naming, colon, emojiMatches, colonIndex })
  live.current = { slash, blocks, slashIndex, naming, colon, emojiMatches, colonIndex }

  const bridge = useRef({
    update: (view: EditorView) => {
      const { state } = view
      const sel = state.selection
      const focused = view.hasFocus()

      // Counts for the word count in the corner (pages only).
      if (reportStats.current) {
        const all = countText(state.doc, 0, state.doc.content.size)
        reportStats.current({ ...all, selection: sel.empty ? null : countText(state.doc, sel.from, sel.to) })
      }

      // Format toolbar: shows while text is selected (not inside code blocks).
      if (focused && !sel.empty && sel instanceof TextSelection && !sel.$from.parent.type.spec.code) {
        const start = view.coordsAtPos(sel.from)
        const end = view.coordsAtPos(sel.to)
        const has = (mark: string) => {
          const type = state.schema.marks[mark]
          return !!type && state.doc.rangeHasMark(sel.from, sel.to, type)
        }
        setToolbar({
          x: Math.abs(start.top - end.top) < 4 ? (start.left + end.left) / 2 : start.left + 40,
          y: Math.min(start.top, end.top),
          active: { strong: has('strong'), em: has('emphasis'), strike: has('strike_through'), code: has('inlineCode'), link: has('link') },
        })
      } else {
        setToolbar(null)
      }

      // Table toolbar: shows while the cursor is in a table.
      const table = focused && isInTable(state) ? findTable(sel.$from) : undefined
      const tableDom = table ? view.nodeDOM(table.pos) : null
      if (tableDom instanceof HTMLElement) {
        const box = tableDom.getBoundingClientRect()
        setTableBar((prev) => (prev && prev.x === box.left && prev.y === box.top ? prev : { x: box.left, y: box.top }))
      } else {
        setTableBar(null)
      }

      // ":name" emoji menu: a colon at the start of a line or after a space,
      // then at least two letters of an emoji's name (so "10:30" or a lone
      // ":" don't pop it open).
      const $from = sel.$from
      let nextColon: SlashState | null = null
      if (focused && sel.empty && !$from.parent.type.spec.code) {
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
        const match = /(?:^|\s):([a-z0-9_+-]{2,30})$/i.exec(before)
        if (match) {
          const from = $from.pos - match[1].length - 1
          if (colonDismissed.current !== from && matchShortcodes(match[1], 1).length > 0) {
            const caret = view.coordsAtPos($from.pos)
            nextColon = { from, to: $from.pos, query: match[1], x: caret.left, top: caret.top, bottom: caret.bottom }
          }
        } else {
          colonDismissed.current = null
        }
      }
      setColon((prev) => {
        if (prev?.query !== nextColon?.query) setColonIndex(0)
        return nextColon
      })

      // "/" menu: a slash at the start of a line or after a space, followed by
      // what you've typed so far.
      if (live.current.naming) return // asking for a page name: keep the menu
      if (focused && sel.empty && !$from.parent.type.spec.code) {
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
        const match = /(?:^|\s)\/([^\s/]{0,24})$/.exec(before)
        if (match) {
          const from = $from.pos - match[1].length - 1
          if (dismissed.current !== from) {
            const caret = view.coordsAtPos($from.pos)
            setSlash((prev) => {
              if (prev?.query !== match[1]) setSlashIndex(0)
              return { from, to: $from.pos, query: match[1], x: caret.left, top: caret.top, bottom: caret.bottom }
            })
            return
          }
        } else {
          dismissed.current = null
        }
      }
      setSlash(null)
    },
    keyDown: (view: EditorView, event: KeyboardEvent) => {
      // In a table, Tab moves to the next cell (Shift+Tab back). Tab in the
      // last cell adds a row, so you can keep typing down the table.
      if (event.key === 'Tab' && isInTable(view.state)) {
        const dir = event.shiftKey ? -1 : 1
        if (!goToNextCell(dir)(view.state, view.dispatch) && dir === 1) {
          addRowAfter(view.state, view.dispatch)
          goToNextCell(1)(view.state, view.dispatch)
        }
        return true
      }
      // Shift+Enter: a line break, every time you press it. (Milkdown's own
      // version turns a second break in a row into a new paragraph, so
      // pressing it repeatedly seemed to stop working.) On disk each break is
      // a line ending in "\", which markdown keeps. Code blocks and tables
      // keep their own behavior.
      if (event.key === 'Enter' && event.shiftKey && !event.metaKey && !event.ctrlKey && !live.current.slash) {
        const { state } = view
        const br = state.schema.nodes.hardbreak
        if (br && !state.selection.$from.parent.type.spec.code && !isInTable(state)) {
          view.dispatch(state.tr.setMeta('hardbreak', true).replaceSelectionWith(br.create()).scrollIntoView())
          return true
        }
      }
      // Ctrl/⌘+Enter ticks or unticks the checklist item the cursor is in. The
      // boxes are drawn in CSS, so a click toggles them (see toggleCheckbox);
      // this is the way to do it without a mouse.
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        const { state } = view
        const { $from } = state.selection
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth)
          if (node.attrs.checked == null) continue
          view.dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked: !node.attrs.checked }))
          play('check', { pitch: node.attrs.checked ? 0.9 : 1 })
          return true
        }
      }
      // ":name" emoji menu: arrows move, Enter or Tab inserts, Escape closes.
      // Typing the closing ":" of a full name inserts it too, as in Slack.
      const { colon, emojiMatches, colonIndex } = live.current
      if (colon && emojiMatches.length > 0) {
        const insert = (emoji: string) => {
          view.dispatch(view.state.tr.insertText(emoji, colon.from, colon.to).scrollIntoView())
          setColon(null)
          return true
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const step = event.key === 'ArrowDown' ? 1 : -1
          setColonIndex((i) => (i + step + emojiMatches.length) % emojiMatches.length)
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') return insert(emojiMatches[colonIndex].emoji)
        if (event.key === ':') {
          const exact = exactShortcode(colon.query)
          if (exact) return insert(exact)
        }
        if (event.key === 'Escape') {
          colonDismissed.current = colon.from
          setColon(null)
          return true
        }
      }
      const { slash, blocks, slashIndex, naming } = live.current
      if (!slash || naming) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (blocks.length === 0) return false
        const step = event.key === 'ArrowDown' ? 1 : -1
        setSlashIndex((i) => (i + step + blocks.length) % blocks.length)
        return true
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && blocks[slashIndex]) {
        pick.current(blocks[slashIndex])
        return true
      }
      if (event.key === 'Escape') {
        dismissed.current = slash.from
        setSlash(null)
        return true
      }
      return false
    },
  }).current

  /** Runs `fn` with the editor view, if the editor is ready. */
  const withView = (fn: (view: EditorView, ctx: Parameters<Parameters<Editor['action']>[0]>[0]) => void) =>
    editor.current?.action((ctx) => fn(ctx.get(editorViewCtx), ctx))

  /** A soft highlight on the block that just changed, so you see what happened. */
  const flash = (view: EditorView) => {
    const { node } = view.domAtPos(view.state.selection.from)
    const el = (node instanceof Element ? node : node.parentElement)?.closest('p, h1, h2, h3, h4, li, blockquote, pre, table, hr')
    const target = el ?? view.dom.querySelector('hr:last-of-type')
    if (!(target instanceof HTMLElement)) return
    target.classList.remove('md-pop')
    void target.offsetWidth // restart the animation
    target.classList.add('md-pop')
    target.addEventListener('animationend', () => target.classList.remove('md-pop'), { once: true })
  }

  const pick = useRef<(block: Block) => void>(() => {})
  pick.current = (block: Block) => {
    const current = live.current.slash
    if (!current) return
    if (block.id === 'page') {
      setNaming(true)
      return
    }
    withView((view, ctx) => {
      view.dispatch(view.state.tr.delete(current.from, current.to))
      block.run?.(ctx)
      view.focus()
      requestAnimationFrame(() => flash(view))
    })
    play('status', { pitch: 1.1 })
    setSlash(null)
  }

  /** "/page": make the subpage, then put a link to it where the "/" was. */
  const createPage = async (title: string) => {
    const current = live.current.slash
    setNaming(false)
    setSlash(null)
    if (!current || !onCreatePage) return
    const href = await onCreatePage(title)
    withView((view) => {
      const { schema } = view.state
      let tr = view.state.tr.delete(current.from, current.to)
      if (href) {
        const link = schema.marks.link.create({ href })
        tr = tr.insertText(title, current.from).addMark(current.from, current.from + title.length, link)
        tr = tr.insertText(' ', current.from + title.length).removeStoredMark(schema.marks.link)
      }
      view.dispatch(tr)
      view.focus()
      requestAnimationFrame(() => flash(view))
    })
  }

  const toggleMark = (mark: MarkAction) => {
    const command = {
      strong: toggleStrongCommand,
      em: toggleEmphasisCommand,
      strike: toggleStrikethroughCommand,
      code: toggleInlineCodeCommand,
    }[mark]
    editor.current?.action(callCommand(command.key))
    play('status', { pitch: 1.2 })
  }

  const tableAction = (action: TableAction) => {
    withView((view) => {
      const command = { addRow: addRowAfter, addColumn: addColumnAfter, deleteRow, deleteColumn, deleteTable }[action]
      command(view.state, view.dispatch)
      view.focus()
    })
    play(action.startsWith('delete') ? 'delete' : 'status', { pitch: action.startsWith('delete') ? 1.2 : 1.1 })
  }

  const setLink = (href: string | null) => {
    withView((view, ctx) => {
      if (href === null) {
        const { from, to } = view.state.selection
        view.dispatch(view.state.tr.removeMark(from, to, view.state.schema.marks.link))
      } else {
        callCommand(toggleLinkCommand.key, { href })(ctx)
      }
      view.focus()
    })
  }

  // Create the editor once. `value` is only the starting text; later outside
  // changes come in through the effect below.
  useEffect(() => {
    const el = root.current
    if (!el) return
    let destroyed = false
    const made = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, el)
        ctx.set(defaultValueCtx, toEditor(queue.saved))
        // "- item" rather than "* item", the more common style.
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: '-' as const }))
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { 'aria-label': label, 'data-placeholder': placeholder, spellcheck: 'true' },
        }))
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          queue.edit(normalize(markdown, true))
        })
      })
      .use(markdownBasics)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard)
      .use(cursor)
      .use(trailing)
      .use(menuPlugin(bridge))
    void made.create().then((e) => {
      if (destroyed) void e.destroy()
      else editor.current = e
    })
    return () => {
      destroyed = true
      void queue.flush()
      queue.dispose()
      void editor.current?.destroy()
      editor.current = null
    }
    // Made once per mount on purpose (see the comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The file changed somewhere else (another app, a sync). Take it, unless
  // you're in the middle of editing: text that isn't saved yet wins, and is
  // what gets saved next.
  useEffect(() => {
    const next = normalize(value)
    if (queue.dirty || next === queue.saved) return
    queue.adopt(next)
    editor.current?.action(replaceAll(toEditor(next)))
  }, [value, queue])

  // Closing or hiding the window: save what is waiting right now.
  useEffect(() => {
    const flushNow = () => void queue.flush()
    const onHide = () => document.visibilityState === 'hidden' && flushNow()
    window.addEventListener('beforeunload', flushNow)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('beforeunload', flushNow)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [queue])

  // Checklist boxes are drawn in CSS to the left of the text, so a click there
  // lands on the list item itself. Flip its checked state.
  const toggleCheckbox = (e: React.MouseEvent) => {
    const li = (e.target as HTMLElement).closest('li[data-item-type="task"]')
    if (!li || e.clientX >= li.getBoundingClientRect().left) return
    e.preventDefault()
    withView((view) => {
      const pos = view.posAtDOM(li, 0) - 1
      const node = view.state.doc.nodeAt(pos)
      if (!node || node.attrs.checked == null) return
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
      play('check', { pitch: node.attrs.checked ? 0.9 : 1 })
    })
  }

  return (
    <>
      {/* Only a wrapper: the text field inside is the editor (its own role and label).
          The handlers here are the checklist-box click, leaving the editor, and link clicks. */}
      <div
        ref={root}
        role="presentation"
        onMouseDown={toggleCheckbox}
        onBlur={(e) => {
          // Moving into one of our own menus isn't leaving the editor.
          if (e.relatedTarget instanceof Element && e.relatedTarget.closest('[role="toolbar"], [role="listbox"], form')) return
          void queue.flush()
          setToolbar(null)
          setTableBar(null)
          if (!live.current.naming) setSlash(null)
          setColon(null)
        }}
        // Page links (to subpages) open with a click. Web links open in the
        // browser with ⌘-click; a plain click just places the cursor.
        onClickCapture={(e) => {
          const link = (e.target as HTMLElement).closest('a')
          if (!link) return
          e.preventDefault()
          const href = link.getAttribute('href') ?? ''
          if (/^(https?:|mailto:)/.test(href)) {
            if (e.metaKey || e.ctrlKey) void openUrl(href)
          } else if (href.endsWith('.md') && onOpenPage) {
            onOpenPage(href)
          }
        }}
        className={`md-editor ${className}`}
      />
      <AnimatePresence>
        {colon && emojiMatches.length > 0 && !slash && (
          <EmojiMenu
            key="emoji"
            state={colon}
            matches={emojiMatches}
            index={colonIndex}
            onHover={setColonIndex}
            onPick={(emoji) =>
              withView((view) => {
                view.dispatch(view.state.tr.insertText(emoji, colon.from, colon.to))
                setColon(null)
                view.focus()
              })
            }
          />
        )}
        {toolbar && !slash && <SelectionToolbar key="toolbar" state={toolbar} onMark={toggleMark} onLink={setLink} />}
        {tableBar && !toolbar && !slash && <TableBar key="table" x={tableBar.x} y={tableBar.y} onAction={tableAction} />}
        {slash && (
          <SlashMenu
            key="slash"
            state={slash}
            blocks={blocks}
            index={slashIndex}
            onHover={setSlashIndex}
            onPick={(block) => pick.current(block)}
            naming={naming}
            onName={(title) => void createPage(title)}
            onCancelName={() => {
              setNaming(false)
              setSlash(null)
              withView((view) => view.focus())
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
