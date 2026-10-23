// Whether the window is narrow enough for the phone layout: the sidebar becomes
// a drawer, the details panel a sheet, and a bar of the main places sits at the
// bottom. The same breakpoint is used in CSS as Tailwind's `max-md:` (under
// 768px), so styles and structure always change together.

import { useSyncExternalStore } from 'react'

/** Matches Tailwind's `max-md`. */
export const COMPACT_QUERY = '(max-width: 767px)'

const query = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY) : null)

function subscribe(onChange: () => void) {
  const list = query()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

/** True while the window is narrower than 768px. Changes live as it is resized. */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false)
}
