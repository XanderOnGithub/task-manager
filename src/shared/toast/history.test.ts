import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearHistory, latestUndoable, recordUndo, undoEntry } from './history'

beforeEach(clearHistory)

describe('undo history', () => {
  it('undoes an entry once, and the newest comes first', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const a = recordUndo('Deleted Pick tile', first)
    const b = recordUndo('Moved to Bathroom', second)
    expect(latestUndoable()?.id).toBe(b)

    expect(await undoEntry(b)).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(await undoEntry(b)).toBe(false) // already undone
    expect(second).toHaveBeenCalledTimes(1)
    expect(latestUndoable()?.id).toBe(a) // ⌘Z goes further back
    expect(first).not.toHaveBeenCalled()
  })

  it('what an undo itself makes undoable is listed but skipped by ⌘Z', async () => {
    const original = recordUndo('Deleted Pick tile', () => {
      // Restoring it shows a toast with its own Undo.
      recordUndo('Restored Pick tile', vi.fn())
    })
    const before = recordUndo('Renamed Bathroom', vi.fn())
    await undoEntry(before)
    await undoEntry(original)
    // Only entries made outside an undo count: the two restores don't, and nothing is left.
    expect(latestUndoable()).toBeUndefined()
    // ...but a new change afterwards does.
    const later = recordUndo('Deleted Grout', vi.fn())
    expect(latestUndoable()?.id).toBe(later)
  })

  it('keeps the newest fifty', () => {
    for (let i = 0; i < 60; i++) recordUndo(`Change ${i}`, vi.fn())
    expect(latestUndoable()?.message).toBe('Change 59')
  })

  it('an undo that fails still counts as tried, and the failure reaches the caller', async () => {
    const id = recordUndo('Moved', () => {
      throw new Error('gone')
    })
    await expect(undoEntry(id)).rejects.toThrow('gone')
    expect(latestUndoable()).toBeUndefined()
  })
})
