// Small facts about where the app is running.

/** macOS draws the traffic lights in the sidebar's top-left corner. */
export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

/** The Android app. It updates through a new APK, not the in-app updater. */
export const isAndroid = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent)

/**
 * How a shortcut is written on this computer: "⌘N" on a Mac, "Ctrl+N" on
 * Windows and Linux. (The keys themselves accept both ⌘ and Ctrl everywhere.)
 */
export function keys(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}
