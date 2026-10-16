// The app's motion vocabulary. Every animation uses one of these, so the whole
// app moves the same way.
//
// Springs, not fixed durations: they follow real time (smooth at 60 or 120fps),
// and if you click again mid-animation they redirect from where they are
// instead of jumping. `visualDuration` is roughly how long it looks like it
// takes; `bounce` is how much it overshoots (0 = settles with no overshoot).
//
// Rules (see CLAUDE.md → Motion):
// - Motion explains cause and effect: where something came from, where it went.
// - Fast and interruptible. Most things use `snappy`.
// - Overshoot (`pop`) only for moments worth noticing: completing, dropping.

import type { Transition } from 'motion/react'

export const spring = {
  /** Default for most UI: hovers that move, selections, small changes. */
  snappy: { type: 'spring', visualDuration: 0.14, bounce: 0 },
  /** Things that change size: opening a folder, a panel sliding in. */
  smooth: { type: 'spring', visualDuration: 0.22, bounce: 0 },
  /** A little overshoot for completing a task or dropping a card. */
  pop: { type: 'spring', visualDuration: 0.26, bounce: 0.32 },
} satisfies Record<string, Transition>

/** Delay between rows when a group opens. Enough to read as a flow, never a wait. */
export const STAGGER = 0.01
