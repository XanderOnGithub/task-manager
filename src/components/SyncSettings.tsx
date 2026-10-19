// Settings → Sync: sign in with GitHub, choose or create a repository, and see
// how syncing is going. The work is in src-tauri/src/sync.rs.

import { useEffect, useMemo, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Cloud, Lock, RefreshCw } from 'lucide-react'
import {
  githubCreateRepo,
  githubLoginPoll,
  githubLoginStart,
  githubLogout,
  githubRepos,
  syncConnect,
  syncDisconnect,
  syncNow,
  syncSetPaused,
  type DeviceCode,
  type GithubRepo,
  type SyncInfo,
} from '../lib/api'
import { ago, useSync } from '../lib/useSync'
import { useToast } from '../lib/toast'
import { Segmented, Switch } from './controls'

const buttonClass =
  'flex h-7 items-center gap-1.5 rounded-control bg-raised px-3 transition-colors duration-100 hover:bg-hover disabled:opacity-50'
const primaryClass =
  'flex h-7 items-center gap-1.5 rounded-control bg-accent px-3 text-on-accent transition-colors duration-100 hover:opacity-90 disabled:opacity-50'

export function SyncTab() {
  const { info, now } = useSync()
  const toast = useToast()
  const run = (work: Promise<unknown>, done?: string) =>
    work.then(() => done && toast({ message: done })).catch((e) => toast({ message: String(e), tone: 'error' }))

  if (!info) return <div className="p-5 text-meta font-normal text-fg-3">Loading</div>
  if (!info.gitAvailable) {
    return (
      <Section>
        <p className="text-meta font-normal text-fg-2">Install Git to use sync. Moss uses the Git on this computer.</p>
      </Section>
    )
  }
  return (
    <Section>
      {info.repo ? (
        <Connected info={info} now={now} run={run} />
      ) : info.username ? (
        <ChooseRepo run={run} />
      ) : (
        <SignIn available={info.loginAvailable} />
      )}
      {info.username && <Account info={info} run={run} />}
    </Section>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto p-5">{children}</div>
}

type Run = (work: Promise<unknown>, done?: string) => Promise<unknown>

// --- Step 1: sign in ----------------------------------------------------

function SignIn({ available }: { available: boolean }) {
  const [code, setCode] = useState<DeviceCode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setError(null)
    try {
      const next = await githubLoginStart()
      setCode(next)
      void openUrl(next.verificationUri)
    } catch (e) {
      setError(String(e))
    }
  }

  // While the code is showing, ask GitHub every few seconds whether it was approved.
  useEffect(() => {
    if (!code) return
    let stopped = false
    let wait = code.interval
    const deadline = Date.now() + code.expiresIn * 1000
    const poll = async () => {
      if (stopped) return
      if (Date.now() > deadline) {
        setCode(null)
        setError('The code expired. Sign in again.')
        return
      }
      try {
        const result = await githubLoginPoll(code.deviceCode)
        if (stopped) return
        if (result === 'done') return // Rust announces it; the tab moves on
        if (result === 'slow_down') wait += 5
        timer = window.setTimeout(() => void poll(), wait * 1000)
      } catch (e) {
        if (stopped) return
        setCode(null)
        setError(String(e))
      }
    }
    let timer = window.setTimeout(() => void poll(), wait * 1000)
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [code])

  if (code) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-meta text-fg-2">Approve Moss on GitHub</div>
        <p className="text-meta font-normal text-fg-3">Enter this code at {code.verificationUri.replace('https://', '')}.</p>
        <div className="rounded-control border border-border bg-field px-3 py-3 text-center font-mono text-title tracking-widest select-text">
          {code.userCode}
        </div>
        <div className="flex items-center gap-2">
          <button className={buttonClass} onClick={() => void openUrl(code.verificationUri)}>
            Open GitHub
          </button>
          <button className={buttonClass} onClick={() => setCode(null)}>
            Cancel
          </button>
          <span className="text-meta font-normal text-fg-3">Waiting for approval</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-meta text-fg-2">Sync with GitHub</div>
      <p className="text-meta font-normal text-fg-3">
        Keep your files in a GitHub repository to use them on another computer. Moss commits a minute after you stop changing
        things, and pulls what other computers pushed.
      </p>
      <div>
        <button className={primaryClass} disabled={!available} onClick={() => void start()}>
          <Cloud size={14} strokeWidth={1.75} aria-hidden="true" />
          Sign in with GitHub
        </button>
      </div>
      {!available && <p className="text-meta font-normal text-fg-3">Sign-in isn't set up in this build.</p>}
      {error && <p className="text-meta font-normal text-danger">{error}</p>}
    </div>
  )
}

// --- Step 2: choose or create a repository -------------------------------

function ChooseRepo({ run }: { run: Run }) {
  const [mode, setMode] = useState<'create' | 'existing'>('create')
  return (
    <div className="flex flex-col gap-3">
      <div className="text-meta text-fg-2">Choose where to keep your files</div>
      <Segmented<'create' | 'existing'>
        label="Repository"
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: 'Create a repository' },
          { value: 'existing', label: 'Use an existing one' },
        ]}
      />
      {mode === 'create' ? <CreateRepo run={run} /> : <ExistingRepo run={run} />}
    </div>
  )
}

function CreateRepo({ run }: { run: Run }) {
  const [name, setName] = useState('moss-data')
  const [isPrivate, setPrivate] = useState(true)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    await run(githubCreateRepo(name, isPrivate).then(syncConnect), 'Syncing with GitHub')
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value.replace(/\s+/g, '-'))}
        aria-label="Repository name"
        spellCheck={false}
        className="h-8 rounded-control border border-border bg-field px-2.5 font-mono text-meta outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-meta text-fg-2">Private</span>
          <span className="text-meta font-normal text-fg-3">Only you can see it.</span>
        </div>
        <Switch label="Private repository" checked={isPrivate} onChange={setPrivate} />
      </div>
      <div>
        <button className={primaryClass} disabled={busy || !name.trim()} onClick={() => void create()}>
          {busy ? 'Creating' : 'Create and sync'}
        </button>
      </div>
    </div>
  )
}

function ExistingRepo({ run }: { run: Run }) {
  const [repos, setRepos] = useState<GithubRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    githubRepos()
      .then(setRepos)
      .catch((e) => setError(String(e)))
  }, [])

  const shown = useMemo(
    () => (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.trim().toLowerCase())),
    [repos, filter],
  )
  const connect = async (repo: GithubRepo) => {
    setBusy(repo.fullName)
    await run(syncConnect(repo), 'Syncing with GitHub')
    setBusy(null)
  }

  if (error) return <p className="text-meta font-normal text-danger">{error}</p>
  if (!repos) return <p className="text-meta font-normal text-fg-3">Loading your repositories</p>
  return (
    <div className="flex flex-col gap-2">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search"
        aria-label="Search repositories"
        className="h-8 rounded-control border border-border bg-field px-2.5 text-meta outline-none focus:border-accent"
      />
      <ul className="flex max-h-56 flex-col overflow-y-auto rounded-control border border-border">
        {shown.map((repo) => (
          <li key={repo.fullName} className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-b-0">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate">{repo.fullName}</span>
              {repo.private && <Lock size={12} strokeWidth={1.75} className="shrink-0 text-fg-3" aria-label="Private" />}
            </span>
            <span className="text-meta font-normal text-fg-3">{repo.empty ? 'Empty' : ''}</span>
            <button className={buttonClass} disabled={busy !== null} onClick={() => void connect(repo)}>
              {busy === repo.fullName ? 'Syncing' : 'Use'}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2.5 py-2 text-meta font-normal text-fg-3">No repositories found</li>}
      </ul>
      <p className="text-meta font-normal text-fg-3">Files already in the repository are combined with the ones in your data folder.</p>
    </div>
  )
}

// --- Step 3: syncing ------------------------------------------------------

function Connected({ info, now, run }: { info: SyncInfo; now: number; run: Run }) {
  const status = info.paused
    ? 'Paused'
    : info.syncing
      ? 'Syncing'
      : info.error
        ? null
        : info.pending > 0
          ? `${info.pending} ${info.pending === 1 ? 'change' : 'changes'} waiting`
          : info.lastSynced
            ? `Synced ${ago(info.lastSynced, now)}`
            : 'Waiting for the first sync'
  return (
    <div className="flex flex-col gap-3">
      <div className="text-meta text-fg-2">Syncing with GitHub</div>
      <div className="flex items-center gap-2 rounded-control border border-border bg-field px-2.5 py-2">
        <Cloud size={14} strokeWidth={1.75} className="shrink-0 text-fg-3" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate select-text">{info.repo}</span>
        {status && <span className="text-meta font-normal text-fg-3">{status}</span>}
      </div>
      {info.error && <p className="text-meta font-normal text-danger">{info.error}</p>}
      <div className="flex gap-2">
        <button className={buttonClass} disabled={info.syncing || info.paused} onClick={() => void run(syncNow())}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          Sync now
        </button>
        <button className={buttonClass} onClick={() => void run(syncSetPaused(!info.paused))}>
          {info.paused ? 'Resume' : 'Pause'}
        </button>
        <button className={buttonClass} onClick={() => void run(syncDisconnect(), 'Stopped syncing')}>
          Stop syncing
        </button>
      </div>
      <p className="text-meta font-normal text-fg-3">
        If two computers change the same page, this computer's version stays and the other is saved next to it as "(from other
        computer)".
      </p>
    </div>
  )
}

function Account({ info, run }: { info: SyncInfo; run: Run }) {
  return (
    <div className="flex items-center gap-2 border-t border-border pt-4 text-meta font-normal text-fg-3">
      <span className="flex-1">
        Signed in as <span className="text-fg-2 select-text">{info.username}</span>
      </span>
      <button
        className="rounded-control px-1.5 py-0.5 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
        onClick={() => void run(githubLogout(), 'Signed out')}
      >
        Sign out
      </button>
    </div>
  )
}
