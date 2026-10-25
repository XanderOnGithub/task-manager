import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { byPriority, priorityOf, setPriority, usePriority } from './priorityStore'

afterEach(() => {
  for (const id of ['a', 'b', 'c', 'd']) setPriority(id, null)
})

describe('task priority', () => {
  it('has none until one is set, and can be cleared', () => {
    expect(priorityOf('a')).toBeNull()
    setPriority('a', 2)
    expect(priorityOf('a')).toBe(2)
    setPriority('a', null)
    expect(priorityOf('a')).toBeNull()
  })

  it('is kept in preferences, not in the task files', () => {
    setPriority('b', 1)
    expect(JSON.parse(localStorage.getItem('moss.priorities') ?? '{}')).toMatchObject({ b: 1 })
  })

  it('redraws a row when its task priority changes', () => {
    const { result } = renderHook(() => usePriority('c'))
    expect(result.current).toBeNull()
    act(() => setPriority('c', 3))
    expect(result.current).toBe(3)
  })

  it('sorts Urgent first and no priority last, keeping order otherwise', () => {
    setPriority('b', 4)
    setPriority('d', 1)
    expect(byPriority(['a', 'b', 'c', 'd'], (id) => id)).toEqual(['d', 'b', 'a', 'c'])
  })
})
