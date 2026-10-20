// Settings → General: where your files are, and the everyday switches.

import { FolderOpen } from 'lucide-react'
import { pickFolder } from '../../platform/folders'
import { setDataFolder } from '../../platform/api'
import { isMac } from '../../platform/os'
import { useTheme, type Theme } from '../../platform/theme'
import { Segmented } from '../../shared/controls'
import { useToast } from '../../shared/toast/toast'
import { HighRefreshSetting } from './HighRefreshSetting'
import { KeyboardHelp } from './KeyboardHelp'
import { LanesSetting } from './LanesSetting'
import { WordCountSetting } from './WordCountSetting'

export function GeneralTab({
  dataFolder,
  onFolderChanged,
}: {
  dataFolder: string | null
  onFolderChanged: () => Promise<void>
}) {
  const [theme, setTheme] = useTheme()
  const toast = useToast()

  const change = async () => {
    const folder = await pickFolder()
    if (!folder) return
    try {
      await setDataFolder(folder)
      await onFolderChanged()
      toast({ message: 'Opened data folder' })
    } catch (e) {
      toast({ message: String(e), tone: 'error' })
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-meta text-fg-2">Data folder</div>
        {/* The one place a path is shown: it's the setting itself. */}
        <div className="rounded-control border border-border bg-field px-2.5 py-2 font-mono text-meta font-normal break-all text-fg-2 select-text">
          {dataFolder ?? 'None chosen'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void change()}
            className="flex h-7 items-center gap-1.5 rounded-control bg-raised px-3 transition-colors duration-100 hover:bg-hover"
          >
            <FolderOpen size={14} strokeWidth={1.75} aria-hidden="true" />
            Choose folder
          </button>
        </div>
        <p className="text-meta font-normal text-fg-3">
          Plain markdown files. Use the Sync tab to keep them in a GitHub repository, or point any folder sync at them.
        </p>
      </div>

      <WordCountSetting />

      <LanesSetting />

      {/* Only macOS caps the web view at 60fps; Windows and Linux already
          draw at the display's refresh rate, so there's nothing to switch. */}
      {isMac && <HighRefreshSetting />}

      <div className="flex flex-col gap-2">
        <div className="text-meta text-fg-2">Appearance</div>
        <Segmented<Theme>
          label="Appearance"
          size="sm"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </div>

      <KeyboardHelp />
    </>
  )
}
