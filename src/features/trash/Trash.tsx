// The Trash: everything deleted in the last 30 days, newest first, with where
// it came from. Restore puts it back; Delete for good and Empty trash remove
// it from disk (both ask first).

import { AnimatePresence } from 'motion/react'
import { FileText, Flag, Folder, RotateCcw, Target, Trash2 } from 'lucide-react'
import type { TrashEntry } from '../../platform/api'
import { stampLabel } from '../../domain/dates'
import type { Actions } from '../../app/useActions'
import { Menu } from '../../shared/controls'
import { ListRow } from '../../shared/motion/pieces'
import { Panel, PanelHeader, StatusIcon } from '../../shared/ui'

export function TrashView({ entries, actions }: { entries: TrashEntry[]; actions: Actions }) {
  return (
    <Panel label="Trash" className="flex-1">
      <PanelHeader>
        <span className="flex-1 truncate text-fg">Trash</span>
        {entries.length > 0 && (
          <button
            onClick={() => void actions.emptyTrash(entries.length)}
            className="flex h-7 items-center gap-1.5 rounded-row px-2.5 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-danger"
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
            Empty trash
          </button>
        )}
      </PanelHeader>
      <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-title">Trash</h1>
          <span className="text-meta font-normal text-fg-3">Deleted things stay here for 30 days, then they're gone for good.</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-fg-3">The trash is empty</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <ListRow key={entry.path}>
                  <div className="group flex h-row items-center gap-2.5 rounded-row pr-1.5 pl-2.5 transition-colors duration-100 hover:bg-hover">
                    <KindIcon entry={entry} />
                    <span className="min-w-0 shrink truncate text-fg">{entry.title}</span>
                    {entry.from.length > 0 && (
                      <span className="min-w-0 flex-1 truncate text-meta font-normal text-fg-3">{entry.from.join(' / ')}</span>
                    )}
                    <span className="ml-auto shrink-0 text-meta font-normal text-fg-3">
                      {entry.deleted ? stampLabel(entry.deleted) : ''}
                    </span>
                    {entry.original && (
                      <button
                        onClick={() => void actions.restoreFromTrash(entry)}
                        className="flex h-7 shrink-0 items-center gap-1.5 rounded-control px-2 text-fg-2 transition-colors duration-100 hover:bg-raised hover:text-fg"
                      >
                        <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
                        Restore
                      </button>
                    )}
                    <Menu
                      label={`More actions for ${entry.title}`}
                      items={[{ label: 'Delete for good', Icon: Trash2, danger: true, onSelect: () => void actions.deleteForever(entry) }]}
                    />
                  </div>
                </ListRow>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Panel>
  )
}

function KindIcon({ entry }: { entry: TrashEntry }) {
  const props = { size: 15, strokeWidth: 1.75, 'aria-hidden': true, className: 'shrink-0 text-fg-2' } as const
  switch (entry.kind) {
    case 'area':
      return <Folder {...props} />
    case 'project':
      return <Target {...props} />
    case 'milestone':
      return <Flag {...props} />
    case 'task':
      return <StatusIcon status="todo" size={15} />
    default:
      return <FileText {...props} />
  }
}
