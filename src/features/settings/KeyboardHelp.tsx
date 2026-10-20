// Settings → Keyboard: the shortcuts, for reference.

import { keys } from '../../platform/os'

/** The keyboard shortcuts, for reference. Rows: features/navigation/rowKeys.ts; the rest: App.tsx. */
export function KeyboardHelp() {
  const shortcuts: [string, string][] = [
    [keys('N'), 'Quick capture'],
    [keys('K'), 'Search and commands'],
    [keys('\\'), 'Hide or show the sidebar'],
    [keys('Z'), 'Undo the last change'],
    ['↑ ↓', 'Move between rows'],
    ['← →', 'Move between board columns'],
    ['Enter', 'Open the row'],
    ['S', 'Next status'],
    ['Delete', 'Delete the row'],
    ['Space', 'Pick up the row, then arrows and Space to move it'],
    ['Esc', 'Close details'],
    [keys('Enter'), 'In a page: tick or untick the checklist item'],
    ['Shift+F10', 'Open the menu of the focused row'],
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="text-meta text-fg-2">Keyboard</div>
      <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-1.5">
        {shortcuts.map(([key, what]) => (
          <div key={what} className="contents">
            <dt className="font-mono text-meta font-normal text-fg-2">{key}</dt>
            <dd className="text-meta font-normal text-fg-3">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
