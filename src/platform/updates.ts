// In-app updates. Moss checks the latest GitHub release a few seconds after
// it opens (and when you press "Check for updates" in Settings). The release
// workflow publishes a small latest.json with signed update files; if it
// names a newer version, the sidebar offers "Update to X", which downloads,
// installs and restarts. Development builds never check on their own.

import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isAndroid } from './os'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'available'; version: string }
  | { status: 'installing'; version: string; percent: number | null }
  | { status: 'error'; message: string }

let state: UpdateState = { status: 'idle' }
let found: Update | null = null
const listeners = new Set<(s: UpdateState) => void>()

function set(next: UpdateState) {
  state = next
  listeners.forEach((listener) => listener(next))
}

/** Asks GitHub for a newer version. Quiet about failures unless `manual`. */
export async function checkForUpdate(manual = false) {
  // The phone app has no updater: a new version is a new APK.
  if (isAndroid) return
  if (state.status === 'checking' || state.status === 'installing') return
  set({ status: 'checking' })
  try {
    found = await check()
    set(found ? { status: 'available', version: found.version } : { status: 'none' })
  } catch (e) {
    // Offline, or no updater files yet: nothing to offer.
    set(manual ? { status: 'error', message: "Couldn't check for updates" } : { status: 'idle' })
    if (import.meta.env.DEV) console.warn('Update check failed', e)
  }
}

/** Downloads and installs the update found, then restarts Moss. */
export async function installUpdate() {
  if (!found) return
  const version = found.version
  let total = 0
  let done = 0
  set({ status: 'installing', version, percent: null })
  try {
    await found.downloadAndInstall((event) => {
      if (event.event === 'Started') total = event.data.contentLength ?? 0
      if (event.event === 'Progress') {
        done += event.data.chunkLength
        set({ status: 'installing', version, percent: total ? Math.round((done / total) * 100) : null })
      }
    })
    await relaunch()
  } catch {
    set({ status: 'error', message: "Couldn't install the update. Try again, or download it from GitHub." })
  }
}

/** The current update state, kept fresh. Checks once a few seconds after launch in real builds. */
export function useUpdates(): UpdateState {
  const [current, setCurrent] = useState(state)
  useEffect(() => {
    listeners.add(setCurrent)
    return () => {
      listeners.delete(setCurrent)
    }
  }, [])
  return current
}

let checkedOnLaunch = false
/** Call once from App: the quiet check after launch. */
export function useLaunchCheck() {
  useEffect(() => {
    if (checkedOnLaunch || import.meta.env.DEV || isAndroid) return
    checkedOnLaunch = true
    const timer = window.setTimeout(() => void checkForUpdate(), 4000)
    return () => window.clearTimeout(timer)
  }, [])
}
