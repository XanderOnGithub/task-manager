import { describe, expect, it } from 'vitest'
import type { Item } from '../platform/api'
import { blockerChoices, blockersOf, openBlockers, waitingText } from './blocked'

const item = (over: Partial<Item> & { id: string }): Item =>
  ({
    kind: 'task', title: over.id, path: over.id, isFolder: false, parent: 'P', status: 'todo', order: null,
    created: null, due: null, color: null, icon: null, repeat: null, blockedBy: [], ...over,
  }) as Item

const project = item({ id: 'P', kind: 'project', parent: null, status: 'active' })

describe('blocked tasks', () => {
  const a = item({ id: 'A', title: 'Pick tile' })
  const b = item({ id: 'B', title: 'Buy grout', blockedBy: ['A', 'GONE'] })
  const c = item({ id: 'C', title: 'Seal', status: 'done' })
  const items = [project, a, b, c]

  it('waits only on blockers that exist and are not done', () => {
    expect(openBlockers(items, b).map((t) => t.id)).toEqual(['A'])
    const finished = [project, { ...a, status: 'done' } as Item, b, c]
    expect(openBlockers(finished, b)).toEqual([])
  })

  it('lists every existing blocker for the details panel, done or not', () => {
    expect(blockersOf([project, { ...a, status: 'done' } as Item, b], b).map((t) => t.id)).toEqual(['A'])
  })

  it('offers the other open tasks in the project, not itself, not done, not already chosen', () => {
    expect(blockerChoices(items, b).map((t) => t.id)).toEqual([])
    expect(blockerChoices(items, a).map((t) => t.id)).toEqual(['B'])
  })

  it('says what it waits on', () => {
    expect(waitingText(['Pick tile'])).toBe('Waiting on Pick tile')
    expect(waitingText(['x', 'y', 'z'])).toBe('Waiting on 3 tasks')
  })
})
