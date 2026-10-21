import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./particles', () => ({ burst: vi.fn() }))
vi.mock('../../sound/sounds', () => ({ play: vi.fn() }))

import { play } from '../../sound/sounds'
import { setPref } from '../../platform/prefs'
import { burst } from './particles'
import { impactSoundFor, pickUpDust, playStatusSound, statusBurst } from './impact'

const reduceMotion = (on: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: on && query.includes('reduce'), media: query }))

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  reduceMotion(false)
  document.body.innerHTML = '<div data-item="T1"><button>status</button></div>'
  // jsdom has no layout: give the button a size.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 22, height: 22 } as DOMRect)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fun effects', () => {
  it('are off until switched on', () => {
    statusBurst('T1', 'done')
    pickUpDust({ left: 0, top: 0, width: 100, height: 40 })
    vi.runAllTimers()
    expect(burst).not.toHaveBeenCalled()
    expect(impactSoundFor('done')).toBeNull()
    playStatusSound('done')
    expect(play).toHaveBeenCalledWith('complete')
  })

  it('burst from the task once particles are on, only for statuses that have one', () => {
    setPref('fun.particles', true)
    statusBurst('T1', 'todo')
    vi.runAllTimers()
    expect(burst).not.toHaveBeenCalled()
    statusBurst('T1', 'done')
    vi.runAllTimers()
    expect(burst).toHaveBeenCalledWith('done', 21, 31, 6)
    pickUpDust({ left: 0, top: 0, width: 100, height: 40 })
    expect(burst).toHaveBeenCalledWith('dust', 50, 40, 60)
  })

  it('never run particles when the system asks for reduced motion', () => {
    setPref('fun.particles', true)
    reduceMotion(true)
    statusBurst('T1', 'done')
    vi.runAllTimers()
    expect(burst).not.toHaveBeenCalled()
  })

  it('use the fuller sounds only when switched on', () => {
    setPref('fun.impactSounds', true)
    expect(impactSoundFor('done')).toBe('impactDone')
    expect(impactSoundFor('waiting')).toBe('impactWaiting')
    expect(impactSoundFor('todo')).toBeNull()
    playStatusSound('doing')
    expect(play).toHaveBeenCalledWith('impactDoing')
    playStatusSound('todo')
    expect(play).toHaveBeenCalledWith('status')
  })
})
