// Settings → Fun: extras that make the app feel good to use. All of them are
// off until you turn them on, none adds a step, and they react to what you
// already did. Particles never run when the system's Reduce motion is on.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  IMPACT_SOUND_INFO,
  play,
  playRelease,
  setSoundSettings,
  soundSettings,
  TYPING_STYLE_INFO,
  type SoundName,
  type SoundSettings,
} from '../../sound/sounds'
import { Menu } from '../../shared/controls'
import { useImpactSoundsPref, useParticlesPref, prefersReducedMotion } from '../../shared/impact/fun'
import { burst } from '../../shared/impact/particles'
import { SoundRow } from './SoundsTab'

export function FunTab() {
  const [value, setValue] = useState<SoundSettings>(soundSettings)
  const [particles, setParticles] = useParticlesPref()
  const [impactSounds, setImpactSounds] = useImpactSoundsPref()
  const reduced = prefersReducedMotion()

  const update = (next: SoundSettings) => {
    setValue(next)
    setSoundSettings(next)
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
  const demoParticles = () => {
    const x = window.innerWidth / 2
    const y = window.innerHeight / 2
    burst('doing', x - 90, y, 10)
    burst('done', x, y, 10)
    burst('waiting', x + 90, y, 10)
  }

  return (
    <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto p-5">
      <p className="text-meta font-normal text-fg-3">
        Small extras that make the app feel good. They are off until you turn them on. None of them adds a step.
      </p>

      <div className="flex flex-col gap-1">
        <div className="pb-1 text-label tracking-label text-fg-3 uppercase">Particles</div>
        <SoundRow
          label="Particles"
          when={
            reduced
              ? 'Off while Reduce motion is on in your system settings.'
              : 'Tiny specks when a task is finished, started or put on hold, and dust when you pick something up.'
          }
          on={particles && !reduced}
          onTest={demoParticles}
          onToggle={(on) => {
            setParticles(on)
            if (on) demoParticles()
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="pb-1 text-label tracking-label text-fg-3 uppercase">Impact sounds</div>
        <SoundRow
          label="Impact sounds"
          when="Fuller sounds for Done, Doing and Waiting, in place of the plain ones. Uses the Sounds volume."
          on={impactSounds}
          onTest={() => play('impactDone', { force: true })}
          onToggle={(on) => {
            setImpactSounds(on)
            if (on) play('impactDone', { force: true })
          }}
        />
        <div className="flex flex-col gap-1 pl-4">
          {IMPACT_SOUND_INFO.map(({ name, label, when }) => (
            <SoundRow
              key={name}
              label={label}
              when={when}
              on={!value.muted.includes(name)}
              onTest={() => play(name, { force: true })}
              onToggle={(on) => {
                update({ ...value, muted: on ? value.muted.filter((n) => n !== name) : [...value.muted, name] })
                if (on) play(name, { force: true })
              }}
            />
          ))}
        </div>
        {!value.on && <p className="text-label font-normal text-fg-3">Sounds are off in the Sounds tab.</p>}
      </div>

      <div className="flex flex-col gap-1">
        <div className="pb-1 text-label tracking-label text-fg-3 uppercase">Typing</div>
        <SoundRow
          label="Typing sounds"
          when="A soft keyboard click as you type in any text field."
          on={value.typing}
          onTest={demoTyping}
          onToggle={(typing) => {
            update({ ...value, typing })
            if (typing) demoTyping()
          }}
        />
        {/* Which keyboard sound. Picking one plays a sample of it. */}
        <div className="flex min-h-10 items-center gap-3 py-1 pr-0.5 pl-11">
          <span className="flex-1 text-meta font-normal text-fg-3">Typing sound</span>
          <Menu
            label={`Typing sound: ${TYPING_STYLE_INFO.find((style) => style.id === value.typingStyle)?.label ?? 'Soft'}`}
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
