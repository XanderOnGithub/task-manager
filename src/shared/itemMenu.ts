// The ⋯ menu shared by projects, milestones, tasks and notes.

import { Copy, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import type { Item } from '../platform/api'
import type { Actions } from '../app/useActions'
import type { MenuItem } from './controls'
import { vocab } from '../domain/vocab'
import { isAndroid } from '../platform/os'

export function itemMenu(item: Item, actions: Actions, onRename: () => void): (MenuItem | 'divider')[] {
  return [
    // A phone has no file manager to show the file in, and no use for its path.
    ...(isAndroid
      ? []
      : [
          { label: 'Reveal in Finder', Icon: FolderOpen, onSelect: () => void actions.reveal(item) },
          { label: 'Copy path', Icon: Copy, onSelect: () => void actions.copyPath(item) },
        ]),
    { label: 'Rename', Icon: Pencil, onSelect: onRename },
    'divider',
    { label: `Delete ${vocab().noun(item.kind)}`, Icon: Trash2, danger: true, onSelect: () => void actions.trash(item) },
  ]
}
