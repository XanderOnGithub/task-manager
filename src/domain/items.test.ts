import { describe, expect, it } from 'vitest'
import type { Item } from '../platform/api'
import { childrenOf, itemById, taskCounts, tasksUnder, trailOf } from './items'

function item(over: Partial<Item> & Pick<Item, 'id' | 'kind' | 'title'>): Item {
  return { parent: null, status: null, order: null, path: over.title, isFolder: false, created: null, due: null, color: null, icon: null, ...over } as Item
}

const area = item({ id: 'AREA', kind: 'area', title: 'Home' })
const bath = item({ id: 'BATH', kind: 'project', title: 'Bathroom', parent: 'AREA', status: 'active' })
const reno = item({ id: 'RENO', kind: 'project', title: 'Renovate', parent: 'AREA', status: 'active' })
const sink = item({ id: 'SINK', kind: 'milestone', title: 'Sink', parent: 'RENO', status: 'open' })
const tile = item({ id: 'TILE', kind: 'task', title: 'Pick tile', parent: 'BATH', status: 'done', order: 'b' })
const grout = item({ id: 'GROU', kind: 'task', title: 'Grout', parent: 'BATH', status: 'todo', order: 'a' })
const caulk = item({ id: 'CAUL', kind: 'task', title: 'Caulk', parent: 'SINK', status: 'doing' })
const plan = item({ id: 'PLAN', kind: 'page', title: 'Plan', parent: 'BATH' })
const items = [area, bath, reno, sink, tile, grout, caulk, plan]

describe('the item index', () => {
  it('lists children in display order, items and pages apart', () => {
    expect(childrenOf(items, 'BATH').map((i) => i.title)).toEqual(['Grout', 'Pick tile']) // by order key
    expect(childrenOf(items, 'AREA').map((i) => i.title)).toEqual(['Bathroom', 'Renovate']) // by title
    expect(childrenOf(items, 'BATH', true).map((i) => i.title)).toEqual(['Plan'])
    expect(childrenOf(items, null).map((i) => i.title)).toEqual(['Home'])
    expect(childrenOf(items, 'NOPE')).toEqual([])
  })

  it('answers from memory for the same array, and again for a new one', () => {
    expect(childrenOf(items, 'BATH')).toBe(childrenOf(items, 'BATH')) // the same array: stable for React
    expect(itemById(items, 'TILE')).toBe(tile)
    const next = [...items, item({ id: 'NEW', kind: 'task', title: 'New', parent: 'BATH' })]
    expect(childrenOf(next, 'BATH')).toHaveLength(3)
    expect(childrenOf(items, 'BATH')).toHaveLength(2) // the old array is unchanged
  })

  it('finds every task inside a scope, with where it sits', () => {
    expect(tasksUnder(items, 'AREA').map((t) => t.task.id)).toEqual(['GROU', 'TILE', 'CAUL'])
    const caulkPlace = tasksUnder(items, null).find((t) => t.task.id === 'CAUL')
    expect(caulkPlace?.milestone?.id).toBe('SINK')
    expect(caulkPlace?.project?.id).toBe('RENO')
    // Opened on a milestone, its project is found from the milestone.
    expect(tasksUnder(items, 'SINK')[0].project?.id).toBe('RENO')
    expect(tasksUnder(items, 'BATH')).toBe(tasksUnder(items, 'BATH'))
  })

  it('counts done and total', () => {
    expect(taskCounts(items, 'BATH')).toEqual({ done: 1, total: 2 })
    expect(taskCounts(items, null)).toEqual({ done: 1, total: 3 })
  })

  it('gives the trail from the top', () => {
    expect(trailOf(items, 'CAUL').map((i) => i.id)).toEqual(['AREA', 'RENO', 'SINK', 'CAUL'])
    expect(trailOf(items, 'NOPE')).toEqual([])
  })
})

describe('index cost', () => {
  // A big library: 40 areas × 5 projects × 50 tasks = 10,000 tasks.
  const big: Item[] = []
  for (let a = 0; a < 40; a++) {
    big.push(item({ id: `A${a}`, kind: 'area', title: `Area ${a}` }))
    for (let p = 0; p < 5; p++) {
      big.push(item({ id: `A${a}P${p}`, kind: 'project', title: `Project ${p}`, parent: `A${a}`, status: 'active' }))
      for (let t = 0; t < 50; t++) {
        big.push(item({ id: `A${a}P${p}T${t}`, kind: 'task', title: `Task ${t}`, parent: `A${a}P${p}`, status: 'todo', order: String(t).padStart(3, '0') }))
      }
    }
  }

  it('answers many questions about 10,000 tasks quickly', () => {
    const started = performance.now()
    // What a busy screen asks: every project's children, every area's counts, many times over.
    for (let round = 0; round < 20; round++) {
      for (let a = 0; a < 40; a++) {
        for (let p = 0; p < 5; p++) childrenOf(big, `A${a}P${p}`)
        taskCounts(big, `A${a}`)
        trailOf(big, `A${a}P3T7`)
      }
    }
    // Without the index this is about 20 × 40 × 7 passes over 10,000 items (tens of seconds
    // of work); with it, one pass to build and lookups after. The budget leaves room for slow CI machines.
    expect(performance.now() - started).toBeLessThan(800)
  })
})
