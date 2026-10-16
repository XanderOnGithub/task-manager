// Measures how many frames per second the window is actually drawing, by
// counting requestAnimationFrame callbacks. Shows whether 120fps is working.

import { useEffect, useState } from 'react'

/** Frames per second, updated twice a second. Null until the first reading. */
export function useFrameRate(active = true): number | null {
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    if (!active) return
    let frames = 0
    let start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      frames += 1
      if (now - start >= 500) {
        setFps(Math.round((frames * 1000) / (now - start)))
        frames = 0
        start = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  return fps
}
