// The "/" menu: blocks you can turn the current line into, or insert.
// Each one deletes the typed "/query" first (the editor does that), then
// runs its command on the current line.

import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx } from '@milkdown/kit/core'
import { Selection } from '@milkdown/kit/prose/state'
import {
  createCodeBlockCommand,
  insertHrCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand } from '@milkdown/kit/preset/gfm'
import { callCommand } from '@milkdown/kit/utils'
import {
  FilePlus,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  SquareCode,
  Table,
  Type,
  type LucideIcon,
} from 'lucide-react'

export interface Block {
  id: string
  label: string
  hint: string
  Icon: LucideIcon
  /** Other words that find it ("todo" finds Checklist). */
  aliases: string[]
  /** What it does. `page` is handled by the editor (it asks for a name first). */
  run?: (ctx: Ctx) => void
}

export const BLOCKS: Block[] = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', Icon: Type, aliases: ['p', 'paragraph', 'plain'], run: (ctx) => void callCommand(turnIntoTextCommand.key)(ctx) },
  { id: 'h1', label: 'Heading 1', hint: 'Big section title', Icon: Heading1, aliases: ['h1', 'title', '#'], run: (ctx) => void callCommand(wrapInHeadingCommand.key, 1)(ctx) },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', Icon: Heading2, aliases: ['h2', 'subtitle', '##'], run: (ctx) => void callCommand(wrapInHeadingCommand.key, 2)(ctx) },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', Icon: Heading3, aliases: ['h3', '###'], run: (ctx) => void callCommand(wrapInHeadingCommand.key, 3)(ctx) },
  { id: 'bullet', label: 'Bulleted list', hint: 'A simple list', Icon: List, aliases: ['ul', 'bullets', 'list', '-'], run: (ctx) => void callCommand(wrapInBulletListCommand.key)(ctx) },
  { id: 'number', label: 'Numbered list', hint: 'A list with numbers', Icon: ListOrdered, aliases: ['ol', 'numbers', '1.'], run: (ctx) => void callCommand(wrapInOrderedListCommand.key)(ctx) },
  {
    id: 'todo',
    label: 'Checklist',
    hint: 'Things to tick off',
    Icon: ListTodo,
    aliases: ['todo', 'task', 'check', 'checkbox', '[]'],
    run: (ctx) => {
      callCommand(wrapInBulletListCommand.key)(ctx)
      // A checklist item is a list item with a "checked" state.
      const view = ctx.get(editorViewCtx)
      const { $from } = view.state.selection
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type.name === 'list_item') {
          view.dispatch(view.state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked: false }))
          break
        }
      }
    },
  },
  { id: 'quote', label: 'Quote', hint: 'Set text apart', Icon: Quote, aliases: ['blockquote', '>'], run: (ctx) => void callCommand(wrapInBlockquoteCommand.key)(ctx) },
  { id: 'code', label: 'Code block', hint: 'Monospaced, kept exactly', Icon: SquareCode, aliases: ['code', 'pre', '```'], run: (ctx) => void callCommand(createCodeBlockCommand.key)(ctx) },
  { id: 'divider', label: 'Divider', hint: 'A line between sections', Icon: Minus, aliases: ['spacer', 'line', 'hr', 'separator', '---'], run: (ctx) => void callCommand(insertHrCommand.key)(ctx) },
  {
    id: 'table',
    label: 'Table',
    hint: '3 × 3 to start; Tab moves between cells',
    Icon: Table,
    aliases: ['grid'],
    run: (ctx) => {
      const view = ctx.get(editorViewCtx)
      const at = view.state.selection.from
      callCommand(insertTableCommand.key, { row: 3, col: 3 })(ctx)
      // Put the cursor in the first cell, ready to type.
      let tablePos = -1
      view.state.doc.descendants((node, pos) => {
        if (tablePos < 0 && node.type.name === 'table' && pos + node.nodeSize >= at) tablePos = pos
        return tablePos < 0
      })
      if (tablePos >= 0) {
        const tr = view.state.tr
        view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(tablePos + 1))))
      }
    },
  },
  { id: 'page', label: 'Page', hint: 'A subpage inside this one', Icon: FilePlus, aliases: ['subpage', 'new page', 'doc', 'note'] },
]

/** Blocks matching what's been typed after "/", best matches first. */
export function matchBlocks(query: string, withPage: boolean): Block[] {
  const q = query.trim().toLowerCase()
  const available = BLOCKS.filter((b) => withPage || b.id !== 'page')
  if (!q) return available
  const score = (b: Block) => {
    const words = [b.label.toLowerCase(), ...b.aliases]
    if (words.some((w) => w === q)) return 0
    if (words.some((w) => w.startsWith(q))) return 1
    if (b.label.toLowerCase().split(' ').some((w) => w.startsWith(q))) return 2
    if (words.some((w) => w.includes(q))) return 3
    return 9
  }
  return available
    .map((b) => ({ b, s: score(b) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.b)
}
