import { describe, expect, it } from 'vitest'
import type { Item } from '../../platform/api'
import { dueNowCount, planFor } from './plan'

// Tuesday, 20 October 2026.
const TODAY = new Date(2026, 9, 20, 15, 30)

function item(over: Partial<Item> & Pick<Item, 'id' | 'kind' | 'title'>): Item {
  return { parent: null, status: null, order: null, path: over.title, isFolder: false, created: null, due: null, color: null, icon: null, repeat: null, ...over } as Item
}

const home = item({ id: 'HOME', kind: 'area', title: 'Home' })
const bath = item({ id: 'BATH', kind: 'project', title: 'Bathroom', parent: 'HOME', status: 'active' })
const task = (id: string, due: string | null, status = 'todo') =>
  item({ id, kind: 'task', title: id, parent: 'BATH', status: status as Item['status'], due })

describe('planFor', () => {
  it('groups by day: overdue, today, then each coming day that has something', () => {
    const items = [
      home,
      bath,
      task('LATE', '2026-10-15'),
      task('OLDER', '2026-10-10'),
      task('NOW', '2026-10-20'),
      task('TOM', '2026-10-21'),
      task('FRI', '2026-10-23'),
      task('FARAWAY', '2026-11-30'),
      task('NODATE', null),
      task('DONE', '2026-10-20', 'done'),
    ]
    const groups = planFor(items, TODAY)
    expect(groups.map((g) => [g.label, g.tasks.map((t) => t.task.id)])).toEqual([
      ['Overdue', ['OLDER', 'LATE']], // the one waiting longest first
      ['Today', ['NOW']],
      ['Tomorrow', ['TOM']],
      ['Fri, Oct 23', ['FRI']],
    ])
  })

  it('shows six days ahead and no further', () => {
    const items = [home, bath, task('SEVEN', '2026-10-26'), task('EIGHT', '2026-10-27')]
    expect(planFor(items, TODAY).map((g) => g.tasks[0].task.id)).toEqual(['SEVEN'])
  })

  it('is empty when nothing is due', () => {
    expect(planFor([home, bath, task('A', null)], TODAY)).toEqual([])
  })

  it('knows where each task sits', () => {
    const [group] = planFor([home, bath, task('NOW', '2026-10-20')], TODAY)
    expect(group.tasks[0].project?.title).toBe('Bathroom')
  })

  it('counts what needs attention now: overdue and due today, not done', () => {
    const items = [home, bath, task('LATE', '2026-10-15'), task('NOW', '2026-10-20'), task('TOM', '2026-10-21'), task('DONE', '2026-10-20', 'done')]
    expect(dueNowCount(items, TODAY)).toBe(2)
  })
})
