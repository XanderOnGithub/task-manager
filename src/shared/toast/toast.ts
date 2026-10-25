// Toasts: short confirmations at the bottom of the window, optionally with Undo.
// Language rule: past tense, name the destination ("Moved to Replace the sink").

import { createContext, useContext } from 'react'

export interface ToastInput {
  message: string
  /** Shows an Undo button that runs this. */
  undo?: () => Promise<unknown> | void
  tone?: 'default' | 'error'
}

export const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

/** `const toast = useToast(); toast({ message: 'Deleted Pick tile', undo })` */
export const useToast = () => useContext(ToastContext)
