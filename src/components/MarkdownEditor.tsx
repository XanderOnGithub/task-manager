// Rich text editing that saves plain markdown.
//
// Milkdown (ProseMirror + remark) shows formatted text while you type: `# ` makes
// a heading, `- ` a list, `[ ] ` a checkbox, **bold**, `code`, > quotes, and so
// on. What goes to disk is ordinary markdown, so files stay readable in any
// editor. Styles live in styles/editor.css.
//
// Saving: only after you actually change something (opening a page never
// rewrites it), on blur, and after a short pause while typing.

import { useEffect, useRef } from 'react'
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
import { commonmark, remarkPreserveEmptyLinePlugin } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { replaceAll } from '@milkdown/kit/utils'
import { openUrl } from '@tauri-apps/plugin-opener'

// Milkdown keeps empty paragraphs by writing `<br />` into the file. We'd
// rather keep files clean, so that one piece of the preset is left out.
const preserveEmptyLines: MilkdownPlugin[] = [remarkPreserveEmptyLinePlugin].flat()
const markdownBasics = commonmark.filter((plugin) => !preserveEmptyLines.includes(plugin))

/** How long typing has to pause before the page saves on its own. */
const SAVE_AFTER_MS = 800

/**
 * Tidy the markdown before it goes to disk: Milkdown writes an empty paragraph
 * as a `<br />` line, which only adds noise to the file. Drop those and keep at
 * most one blank line in a row (outside code blocks, which stay exactly as
 * typed), and end with one newline.
 */
function normalize(markdown: string) {
  const out: string[] = []
  let inCode = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode
    if (!inCode) {
      if (line.trim() === '<br />') continue
      if (line.trim() === '' && out.length > 0 && out[out.length - 1].trim() === '') continue
    }
    out.push(line)
  }
  const text = out.join('\n').replace(/\s+$/, '')
  return text ? `${text}\n` : ''
}

export function MarkdownEditor({
  value,
  onSave,
  placeholder,
  label,
  className = '',
}: {
  /** The saved markdown. Mount with `key={item.id}` so each item gets its own editor. */
  value: string
  onSave: (markdown: string) => Promise<unknown> | void
  placeholder: string
  label: string
  className?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const editor = useRef<Editor | null>(null)
  // The text on disk as far as we know, and the latest edit not yet saved.
  const saved = useRef(normalize(value))
  const pending = useRef<string | null>(null)
  const timer = useRef(0)
  const save = useRef(onSave)
  save.current = onSave

  const flush = () => {
    window.clearTimeout(timer.current)
    const text = pending.current
    pending.current = null
    if (text === null || text === saved.current) return
    saved.current = text
    void save.current(text)
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
        ctx.set(defaultValueCtx, saved.current)
        // "- item" rather than "* item", the more common style.
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: '-' as const }))
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { 'aria-label': label, 'data-placeholder': placeholder, spellcheck: 'true' },
        }))
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          pending.current = normalize(markdown)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(flush, SAVE_AFTER_MS)
        })
      })
      .use(markdownBasics)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(clipboard)
      .use(cursor)
      .use(trailing)
    void made.create().then((e) => {
      if (destroyed) void e.destroy()
      else editor.current = e
    })
    return () => {
      destroyed = true
      flush()
      void editor.current?.destroy()
      editor.current = null
    }
    // Made once per mount on purpose (see the comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The file changed somewhere else (another app, a sync). Take it, unless
  // you're in the middle of editing.
  useEffect(() => {
    const next = normalize(value)
    if (next === saved.current || pending.current !== null) return
    saved.current = next
    editor.current?.action(replaceAll(next))
  }, [value])

  // Checklist boxes are drawn in CSS to the left of the text, so a click there
  // lands on the list item itself. Flip its checked state.
  const toggleCheckbox = (e: React.MouseEvent) => {
    const li = (e.target as HTMLElement).closest('li[data-item-type="task"]')
    if (!li || e.clientX >= li.getBoundingClientRect().left) return
    e.preventDefault()
    editor.current?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const pos = view.posAtDOM(li, 0) - 1
      const node = view.state.doc.nodeAt(pos)
      if (!node || node.attrs.checked == null) return
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
    })
  }

  return (
    <div
      ref={root}
      onMouseDown={toggleCheckbox}
      onBlur={flush}
      // Links open in the browser with ⌘-click; a plain click just places the cursor.
      onClickCapture={(e) => {
        const link = (e.target as HTMLElement).closest('a')
        if (!link) return
        e.preventDefault()
        const href = link.getAttribute('href')
        if (href && (e.metaKey || e.ctrlKey) && /^(https?:|mailto:)/.test(href)) void openUrl(href)
      }}
      className={`md-editor ${className}`}
    />
  )
}
