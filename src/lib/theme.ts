// Light / dark / follow the system. Stored in this computer's browser storage
// (it's a per-computer preference, not part of your data).

import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type Theme = 'system' | 'light' | 'dark'

// Also read by the inline script in index.html; keep the two in step.
const KEY = 'theme'

function read(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Sets data-theme on <html> (tokens.css does the colors), and tells the
 * window too. The blurred material behind the sidebar is drawn by macOS, and
 * it follows the WINDOW's appearance, not the page's; without this, choosing
 * Light while macOS is dark leaves a dark blur behind light colors.
 */
export function applyTheme(theme: Theme = read()) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
  try {
    // null = follow the system again.
    void getCurrentWindow()
      .setTheme(theme === 'system' ? null : theme)
      .catch(() => {})
  } catch {
    // Not running inside the app (e.g. a plain browser): nothing to tell.
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Storage can be unavailable; the choice still applies until restart.
    }
  }, [theme])
  return [theme, setTheme]
}

/** Applies and remembers a theme from outside React state (the ⌘K menu). */
export function saveTheme(theme: Theme) {
  applyTheme(theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // As above: still applies until restart.
  }
}
