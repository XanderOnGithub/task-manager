import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ readBody: vi.fn() }))

import { readBody } from './api'
import { metaPath, notifyBodyChanges, useBodyRevision } from './bodyChanges'
import { useBody } from './useBody'

const read = vi.mocked(readBody)

beforeEach(() => read.mockReset())

describe('useBody', () => {
  it('loads, then has the text', async () => {
    read.mockResolvedValue('Hello\n')
    const { result } = renderHook(() => useBody('A', 0))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', body: 'Hello\n' }))
  })

  it('a failed read is an error, never an empty page, and Try again reads again', async () => {
    read.mockRejectedValueOnce('The file is locked').mockResolvedValueOnce('Real text\n')
    const { result } = renderHook(() => useBody('A', 0))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toMatchObject({ status: 'error', message: 'The file is locked' })

    act(() => {
      if (result.current.status === 'error') result.current.retry()
    })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', body: 'Real text\n' }))
  })

  it('reads again when the revision moves, keeping the old text meanwhile', async () => {
    read.mockResolvedValueOnce('one\n')
    const { result, rerender } = renderHook(({ rev }) => useBody('A', rev), { initialProps: { rev: 0 } })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', body: 'one\n' }))

    read.mockResolvedValueOnce('two\n')
    rerender({ rev: 1 })
    expect(result.current).toEqual({ status: 'ready', body: 'one\n' }) // no flash of "loading"
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', body: 'two\n' }))
  })

  it('a failed re-read leaves the text that is showing', async () => {
    read.mockResolvedValueOnce('one\n').mockRejectedValueOnce('busy')
    const { result, rerender } = renderHook(({ rev }) => useBody('A', rev), { initialProps: { rev: 0 } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ rev: 1 })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    expect(result.current).toEqual({ status: 'ready', body: 'one\n' })
  })

  it('hides the previous item while the next one loads', async () => {
    read.mockResolvedValueOnce('first\n')
    const { result, rerender } = renderHook(({ id }) => useBody(id, 0), { initialProps: { id: 'A' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    read.mockResolvedValueOnce('second\n')
    rerender({ id: 'B' })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', body: 'second\n' }))
  })
})

describe('body revisions', () => {
  it('go up only for the file that changed', () => {
    const task = { path: 'areas/Home/Bath/Tile.md', isFolder: false }
    const project = { path: 'areas/Home/Bath', isFolder: true }
    expect(metaPath(task)).toBe('areas/Home/Bath/Tile.md')
    expect(metaPath(project)).toBe('areas/Home/Bath/_index.md')

    const a = renderHook(() => useBodyRevision(metaPath(task)))
    const b = renderHook(() => useBodyRevision(metaPath(project)))
    const startA = a.result.current
    const startB = b.result.current
    act(() => notifyBodyChanges(['areas/Home/Bath/Tile.md', 'unsorted.md']))
    expect(a.result.current).toBe(startA + 1)
    expect(b.result.current).toBe(startB)
    act(() => notifyBodyChanges([]))
    expect(a.result.current).toBe(startA + 1)
  })
})
