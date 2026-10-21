// Settings → Backups: a zip of the data folder about once a day, one on
// request, and restoring from any of them (or from a zip you pick). The work
// is in core/src/backup/ and src-tauri/src/backup/.

import { useCallback, useEffect, useState } from 'react'
import { Archive, FolderOpen, RotateCcw } from 'lucide-react'
import {
  backUpNow,
  getBackups,
  restoreBackup,
  revealBackups,
  setAutomaticBackups,
  type Backup,
  type Backups,
} from '../../platform/api'
import { pickBackupFile } from '../../platform/folders'
import { confirm } from '../../shared/confirm/confirm'
import { Switch } from '../../shared/controls'
import { useToast } from '../../shared/toast/toast'

const buttonClass =
  'flex h-7 items-center gap-1.5 rounded-control bg-raised px-3 transition-colors duration-100 hover:bg-hover disabled:opacity-50'

const KIND_LABEL: Record<Backup['kind'], string> = {
  automatic: 'Automatic',
  manual: 'Made by you',
  beforeRestore: 'Before a restore',
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export function BackupTab() {
  const toast = useToast()
  const [info, setInfo] = useState<Backups | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(
    () =>
      getBackups()
        .then((next) => {
          setInfo(next)
          setFailed(false)
        })
        .catch(() => setFailed(true)),
    [],
  )
  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true)
    try {
      const message = await work()
      if (message) toast({ message })
    } catch (e) {
      toast({ message: String(e), tone: 'error' })
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const restore = async (path: string, name: string) => {
    const yes = await confirm({
      title: `Restore ${name}?`,
      body: 'This replaces everything in your data folder with what is in the backup. Moss makes a backup of the current files first, so you can come back to them.',
      action: 'Restore',
      danger: true,
    })
    if (!yes) return
    await run(async () => {
      await restoreBackup(path)
      return `Restored ${name}`
    })
  }

  if (failed) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <p className="text-meta font-normal text-fg-2">Couldn't read the backups.</p>
        <div>
          <button className={buttonClass} onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (!info) return <div className="p-5 text-meta font-normal text-fg-3">Loading</div>

  return (
    <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto p-5">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <span>Back up automatically</span>
          <span className="text-meta font-normal text-fg-3">About once a day. Moss keeps the newest 14.</span>
        </div>
        <Switch
          label="Back up automatically"
          checked={info.automatic}
          onChange={(automatic) => {
            setInfo({ ...info, automatic })
            void run(() => setAutomaticBackups(automatic))
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass}
          disabled={busy}
          onClick={() => void run(async () => (await backUpNow(), 'Backed up'))}
        >
          <Archive size={14} strokeWidth={1.75} aria-hidden="true" />
          Back up now
        </button>
        <button
          className={buttonClass}
          disabled={busy}
          onClick={async () => {
            const file = await pickBackupFile()
            if (file) await restore(file, 'the chosen file')
          }}
        >
          Restore from a file
        </button>
        <button className={buttonClass} onClick={() => void revealBackups().catch(() => {})}>
          <FolderOpen size={14} strokeWidth={1.75} aria-hidden="true" />
          Show backups
        </button>
      </div>

      {info.items.length === 0 ? (
        <p className="text-meta font-normal text-fg-3">No backups yet.</p>
      ) : (
        <ul aria-label="Backups" className="flex flex-col">
          {info.items.map((b) => (
            <li key={b.path} className="flex h-10 items-center gap-3 border-t border-border first:border-t-0">
              <span className="flex-1 truncate">{b.when}</span>
              <span className="text-meta font-normal text-fg-3">{KIND_LABEL[b.kind]}</span>
              <span className="w-14 text-right text-meta font-normal text-fg-3">{size(b.bytes)}</span>
              <button
                className={buttonClass}
                disabled={busy}
                aria-label={`Restore the backup from ${b.when}`}
                onClick={() => void restore(b.path, `the backup from ${b.when}`)}
              >
                <RotateCcw size={13} strokeWidth={1.75} aria-hidden="true" />
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
