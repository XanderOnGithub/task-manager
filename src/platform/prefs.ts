// Small per-device UI preferences (sidebar open, and so on). Stored in the web
// view's localStorage: losing them is harmless, so every read and write is
// allowed to fail quietly. Real settings live in Rust (settings.json).

import { useEffect, useState } from 'react'

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`moss.${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`moss.${key}`, JSON.stringify(value))
  } catch {
    // Nothing to do: the preference just won't stick.
  }
}

/** Lets every component using a preference update when it's changed anywhere. */
const CHANGED = 'moss-pref-changed'

/** Like `writePref`, and tells `usePref` hooks that it changed. */
export function setPref(key: string, value: unknown) {
  writePref(key, value)
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: key }))
}

/** A preference as React state: re-renders when `setPref` changes it anywhere. */
export function usePref<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback))
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setValue(readPref(key, fallback))
    }
    window.addEventListener(CHANGED, onChange)
    return () => window.removeEventListener(CHANGED, onChange)
    // The fallback is a constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return [value, (next: T) => setPref(key, next)]
}

/** Calls `listener` whenever `setPref` changes `key`. Returns a function that stops listening. */
export function onPrefChange(key: string, listener: () => void): () => void {
  const onChange = (e: Event) => {
    if ((e as CustomEvent<string>).detail === key) listener()
  }
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}
