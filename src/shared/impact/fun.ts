// The fun switches (Settings → Fun). Everything here is off until someone turns
// it on, and it never adds a step: it only reacts to what you already did.
// Typing sounds are a "fun" setting too, but they live with the other sound
// settings in `sound/sounds.ts`.

import { usePref, readPref } from '../../platform/prefs'

const PARTICLES = 'fun.particles'
const IMPACT_SOUNDS = 'fun.impactSounds'

/** Tiny specks when something is picked up, finished or put on hold. */
export const useParticlesPref = () => usePref(PARTICLES, false)
/** Fuller sounds for Done, Doing and Waiting. */
export const useImpactSoundsPref = () => usePref(IMPACT_SOUNDS, false)

export const particlesOn = () => readPref(PARTICLES, false) && !prefersReducedMotion()
export const impactSoundsOn = () => readPref(IMPACT_SOUNDS, false)

/** The operating system's Reduce motion setting. Particles never run with it on. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
