// Light / dark / follow the system. Stored in this computer's browser storage
// (it's a per-computer preference, not part of your data).

import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'theme'

function read(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Sets data-theme on <html>; tokens.css does the rest. */
export function applyTheme(theme: Theme = read()) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
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
