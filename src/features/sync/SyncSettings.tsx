// Settings → Sync: sign in with GitHub, choose a repository, and see how
// syncing is going. The work is in src-tauri/src/sync/. Moss is a GitHub App, so
// it only reaches the repositories chosen on GitHub's install page.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Cloud, ExternalLink, Lock, RefreshCw } from 'lucide-react'
import {
  githubInstallUrl,
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
} from '../../platform/api'
import { ago } from '../../domain/dates'
import { useSync } from './useSync'
import { useToast } from '../../shared/toast/toast'
import { isAndroid } from '../../platform/os'

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

export function SignIn({ available }: { available: boolean }) {
  const toast = useToast()
  const [code, setCode] = useState<DeviceCode | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Puts the code on the clipboard, so it can be pasted on GitHub. True if it worked. */
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  const start = async () => {
    setError(null)
    try {
      const next = await githubLoginStart()
      setCode(next)
      if (isAndroid) {
        // On a phone GitHub's page covers the whole screen, so the code would be
        // out of sight when it asks for it. Copy it, and let the person open GitHub
        // when they are ready (the button below).
        if (await copy(next.userCode)) toast({ message: 'Code copied. Paste it on GitHub.' })
      } else {
        void openUrl(next.verificationUri)
      }
    } catch (e) {
      setError(String(e))
    }
  }

  // While the code is showing, ask GitHub every few seconds whether it was approved.
  useEffect(() => {
    if (!code) return
    let stopped = false
    let asking = false
    let wait = code.interval
    const deadline = Date.now() + code.expiresIn * 1000
    let timer: number | undefined
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void poll(), wait * 1000)
    }
    const poll = async () => {
      if (stopped || asking) return
      if (Date.now() > deadline) {
        setCode(null)
        setError('The code expired. Sign in again.')
        return
      }
      asking = true
      try {
        const result = await githubLoginPoll(code.deviceCode)
        if (stopped) return
        if (result === 'done') return // Rust announces it; the tab moves on
        if (result === 'slow_down') wait += 5
        later()
      } catch (e) {
        if (stopped) return
        // Only GitHub's own "no" ends the wait. Anything else (most often no
        // network while Moss is in the background on a phone, as you approve
        // the code in the browser) is tried again.
        if (isFinal(String(e))) {
          setCode(null)
          setError(String(e))
        } else {
          later()
        }
      } finally {
        asking = false
      }
    }
    // Coming back from the browser: ask at once instead of waiting for the timer.
    const onVisible = () => document.visibilityState === 'visible' && void poll()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    later()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
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
          <button
            className={isAndroid ? primaryClass : buttonClass}
            onClick={() => {
              // Copy again just before leaving the app, in case it was replaced since.
              void copy(code.userCode).finally(() => void openUrl(code.verificationUri))
            }}
          >
            {isAndroid ? 'Copy code and open GitHub' : 'Open GitHub'}
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
      <p className="text-meta font-normal text-fg-3">
        Moss can read and write files in the repositories you choose. Nothing else.
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

/**
 * True when GitHub has said no for good (the code expired, or the sign-in was
 * cancelled there): the words come from core/src/github.rs `poll_login`.
 */
function isFinal(message: string): boolean {
  return /expired|cancelled|isn't set up/i.test(message)
}

// --- Step 2: choose a repository ----------------------------------------

function ChooseRepo({ run }: { run: Run }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-meta text-fg-2">Choose where to keep your files</div>
      <ExistingRepo onUse={(repo) => run(syncConnect(repo), 'Syncing with GitHub')} />
    </div>
  )
}

/**
 * The repositories Moss can use, to pick one. `onUse` does the connecting
 * (Settings and first launch differ). Which repositories show up is decided on
 * GitHub, not here, so the list links there and checks again when the person
 * comes back to the window.
 */
export function ExistingRepo({ onUse }: { onUse: (repo: GithubRepo) => Promise<unknown> }) {
  const [repos, setRepos] = useState<GithubRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    githubRepos()
      .then((list) => {
        setRepos(list)
        setError(null)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  const shown = useMemo(
    () => (repos ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.trim().toLowerCase())),
    [repos, filter],
  )
  const connect = async (repo: GithubRepo) => {
    setBusy(repo.fullName)
    await onUse(repo)
    setBusy(null)
  }
  const chooseOnGithub = () => void githubInstallUrl().then(openUrl)

  if (error) return <p className="text-meta font-normal text-danger">{error}</p>
  if (!repos) return <p className="text-meta font-normal text-fg-3">Loading your repositories</p>

  const chooseButton = (
    <button className={repos.length === 0 ? primaryClass : buttonClass} onClick={chooseOnGithub}>
      <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
      Choose repositories on GitHub
    </button>
  )

  if (repos.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-meta font-normal text-fg-3">
          Moss can read and write files in the repositories you choose. Nothing else. None are chosen yet.
        </p>
        <div className="flex items-center gap-2">
          {chooseButton}
          <button className={buttonClass} onClick={load}>
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            Check again
          </button>
        </div>
        <NewRepoHint />
      </div>
    )
  }

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
      <p className="text-meta font-normal text-fg-3">
        Moss can read and write files in the repositories you choose. Nothing else. Files already in the repository are
        combined with the ones in your data folder.
      </p>
      <div className="flex items-center gap-2">{chooseButton}</div>
      <NewRepoHint />
    </div>
  )
}

/** GitHub doesn't let an app create repositories, so the person makes one there and then adds it to Moss. */
function NewRepoHint() {
  return (
    <p className="text-meta font-normal text-fg-3">
      Need a new repository?{' '}
      <button
        className="text-accent underline-offset-2 hover:underline"
        onClick={() => void openUrl('https://github.com/new?name=moss-data&visibility=private')}
      >
        Create one on GitHub
      </button>
      , then choose it above.
    </p>
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
