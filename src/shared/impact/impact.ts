// What happens when something changes: specks and fuller sounds, if switched on
// (Settings → Fun). Called from the places that already play the plain sound.

import { play } from '../../sound/sounds'
import { impactSoundsOn, particlesOn } from './fun'
import { burst, type BurstKind } from './particles'

const KIND_FOR_STATUS: Record<string, BurstKind | undefined> = { done: 'done', doing: 'doing', waiting: 'waiting' }

/** The sound for a status change: the fuller one if switched on and there is one, else null. */
export function impactSoundFor(status: string): 'impactDone' | 'impactDoing' | 'impactWaiting' | null {
  if (!impactSoundsOn()) return null
  return { done: 'impactDone', doing: 'impactDoing', waiting: 'impactWaiting' }[status] as
    | 'impactDone'
    | 'impactDoing'
    | 'impactWaiting'
    | undefined ?? null
}

/** Plays the status change's sound: the fuller one if on, otherwise the plain one. */
export function playStatusSound(status: string) {
  const impact = impactSoundFor(status)
  play(impact ?? (status === 'done' ? 'complete' : 'status'))
}

/**
 * Specks from a task's status circle once it has moved to its new status.
 * The row or card is found on screen a moment later, because a board card
 * lands in a new column only after the library reloads.
 */
export function statusBurst(id: string, status: string) {
  const kind = KIND_FOR_STATUS[status]
  if (!kind || !particlesOn()) return
  window.setTimeout(() => {
    const row = Array.from(document.querySelectorAll('[data-item]')).find((el) => el.getAttribute('data-item') === id)
    const circle = row?.querySelector('button') ?? row
    if (!circle) return
    const r = circle.getBoundingClientRect()
    if (r.width === 0) return
    burst(kind, r.left + 11, r.top + r.height / 2, 6)
  }, 160)
}

/** A little dust off the bottom of something that was just picked up. */
export function pickUpDust(rect: { left: number; top: number; width: number; height: number } | null | undefined) {
  if (!rect || !particlesOn()) return
  burst('dust', rect.left + rect.width / 2, rect.top + rect.height, rect.width * 0.6)
}
