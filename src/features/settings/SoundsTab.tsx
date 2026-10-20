// Settings → Sounds: everything on/off, volume, each sound on its own, and the Fun corner.

import { useState } from 'react'
import { ChevronDown, Play } from 'lucide-react'
import {
  play,
  playRelease,
  setSoundSettings,
  SOUND_INFO,
  soundSettings,
  TYPING_STYLE_INFO,
  type SoundName,
  type SoundSettings,
} from '../../sound/sounds'
import { Menu, Switch } from '../../shared/controls'

/** Settings → Sounds: everything on/off, volume, each sound on its own, and the Fun corner. */
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
