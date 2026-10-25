// First launch: two short screens before the app opens.
//   1. What Moss is, in three lines (capture, sort, write).
//   2. Where your files go: Documents/Moss with one click, or any folder, and
//      whether to start with the example (a small home renovation).
// Shown whenever no data folder is set yet (development builds skip it unless
// started with MOSS_ONBOARDING=1).

import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, FileText, FolderOpen, Layers, Target, type LucideIcon } from 'lucide-react'
import { startDataFolder, suggestedDataFolder, syncConnect, type GithubRepo } from '../../platform/api'
import { pickFolder } from '../../platform/folders'
import { spring } from '../../shared/motion/springs'
import { isMac, keys } from '../../platform/os'
import { useToast } from '../../shared/toast/toast'
import { useSync } from '../sync/useSync'
import { MossWordmark } from '../../shared/Brand'
import { ExistingRepo, SignIn } from '../sync/SyncSettings'

type Choice = { kind: 'suggested' } | { kind: 'other'; path: string }

export function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  return (
    // The whole window is a drag handle, like the sidebar's top row.
    <main data-tauri-drag-region className={`flex h-full items-center justify-center p-6 ${isMac ? 'bg-window' : 'bg-window-solid'}`}>
      <section
        aria-label="Welcome to Moss"
        className="flex w-[460px] max-w-full flex-col overflow-hidden rounded-window border border-border bg-panel shadow-window"
      >
        {/* The other steps have their own heading. */}
        {step === 1 && <h1 className="sr-only">Welcome to Moss</h1>}
        {/* Steps slide toward the side they come from. */}
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 ? (
            <motion.div key="welcome" {...slide(-1)} className="flex flex-col gap-6 p-8">
              <Welcome onNext={() => setStep(2)} />
            </motion.div>
          ) : step === 2 ? (
            <motion.div key="folder" {...slide(1)} className="flex flex-col gap-5 p-8">
              <FolderStep onBack={() => setStep(1)} onGithub={() => setStep(3)} onDone={onDone} />
            </motion.div>
          ) : (
            <motion.div key="github" {...slide(1)} className="flex flex-col gap-5 p-8">
              <GithubStep onBack={() => setStep(2)} onDone={onDone} />
            </motion.div>
          )}
        </AnimatePresence>
        <Dots step={step} />
      </section>
    </main>
  )
}

const slide = (side: number) => ({
  initial: { opacity: 0, x: 14 * side },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 14 * side },
  transition: spring.snappy,
})

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <MossWordmark className="h-10 w-[141px] shrink-0 self-start" />
        <p className="text-lead text-fg-2">Tasks and pages, kept as plain files on this computer.</p>
      </div>
      <ul className="flex flex-col gap-3.5">
        <Idea Icon={Layers} title="Capture first">
          Anything goes into Unsorted. <kbd className="font-mono text-meta font-normal">{keys('N')}</kbd> from anywhere.
        </Idea>
        <Idea Icon={Target} title="Sort when you're ready">
          Into areas, projects, milestones and tasks.
        </Idea>
        <Idea Icon={FileText} title="Write next to the work">
          Pages live with the area or project they're about.
        </Idea>
      </ul>
      <div className="flex justify-end">
        <PrimaryButton autoFocus onClick={onNext}>
          Continue
        </PrimaryButton>
      </div>
    </>
  )
}

function Idea({ Icon, title, children }: { Icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-raised text-fg-2">
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="font-medium text-fg">{title}</span>
        <span className="text-fg-3">{children}</span>
      </span>
    </li>
  )
}

function FolderStep({ onBack, onGithub, onDone }: { onBack: () => void; onGithub: () => void; onDone: () => Promise<void> }) {
  const [suggested, setSuggested] = useState<{ path: string; display: string } | null>(null)
  const [choice, setChoice] = useState<Choice>({ kind: 'suggested' })
  const [example, setExample] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    suggestedDataFolder()
      .then(setSuggested)
      .catch(() => setChoice({ kind: 'other', path: '' }))
  }, [])

  const chooseOther = async () => {
    const path = await pickFolder()
    if (path) setChoice({ kind: 'other', path })
  }

  const path = choice.kind === 'suggested' ? suggested?.path : choice.path
  const start = async () => {
    if (!path || busy) return
    setBusy(true)
    setError(null)
    try {
      const added = await startDataFolder(path, example)
      if (example && !added) toast({ message: "The folder isn't empty, so the example wasn't added" })
      await onDone()
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-heading">Choose a folder for your files</h1>
        <p className="text-fg-3">
          Everything is saved there as markdown you can open in any editor. Point any folder sync at it to use it on
          another computer.
        </p>
      </div>

      <div role="radiogroup" aria-label="Data folder" className="flex flex-col gap-2">
        {suggested && (
          <Option
            selected={choice.kind === 'suggested'}
            onSelect={() => setChoice({ kind: 'suggested' })}
            title="In Documents"
            detail={suggested.display}
          />
        )}
        <Option
          selected={choice.kind === 'other'}
          onSelect={() => (choice.kind === 'other' && choice.path ? setChoice(choice) : void chooseOther())}
          title="Another folder"
          detail={choice.kind === 'other' && choice.path ? choice.path : 'Choose a folder'}
          isPath={choice.kind === 'other' && !!choice.path}
          action={
            choice.kind === 'other' && choice.path ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  void chooseOther()
                }}
                onKeyDown={(e) => e.key === 'Enter' && void chooseOther()}
                className="flex items-center gap-1 rounded-control px-1.5 py-0.5 text-meta text-fg-3 hover:bg-hover hover:text-fg-2"
              >
                <FolderOpen size={13} strokeWidth={1.75} aria-hidden="true" />
                Change
              </span>
            ) : null
          }
        />
      </div>

      <label htmlFor="start-with-example" className="flex cursor-pointer items-start gap-2.5">
        <input
          id="start-with-example"
          type="checkbox"
          aria-describedby="start-with-example-help"
          checked={example}
          onChange={(e) => setExample(e.currentTarget.checked)}
          className="mt-0.5 size-4 accent-accent"
        />
        <span className="flex flex-col">
          <span className="text-fg">Start with an example</span>
          <span id="start-with-example-help" className="text-meta font-normal text-fg-3">
            A small home renovation to look around in. Delete it any time.
          </span>
        </span>
      </label>

      {error && <p className="text-meta font-normal text-danger">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex h-8 items-center rounded-row px-3 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
        >
          Back
        </button>
        <button
          onClick={onGithub}
          className="flex h-8 items-center rounded-row px-3 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
        >
          Get files from GitHub
        </button>
        <PrimaryButton onClick={() => void start()} disabled={!path || busy}>
          {busy ? 'Opening' : 'Start'}
        </PrimaryButton>
      </div>
    </>
  )
}

/**
 * Starting on a new computer: sign in to GitHub and pick the repository that
 * holds your files. They are fetched into Documents/Moss and kept in sync.
 */
function GithubStep({ onBack, onDone }: { onBack: () => void; onDone: () => Promise<void> }) {
  const { info } = useSync()
  const toast = useToast()

  const use = async (repo: GithubRepo) => {
    try {
      const folder = await suggestedDataFolder()
      await startDataFolder(folder.path, false)
      await syncConnect(repo)
      await onDone()
    } catch (e) {
      toast({ message: String(e), tone: 'error' })
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-heading">Get your files from GitHub</h1>
        <p className="text-fg-3">Choose the repository that holds your Moss files. They are copied into Documents. Moss can only see the repositories you choose on GitHub.</p>
      </div>
      {!info ? null : !info.gitAvailable ? (
        <p className="text-fg-3">Install Git to use sync. Moss uses the Git on this computer.</p>
      ) : info.username ? (
        <ExistingRepo onUse={use} />
      ) : (
        <SignIn available={info.loginAvailable} />
      )}
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="flex h-8 items-center rounded-row px-3 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
        >
          Back
        </button>
      </div>
    </>
  )
}

/** One choice in the folder list: a ring that fills when it's picked. */
function Option({
  selected,
  onSelect,
  title,
  detail,
  isPath = true,
  action,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  detail: string
  /** Paths are set in the mono font; a plain hint isn't. */
  isPath?: boolean
  action?: ReactNode
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-card border px-3.5 py-3 text-left transition-colors duration-100 ${
        selected ? 'border-border-strong bg-selected' : 'border-border hover:bg-hover'
      }`}
    >
      <span
        className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-100 ${
          selected ? 'border-accent bg-accent text-on-accent' : 'border-border-strong'
        }`}
      >
        <motion.span initial={false} animate={{ scale: selected ? 1 : 0 }} transition={spring.pop} className="flex">
          <Check size={11} strokeWidth={3} aria-hidden="true" />
        </motion.span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-fg">{title}</span>
        {/* The one place besides Settings that shows a path: it's what you're choosing. */}
        <span className={`truncate text-meta font-normal text-fg-3 ${isPath ? 'font-mono' : ''}`}>{detail}</span>
      </span>
      {action}
    </button>
  )
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  autoFocus = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  return (
    <button
      autoFocus={autoFocus}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 items-center rounded-row bg-accent px-4 font-medium text-on-accent transition-[filter,transform,opacity] duration-100 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
    >
      {children}
    </button>
  )
}

/** Which step you're on: two small dots, the current one sage and wider. */
function Dots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div aria-hidden="true" className="flex justify-center gap-1.5 pb-5">
      {[1, 2].map((n) => (
        <motion.span
          key={n}
          initial={false}
          animate={{ width: n === Math.min(step, 2) ? 16 : 6 }}
          transition={spring.smooth}
          className={`h-1.5 rounded-full transition-colors duration-150 ${n === Math.min(step, 2) ? 'bg-accent' : 'bg-track'}`}
        />
      ))}
    </div>
  )
}
