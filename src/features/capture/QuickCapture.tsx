// Quick capture (⌘N): one line into Unsorted from anywhere.

import { useState } from 'react'
import { Layers } from 'lucide-react'
import { Modal } from '../../shared/controls'
import { useVocab } from '../../domain/vocab'

export function QuickCapture({ onCapture, onClose }: { onCapture: (text: string) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState('')
  const words = useVocab()
  const [busy, setBusy] = useState(false)

  // Closes once it is saved. If saving fails the box stays open with the text in it.
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    const added = await onCapture(text.trim())
    setBusy(false)
    if (added) onClose()
  }

  return (
    <Modal label={words.quickCapture} onClose={onClose} width="w-[560px]">
      <label className="flex h-[52px] items-center gap-3 px-4 text-fg-3">
        <Layers size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder={`Add to ${words.unsorted}`}
          aria-label={`Add to ${words.unsorted}`}
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-placeholder"
        />
        <kbd className="font-mono text-label font-normal pointer-coarse:hidden">↵</kbd>
      </label>
    </Modal>
  )
}
