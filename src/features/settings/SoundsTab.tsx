// Settings → Sounds: everything on/off, volume, and each sound on its own.

import { useState } from 'react'
import { Play } from 'lucide-react'
import {
  play,
  setSoundSettings,
  SOUND_INFO,
  soundSettings,
  type SoundName,
  type SoundSettings,
} from '../../sound/sounds'
import { Switch } from '../../shared/controls'

/** Settings → Sounds: everything on/off, volume, and each sound on its own. */
export function SoundsTab() {
  const [value, setValue] = useState<SoundSettings>(soundSettings)
  const update = (next: SoundSettings) => {
    setValue(next)
    setSoundSettings(next)
  }
  const toggle = (name: SoundName, on: boolean) => {
    update({ ...value, muted: on ? value.muted.filter((n) => n !== name) : [...value.muted, name] })
    if (on) play(name, { force: true })
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

      <p className="text-meta font-normal text-fg-3">Typing sounds, fuller sounds and particles are under Fun.</p>
    </div>
  )
}

export function SoundRow({
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
