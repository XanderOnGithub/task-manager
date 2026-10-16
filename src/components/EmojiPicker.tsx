// The page icon: an emoji just left of the page title, and the picker that sets it.
// Pages without an icon show a small "Add icon" button in the margin to the
// left of the title when you hover it, so the title never moves.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { SmilePlus } from 'lucide-react'
import type { Item } from '../lib/api'
import { EMOJI, searchEmoji } from '../lib/emoji'
import { spring } from '../lib/motion'

/** True for a short run of non-letter characters, i.e. probably an emoji someone typed or pasted. */
const looksLikeEmoji = (text: string) => {
  const t = text.trim()
  return t.length > 0 && [...t].length <= 8 && /\p{Extended_Pictographic}/u.test(t)
}

export function PageIconPicker({ page, onChange }: { page: Item; onChange: (icon: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (icon: string | null) => {
    setOpen(false)
    if (icon !== page.icon) onChange(icon)
  }

  return (
    <div ref={box} className="relative flex shrink-0 items-center">
      {page.icon ? (
        <motion.button
          // A new emoji pops in; changing pages doesn't animate.
          key={`${page.id}:${page.icon}`}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.pop}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setOpen((o) => !o)}
          aria-label="Change icon"
          title="Change icon"
          className="-ml-1 mr-1.5 flex size-9 items-center justify-center rounded-control text-[24px] leading-none transition-colors duration-100 hover:bg-hover"
        >
          {page.icon}
        </motion.button>
      ) : (
        // Sits in the margin, so the root takes no width and the title stays put.
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Add icon"
          title="Add icon"
          className={`absolute top-1/2 right-full mr-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-control text-fg-3 transition-[opacity,color,background-color] duration-100 hover:bg-hover hover:text-fg-2 focus-visible:opacity-100 ${
            open ? 'opacity-100' : 'opacity-0 group-hover/title:opacity-100'
          }`}
        >
          <SmilePlus size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}

      <AnimatePresence>
        {open && <Picker key="picker" current={page.icon} onPick={pick} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}

function Picker({
  current,
  onPick,
  onClose,
}: {
  current: string | null
  onPick: (icon: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const found = searchEmoji(query)
  const typed = looksLikeEmoji(query) ? query.trim() : null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.08 } }}
      transition={spring.snappy}
      style={{ originX: 0, originY: 0 }}
      className="absolute top-full left-0 z-30 mt-2 flex w-[328px] flex-col overflow-hidden rounded-card border border-border-menu bg-menu shadow-menu"
    >
      <div className="flex items-center gap-2 border-b border-border p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter') onPick(typed ?? found[0] ?? null)
          }}
          placeholder="Search, or type any emoji"
          aria-label="Search emoji"
          className="h-8 flex-1 rounded-control bg-field px-2 outline-none placeholder:text-placeholder"
        />
        {current && (
          <button
            onClick={() => onPick(null)}
            className="h-8 rounded-control px-2 text-meta text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>

      <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto p-2">
        {query ? (
          <Grid emoji={typed && !found.includes(typed) ? [typed, ...found] : found} current={current} onPick={onPick} />
        ) : (
          EMOJI.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <span className="px-1 text-label tracking-label text-fg-3 uppercase">{group.label}</span>
              <Grid emoji={group.emoji.map(([e]) => e)} current={current} onPick={onPick} />
            </div>
          ))
        )}
        {query && !typed && found.length === 0 && (
          <p className="px-1 py-3 text-center text-fg-3">No match. Type or paste any emoji.</p>
        )}
      </div>
    </motion.div>
  )
}

function Grid({ emoji, current, onPick }: { emoji: string[]; current: string | null; onPick: (icon: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((e) => (
        <motion.button
          key={e}
          whileHover={{ scale: 1.18 }}
          whileTap={{ scale: 0.9 }}
          transition={spring.snappy}
          onClick={() => onPick(e)}
          aria-label={e}
          className={`flex size-[37px] items-center justify-center rounded-control text-[21px] leading-none transition-colors duration-100 hover:bg-hover ${
            e === current ? 'bg-selected' : ''
          }`}
        >
          {e}
        </motion.button>
      ))}
    </div>
  )
}
