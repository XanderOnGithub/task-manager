// Recent changes: everything you can still undo, newest first.
//
// ⌘Z undoes the newest one. This list is for something older. It lasts until
// Moss closes (shared/toast/history.ts); deleted items stay in the Trash longer.

import { Undo2 } from 'lucide-react'
import { ago } from '../../domain/dates'
import { Modal } from '../../shared/controls'
import { undoEntry, useHistory } from '../../shared/toast/history'
import { play } from '../../sound/sounds'

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const entries = useHistory()
  const now = Date.now()

  return (
    <Modal label="Recent changes" onClose={onClose} width="w-[520px]">
      <div className="flex flex-col gap-1 px-5 pt-5 pb-3">
        <h2 className="text-heading">Recent changes</h2>
        <p className="text-meta font-normal text-fg-3">Until Moss closes. Deleted things stay in the Trash for 30 days.</p>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 pb-6 text-fg-3">Nothing to undo yet</p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex min-h-row items-center gap-2.5 rounded-row py-1 pr-1.5 pl-2.5 transition-colors duration-100 hover:bg-hover"
            >
              <span className={`min-w-0 flex-1 truncate ${entry.undone ? 'text-fg-3 line-through' : 'text-fg'}`}>
                {entry.message}
              </span>
              <span className="shrink-0 text-meta font-normal text-fg-3">{ago(entry.at, now)}</span>
              <button
                disabled={entry.undone}
                onClick={() => {
                  play('undo')
                  void undoEntry(entry.id)
                }}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-control px-2 text-fg-2 transition-colors duration-100 hover:bg-raised hover:text-fg disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-fg-2"
              >
                <Undo2 size={13} strokeWidth={2} aria-hidden="true" />
                {entry.undone ? 'Undone' : 'Undo'}
                <span className="sr-only"> {entry.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
