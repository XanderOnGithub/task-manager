// The system folder picker, shared by Settings and the first-launch screens.

import { open } from '@tauri-apps/plugin-dialog'

/** Opens the native folder picker. Returns the chosen folder, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const chosen = await open({ directory: true, title: 'Choose a data folder' })
  return typeof chosen === 'string' ? chosen : null
}

/** Opens the native file picker for a backup zip. Returns the chosen file, or null if cancelled. */
export async function pickBackupFile(): Promise<string | null> {
  const chosen = await open({ title: 'Choose a backup', filters: [{ name: 'Backup', extensions: ['zip'] }] })
  return typeof chosen === 'string' ? chosen : null
}
