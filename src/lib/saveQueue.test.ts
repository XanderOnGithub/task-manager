import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETRY_AFTER_MS, SAVE_AFTER_MS, SaveQueue } from './saveQueue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** A write that finishes when you say so, to test overlapping saves. */
function manualWrites() {
  const calls: { text: string; ok: () => void; fail: (e: unknown) => void }[] = []
  const write = vi.fn(
    (text: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ text, ok: resolve, fail: reject })
      }),
  )
  return { calls, write }
}

describe('SaveQueue', () => {
  it('saves after a pause in typing, once, with the newest text', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const queue = new SaveQueue('a', write)
    queue.edit('ab')
    queue.edit('abc')
    expect(queue.dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('abc')
    expect(queue.saved).toBe('abc')
    expect(queue.dirty).toBe(false)
  })

  it('does not write text that is already on disk', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const queue = new SaveQueue('same', write)
    queue.edit('same')
    await queue.flush()
    expect(write).not.toHaveBeenCalled()
    expect(queue.dirty).toBe(false)
  })

  it('stays unsaved when a write fails, and retries until it works', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const onError = vi.fn()
    const queue = new SaveQueue('a', write, onError)
    queue.edit('b')
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(queue.saved).toBe('a') // not marked saved
    expect(queue.dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_MS)
    expect(write).toHaveBeenCalledTimes(2)
    expect(queue.saved).toBe('b')
    expect(queue.dirty).toBe(false)
  })

  it('reports a failing save once, not on every retry', async () => {
    const write = vi.fn().mockRejectedValue(new Error('no'))
    const onError = vi.fn()
    const queue = new SaveQueue('a', write, onError)
    queue.edit('b')
    await vi.advanceTimersByTimeAsync(SAVE_AFTER_MS + RETRY_AFTER_MS * 3)
    expect(write.mock.calls.length).toBeGreaterThan(2)
    expect(onError).toHaveBeenCalledTimes(1)
    queue.dispose()
  })

  it('writes one at a time, in order, and keeps typing that happened during a write', async () => {
    const { calls, write } = manualWrites()
    const queue = new SaveQueue('a', write)
    queue.edit('b')
    const first = queue.flush()
    expect(calls.map((c) => c.text)).toEqual(['b'])

    // Typing continues while 'b' is being written.
    queue.edit('bc')
    const second = queue.flush()
    expect(calls.map((c) => c.text)).toEqual(['b']) // no second write started yet

    calls[0].ok()
    await vi.advanceTimersByTimeAsync(0)
    expect(queue.saved).toBe('b')
    expect(queue.dirty).toBe(true) // 'bc' is still waiting
    expect(calls.map((c) => c.text)).toEqual(['b', 'bc'])

    calls[1].ok()
    await Promise.all([first, second])
    expect(queue.saved).toBe('bc')
    expect(queue.dirty).toBe(false)
  })

  it('a failed older write does not lose newer text typed meanwhile', async () => {
    const { calls, write } = manualWrites()
    const queue = new SaveQueue('a', write, () => {})
    queue.edit('b')
    void queue.flush()
    queue.edit('bc')
    calls[0].fail(new Error('locked'))
    await vi.advanceTimersByTimeAsync(0)
    expect(queue.pending).toBe('bc')
    expect(queue.saved).toBe('a')
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_MS)
    const last = calls[calls.length - 1]
    expect(last.text).toBe('bc')
    last.ok()
    await vi.advanceTimersByTimeAsync(0)
    expect(queue.saved).toBe('bc')
    expect(queue.dirty).toBe(false)
  })

  it('takes text from outside only through adopt()', () => {
    const queue = new SaveQueue('a', vi.fn())
    queue.adopt('from sync')
    expect(queue.saved).toBe('from sync')
    expect(queue.dirty).toBe(false)
  })
})
