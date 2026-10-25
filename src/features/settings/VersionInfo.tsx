// The footer of Settings: which build this is, and whether there is a newer one.

import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { checkForUpdate, installUpdate, useUpdates } from '../../platform/updates'
import { isAndroid } from '../../platform/os'

/** Which build this is: "Alpha 0.1.0". The version comes from the app itself (tauri.conf.json), the stage from package.json. */
export function VersionInfo() {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])
  const stage = __APP_STAGE__ ? __APP_STAGE__[0].toUpperCase() + __APP_STAGE__.slice(1) : ''
  return (
    // A quiet footer under both tabs.
    <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-meta font-normal text-fg-3">
      <span>Moss</span>
      <span className="select-text">
        {stage} <span className="font-mono">{version ?? '…'}</span>
      </span>
      <span className="flex-1" />
      {!isAndroid && <UpdateStatus />}
    </div>
  )
}

/** Settings footer: check for a new version, and what came of it. */
function UpdateStatus() {
  const update = useUpdates()
  const button = (label: string, onClick: () => void) => (
    <button onClick={onClick} className="rounded-control px-1.5 py-0.5 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg">
      {label}
    </button>
  )
  switch (update.status) {
    case 'checking':
      return <span>Checking</span>
    case 'none':
      return <span>Up to date</span>
    case 'available':
      return button(`Update to ${update.version}`, () => void installUpdate())
    case 'installing':
      return <span className="tabular-nums">Updating{update.percent !== null ? ` ${update.percent}%` : ''}</span>
    case 'error':
      return (
        <span className="flex items-center gap-1.5">
          <span className="text-danger">{update.message}</span>
          {button('Try again', () => void checkForUpdate(true))}
        </span>
      )
    default:
      return button('Check for updates', () => void checkForUpdate(true))
  }
}
