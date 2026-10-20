// Quick capture (⌘N) and Settings. (First launch is in Onboarding.tsx.)

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, FolderOpen, Layers, Play } from 'lucide-react'
import { spring } from '../lib/motion'
import { getVersion } from '@tauri-apps/api/app'
import { getHighRefresh, setDataFolder, setHighRefresh, type HighRefresh } from '../lib/api'
import { useTheme, type Theme } from '../lib/theme'
import { useToast } from '../lib/toast'
import { pickFolder } from '../lib/folders'
import { useConfirmRequest } from '../lib/confirm'
import { checkForUpdate, installUpdate, useUpdates } from '../lib/updates'
import { usePref } from '../lib/prefs'
import { isMac, keys } from '../lib/platform'
import { LANES, OPTIONAL, useOptionalLanes } from '../lib/lanes'
import { Menu, Modal, Segmented, Switch } from './controls'
import { StatusIcon } from './ui'
import { SyncTab } from './SyncSettings'
import {
  play,
  playRelease,
  setSoundSettings,
  SOUND_INFO,
  soundSettings,
  TYPING_STYLE_INFO,
  type SoundName,
  type SoundSettings,
} from '../lib/sounds'

export function QuickCapture({ onCapture, onClose }: { onCapture: (text: string) => Promise<unknown>; onClose: () => void }) {
  const [text, setText] = useState('')

  const submit = async () => {
    if (!text.trim()) return
    onClose()
    await onCapture(text.trim())
  }

  return (
    <Modal label="Quick capture" onClose={onClose} width="w-[560px]">
      <label className="flex h-[52px] items-center gap-3 px-4 text-fg-3">
        <Layers size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Add to Unsorted"
          aria-label="Add to Unsorted"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-placeholder"
        />
        <kbd className="font-mono text-label font-normal">↵</kbd>
      </label>
    </Modal>
  )
}

export function Settings({
  dataFolder,
  onClose,
  onFolderChanged,
}: {
  dataFolder: string | null
  onClose: () => void
  onFolderChanged: () => Promise<void>
}) {
  const [theme, setTheme] = useTheme()
  const [tab, setTab] = useState<'general' | 'sync' | 'sounds'>('general')
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
    <Modal label="Settings" onClose={onClose} width="w-[520px]">
      <div className="flex items-center gap-3 px-5 pt-5">
        <h2 className="flex-1 text-heading">Settings</h2>
        <Segmented<'general' | 'sync' | 'sounds'>
          label="Settings section"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'general', label: 'General' },
            { value: 'sync', label: 'Sync' },
            { value: 'sounds', label: 'Sounds' },
          ]}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {tab === 'sounds' ? (
          <motion.div key="sounds" {...tabMotion(1)}>
            <SoundsTab />
          </motion.div>
        ) : tab === 'sync' ? (
          <motion.div key="sync" {...tabMotion(1)}>
            <SyncTab />
          </motion.div>
        ) : (
          <motion.div key="general" {...tabMotion(-1)} className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto p-5">
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
                Plain markdown files. Point any folder sync at it to use it on another computer.
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
          </motion.div>
        )}
      </AnimatePresence>
      <VersionInfo />
    </Modal>
  )
}

/** Tabs slide a little toward the side they come from. */
const tabMotion = (side: number) => ({
  initial: { opacity: 0, x: 10 * side },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 * side },
  transition: spring.snappy,
})

/** Settings → Sounds: everything on/off, volume, each sound on its own, and the Fun corner. */
function SoundsTab() {
  const [value, setValue] = useState<SoundSettings>(soundSettings)
  const update = (next: SoundSettings) => {
    setValue(next)
    setSoundSettings(next)
  }
  const toggle = (name: SoundName, on: boolean) => {
    update({ ...value, muted: on ? value.muted.filter((n) => n !== name) : [...value.muted, name] })
    if (on) play(name, { force: true })
  }
  // A little typed phrase, for hearing the keyboard sounds without typing.
  const demoTyping = () => {
    const keys: SoundName[] = ['keyShift', 'key', 'key', 'key', 'keySpace', 'key', 'key', 'keyDelete', 'keyDelete', 'key', 'keyShift', 'keyEnter']
    keys.forEach((k, i) => {
      const at = i * 95 + Math.random() * 30
      window.setTimeout(() => play(k, { force: true }), at)
      // Styles with a release sound play it as the key comes back up.
      window.setTimeout(() => playRelease(k, { force: true }), at + 60)
    })
  }

  return (
    <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-meta text-fg-2">Sounds</span>
            <span className="text-meta font-normal text-fg-3">Soft, quiet sounds when something changes.</span>
          </div>
          <Switch
            label="Sounds"
            checked={value.on}
            onChange={(on) => {
              update({ ...value, on })
              if (on) play('complete', { force: true })
            }}
          />
        </div>
        <label className={`flex items-center gap-3 transition-opacity duration-150 ${value.on ? '' : 'opacity-40'}`}>
          <span className="w-[52px] text-meta font-normal text-fg-3">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.volume}
            disabled={!value.on}
            onChange={(e) => update({ ...value, volume: Number(e.currentTarget.value) })}
            // Play a sample when you let go, so you hear the new level.
            onPointerUp={() => play('complete')}
            onKeyUp={() => play('complete')}
            aria-label="Sound volume"
            className="flex-1 accent-accent"
          />
        </label>
      </div>

      <div className={`flex flex-col gap-1 transition-opacity duration-150 ${value.on ? '' : 'pointer-events-none opacity-40'}`}>
        <div className="pb-1 text-label tracking-label text-fg-3 uppercase">Each sound</div>
        {SOUND_INFO.map(({ name, label, when }) => (
          <SoundRow
            key={name}
            label={label}
            when={when}
            on={!value.muted.includes(name)}
            onTest={() => play(name, { force: true })}
            onToggle={(on) => toggle(name, on)}
          />
        ))}
      </div>

      <div className={`flex flex-col gap-1 transition-opacity duration-150 ${value.on ? '' : 'pointer-events-none opacity-40'}`}>
        <div className="pb-1 text-label tracking-label text-fg-3 uppercase">Fun</div>
        <SoundRow
          label="Typing"
          when="A soft keyboard click as you type in any text field. Off by default."
          on={value.typing}
          onTest={demoTyping}
          onToggle={(typing) => {
            update({ ...value, typing })
            if (typing) demoTyping()
          }}
        />
        {/* Which keyboard sound. Picking one plays a sample of it. */}
        <div className={`flex min-h-10 items-center gap-3 py-1 pr-0.5 pl-11 transition-opacity duration-150 ${value.typing ? '' : 'opacity-40'}`}>
          <span className="flex-1 text-meta font-normal text-fg-3">Typing sound</span>
          <Menu
            label="Typing sound"
            items={TYPING_STYLE_INFO.map(({ id, label }) => ({
              label,
              onSelect: () => {
                update({ ...value, typingStyle: id })
                demoTyping()
              },
            }))}
            trigger={
              <span className="flex h-7 items-center gap-1.5 rounded-control bg-raised pr-1.5 pl-2.5 text-meta text-fg transition-colors duration-100 hover:bg-hover">
                {TYPING_STYLE_INFO.find((style) => style.id === value.typingStyle)?.label ?? 'Soft'}
                <ChevronDown size={14} strokeWidth={1.75} className="text-fg-3" aria-hidden="true" />
              </span>
            }
          />
        </div>
      </div>
    </div>
  )
}

function SoundRow({
  label,
  when,
  on,
  onTest,
  onToggle,
}: {
  label: string
  when: string
  on: boolean
  onTest: () => void
  onToggle: (on: boolean) => void
}) {
  return (
    <div className="flex min-h-10 items-center gap-3 rounded-control py-1 pr-0.5 pl-1">
      <button
        onClick={onTest}
        aria-label={`Play ${label}`}
        title="Play"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-fg-2 transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-fg active:scale-90"
      >
        <Play size={12} strokeWidth={2.25} className="translate-x-px" aria-hidden="true" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={on ? 'text-fg' : 'text-fg-3'}>{label}</span>
        <span className="truncate text-label font-normal text-fg-3">{when}</span>
      </div>
      <Switch label={label} checked={on} onChange={onToggle} />
    </div>
  )
}

/** Which build this is: "Alpha 0.1.0". The version comes from the app itself (tauri.conf.json), the stage from package.json. */
function VersionInfo() {
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
      <UpdateStatus />
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

/** Extra task lanes: Later and Waiting, on top of Todo, Doing and Done. */
function LanesSetting() {
  const [on, setOn] = useOptionalLanes()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-meta text-fg-2">Board lanes</span>
        <span className="text-meta font-normal text-fg-3">Todo, Doing and Done are always on. Add these as you need them.</span>
      </div>
      {LANES.filter((lane) => OPTIONAL.includes(lane.status)).map((lane) => (
        <div key={lane.status} className="flex items-center gap-3">
          <StatusIcon status={lane.status} size={15} />
          <div className="flex flex-1 flex-col">
            <span className="text-fg">{lane.label}</span>
            <span className="text-label font-normal text-fg-3">{lane.hint}</span>
          </div>
          <Switch
            label={lane.label}
            checked={on.includes(lane.status)}
            onChange={(checked) => setOn(checked ? [...on, lane.status] : on.filter((s) => s !== lane.status))}
          />
        </div>
      ))}
    </div>
  )
}

/** The keyboard shortcuts, for reference. Rows: lib/rowKeys.ts; the rest: App.tsx. */
function KeyboardHelp() {
  const shortcuts: [string, string][] = [
    [keys('N'), 'Quick capture'],
    [keys('K'), 'Search and commands'],
    [keys('\\'), 'Hide or show the sidebar'],
    [keys('Z'), 'Undo the last change'],
    ['↑ ↓', 'Move between rows'],
    ['← →', 'Move between board columns'],
    ['Enter', 'Open the row'],
    ['S', 'Next status'],
    ['Delete', 'Delete the row'],
    ['Space', 'Pick up the row, then arrows and Space to move it'],
    ['Esc', 'Close details'],
    [keys('Enter'), 'In a page: tick or untick the checklist item'],
    ['Shift+F10', 'Open the menu of the focused row'],
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="text-meta text-fg-2">Keyboard</div>
      <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-4 gap-y-1.5">
        {shortcuts.map(([key, what]) => (
          <div key={what} className="contents">
            <dt className="font-mono text-meta font-normal text-fg-2">{key}</dt>
            <dd className="text-meta font-normal text-fg-3">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Pages: the word and character count in the bottom-right corner. */
function WordCountSetting() {
  const [on, setOn] = usePref('wordCount', true)
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-meta text-fg-2">Word count</span>
        <span className="text-meta font-normal text-fg-3">
          Words and characters in the corner of a page. Select text to count just that.
        </span>
      </div>
      <Switch label="Word count" checked={on} onChange={setOn} />
    </div>
  )
}

/**
 * Experimental: draw at 120fps on ProMotion displays. macOS only (the
 * Settings dialog doesn't render it anywhere else).
 */
function HighRefreshSetting() {
  const [state, setState] = useState<HighRefresh | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    getHighRefresh()
      .then(setState)
      .catch(() => setState({ supported: false, enabled: false }))
  }, [])

  const change = async (enabled: boolean) => {
    setBusy(true)
    try {
      await setHighRefresh(enabled)
      // The new frame rate applies to a fresh page.
      window.location.reload()
    } catch (e) {
      toast({ message: String(e), tone: 'error' })
      setBusy(false)
    }
  }

  // If the Rust side says it can't flip the flag, don't offer a dead switch.
  if (state && !state.supported) return null

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-meta text-fg-2">Smoother animation (120fps)</span>
        <span className="text-meta font-normal text-fg-3">
          Experimental. Uses a little more battery on ProMotion displays.
        </span>
      </div>
      <Switch
        label="Smoother animation"
        checked={state?.enabled ?? false}
        disabled={!state || busy}
        onChange={(enabled) => void change(enabled)}
      />
    </div>
  )
}

/** The "Are you sure?" dialog (see lib/confirm.ts). Enter goes ahead, Escape cancels. */
export function ConfirmHost() {
  const request = useConfirmRequest()
  if (!request) return null
  return (
    <Modal label={request.title} onClose={() => request.answer(false)} width="w-[400px]">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          request.answer(true)
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-heading">{request.title}</h2>
          <p className="text-fg-2">{request.body}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => request.answer(false)}
            className="flex h-8 items-center rounded-row px-3 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
          >
            Cancel
          </button>
          <button
            autoFocus
            type="submit"
            className={`flex h-8 items-center rounded-row px-3.5 font-medium transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.97] ${
              request.danger ? 'bg-danger text-on-accent' : 'bg-accent text-on-accent'
            }`}
          >
            {request.action}
          </button>
        </div>
      </form>
    </Modal>
  )
}
