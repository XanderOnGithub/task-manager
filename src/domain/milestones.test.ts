import { describe, expect, it } from 'vitest'
import type { Item } from '../platform/api'
import { milestoneRows } from './milestones'

const item = (id: string, kind: Item['kind'], parent: string | null, extra: Partial<Item> = {}): Item => ({
  id,
  kind,
  title: id,
  path: id,
  isFolder: kind !== 'task' && kind !== 'page',
  parent,
  status: null,
  order: null,
  created: null,
  due: null,
  color: null,
  icon: null,
  repeat: null,
  blockedBy: [],
  ...extra,
})

const items: Item[] = [
  item('Home', 'area', null),
  item('Work', 'area', null),
  item('Kitchen', 'project', 'Home'),
  item('Fence', 'project', 'Home'),
  item('Launch', 'project', 'Work'),
  item('Demo', 'milestone', 'Kitchen', { status: 'open' }),
  item('Build', 'milestone', 'Kitchen', { status: 'done' }),
  item('Beta', 'milestone', 'Launch', { status: 'open' }),
  item('Tear out', 'task', 'Demo', { status: 'done' }),
  item('Haul', 'task', 'Demo', { status: 'todo' }),
  item('Paint', 'task', 'Fence', { status: 'todo' }),
]

describe('milestoneRows', () => {
  it('lists the milestones of a project with how many of their tasks are done', () => {
    const kitchen = items.find((i) => i.id === 'Kitchen')!
    const rows = milestoneRows(items, kitchen)
    expect(rows.map((r) => r.milestone.id)).toEqual(['Build', 'Demo'])
    const demo = rows.find((r) => r.milestone.id === 'Demo')!
    expect([demo.done, demo.total]).toEqual([1, 2])
    expect(demo.project.id).toBe('Kitchen')
  })

  it('collects them across an area, or everywhere, skipping projects without milestones', () => {
    const home = items.find((i) => i.id === 'Home')!
    expect(milestoneRows(items, home).map((r) => r.milestone.id).sort()).toEqual(['Build', 'Demo'])
    expect(milestoneRows(items, null).map((r) => r.milestone.id).sort()).toEqual(['Beta', 'Build', 'Demo'])
  })
})
