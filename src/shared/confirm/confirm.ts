// "Are you sure?" for the few things that need it (deleting something with
// items inside). Call `confirm()` from anywhere and await the answer; one
// <ConfirmHost/> in App.tsx draws the dialog.

import { useEffect, useState } from 'react'

export interface ConfirmRequest {
  title: string
  body: string
  /** The button that goes ahead, e.g. "Delete". */
  action: string
  danger?: boolean
}

type Pending = ConfirmRequest & { answer: (yes: boolean) => void }
let show: ((pending: Pending | null) => void) | null = null

/** Asks, and resolves true if you go ahead. With no host mounted it just says yes. */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  if (!show) return Promise.resolve(true)
  return new Promise((resolve) => {
    show?.({
      ...request,
      answer: (yes) => {
        show?.(null)
        resolve(yes)
      },
    })
  })
}

/** For ConfirmHost: the question being asked right now, if any. */
export function useConfirmRequest() {
  const [pending, setPending] = useState<Pending | null>(null)
  useEffect(() => {
    show = setPending
    return () => {
      show = null
    }
  }, [])
  return pending
}
