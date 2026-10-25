import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../platform/api'

const api = vi.hoisted(() => ({
  getDataFolder: vi.fn(async () => '/Moss'),
  loadLibrary: vi.fn(),
  onDataChanged: vi.fn(async () => () => {}),
}))
vi.mock('../platform/api', () => api)

import { useLibrary } from './useLibrary'

const snapshot = (name: string): Snapshot => ({ dataFolder: '/Moss', items: [], issues: [], unsorted: [{ line: 0, raw: name, added: null, text: name }] })

/** A promise that is answered later, by hand. */
function later<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('useLibrary', () => {
  beforeEach(() => api.loadLibrary.mockReset())

  it('keeps the newest library when an older load answers last', async () => {
    const older = later<Snapshot>()
    const newer = later<Snapshot>()
    // The mount's own load answers at once and is not what this test is about.
    api.loadLibrary.mockResolvedValueOnce(snapshot('first'))
    api.loadLibrary.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const { result } = renderHook(() => useLibrary())
    await act(async () => {})

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.reload()
      second = result.current.reload()
    })
    await act(async () => {
      newer.resolve(snapshot('newer'))
      await second
    })
    await act(async () => {
      older.resolve(snapshot('older'))
      await first
    })
    expect(result.current.snapshot?.unsorted[0].text).toBe('newer')
  })
})
