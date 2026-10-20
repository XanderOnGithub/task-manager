// The ⋯ menu shared by projects, milestones, tasks and notes.

import { Copy, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import type { Item } from '../platform/api'
import type { Actions } from '../app/useActions'
import type { MenuItem } from './controls'

export function itemMenu(item: Item, actions: Actions, onRename: () => void): (MenuItem | 'divider')[] {
  return [
    { label: 'Reveal in Finder', Icon: FolderOpen, onSelect: () => void actions.reveal(item) },
    { label: 'Copy path', Icon: Copy, onSelect: () => void actions.copyPath(item) },
    { label: 'Rename', Icon: Pencil, onSelect: onRename },
    'divider',
    { label: `Delete ${item.kind}`, Icon: Trash2, danger: true, onSelect: () => void actions.trash(item) },
  ]
}
