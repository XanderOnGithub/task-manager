// Small per-device UI preferences (sidebar open, and so on). Stored in the web
// view's localStorage: losing them is harmless, so every read and write is
// allowed to fail quietly. Real settings live in Rust (settings.json).

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
