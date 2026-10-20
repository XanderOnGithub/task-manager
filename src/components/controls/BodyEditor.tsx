// Body editor: the text under an item's frontmatter (a description, or a page's text).
//
// Reads the text, shows the rich-text editor once it has it, and tells you when
// reading or saving fails (see lib/useBody.ts and lib/saveQueue.ts).

import { lazy, Suspense } from 'react'
import type { Item } from '../../lib/api'
import { metaPath, useBodyRevision } from '../../lib/bodyChanges'
import { useToast } from '../../lib/toast'
import { useBody } from '../../lib/useBody'
import type { TextStats } from '../MarkdownEditor'

// The editor is a big chunk of code; load it the first time something is opened.
const MarkdownEditor = lazy(() => import('../MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })))

export function BodyEditor({
  item,
  onSave,
  placeholder,
  tone = 'muted',
  className = '',
  onCreatePage,
  onOpenPage,
  onStats,
}: {
  item: Item
  /** Writes the text. Rejects when it couldn't. */
  onSave: (body: string) => Promise<unknown>
  placeholder: string
  /** 'muted' for descriptions under a title, 'normal' for a page's main text. */
  tone?: 'muted' | 'normal'
  className?: string
  /** Pages only: "/page" makes a subpage (see MarkdownEditor). */
  onCreatePage?: (title: string) => Promise<string | null>
  onOpenPage?: (href: string) => void
  /** Pages only: word and character counts as you type. */
  onStats?: (stats: TextStats) => void
}) {
  const toast = useToast()
  // Reads the text again if its file changed outside the app (a sync, another editor).
  const body = useBody(item.id, useBodyRevision(metaPath(item)))
  // Nothing until the text has loaded, so the editor never starts empty and
  // then jumps. One editor per item (the key), so undo history doesn't mix.
  const loading = <div className={className} aria-busy="true" />
  if (body.status === 'loading') return loading
  // A failed read is not an empty page: an empty editor would let the next
  // edit replace the real text.
  if (body.status === 'error') {
    return (
      <div role="alert" className={`flex flex-col items-start gap-2 text-meta font-normal text-fg-2 ${className}`}>
        <span>Couldn't read this text. {body.message}</span>
        <button
          onClick={body.retry}
          className="rounded-control bg-raised px-3 py-1 text-fg transition-colors duration-100 hover:bg-hover"
        >
          Try again
        </button>
      </div>
    )
  }
  return (
    <Suspense fallback={loading}>
      <MarkdownEditor
        key={item.id}
        value={body.body}
        onSave={onSave}
        onSaveError={(e) => toast({ message: `Couldn't save. Moss will keep trying. ${String(e)}`, tone: 'error' })}
        placeholder={placeholder}
        label={tone === 'muted' ? 'Description' : 'Page text'}
        className={`${tone === 'muted' ? 'text-fg-2' : 'text-fg'} ${className}`}
        onCreatePage={onCreatePage}
        onOpenPage={onOpenPage}
        onStats={onStats}
      />
    </Suspense>
  )
}
