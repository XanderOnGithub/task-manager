// Typed wrappers around the Rust commands in src-tauri/src/commands/ and sync/.
//
// Components call these instead of `invoke` directly, so a typo in a command
// name is a TypeScript error instead of a runtime one. If you change a command
// or a struct in Rust, update the matching type here.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// ---------------------------------------------------------------------------
// Types (mirror the Rust structs; field names are camelCase on both sides)
// ---------------------------------------------------------------------------

export type Kind = 'area' | 'project' | 'milestone' | 'task' | 'page'

/** `later` and `waiting` are optional lanes (Settings → Board lanes); the file accepts them either way. */
export type TaskStatus = 'todo' | 'doing' | 'done' | 'later' | 'waiting'
export type MilestoneStatus = 'open' | 'done'
export type ProjectStatus = 'active' | 'paused' | 'done' | 'dropped'
export type Status = TaskStatus | MilestoneStatus | ProjectStatus

/** Stored by name; the actual color is `--ms-<name>` in tokens.css. */
export type MilestoneColor = 'dusty-blue' | 'mauve' | 'rose' | 'teal' | 'lavender' | 'sand'

/** One area, project, milestone, task or page. Bodies aren't included; use `readBody`. */
export interface Item {
  id: string
  kind: Kind
  title: string
  /** Inside the data folder, e.g. "areas/Home/Renovate the house". Don't show it in the UI. */
  path: string
  isFolder: boolean
  /** Containing item's id. null only for areas. A page's parent is its area, project or page. */
  parent: string | null
  status: Status | null
  /** Sort key. Sort siblings by this (string comparison), then by title. */
  order: string | null
  /** YYYY-MM-DD */
  created: string | null
  /** YYYY-MM-DD */
  due: string | null
  color: MilestoneColor | null
  /** Pages only: an emoji shown next to the title. */
  icon: string | null
  /** Tasks only: how often it comes back, in words: "weekly", "every 2 weeks". */
  repeat: string | null
  /** Tasks only: ids of the tasks this one waits on. May hold ids of deleted tasks. */
  blockedBy: string[]
}

/** What kind of problem, and where. */
export type IssueKind =
  | { type: 'missingId'; path: string; id: string }
  | { type: 'duplicateId'; path: string; id: string }
  | { type: 'missingIndex'; path: string; id: string; kind: Kind }
  | { type: 'unclosedFrontmatter'; path: string }
  | { type: 'invalidValue'; path: string; field: string; value: string }
  | { type: 'invalidName'; path: string }
  | { type: 'notPortable'; path: string; reason: string }
  | { type: 'conflictCopy'; path: string; id: string }
  | { type: 'mixedChildren'; path: string }
  | { type: 'strayFile'; path: string }
  | { type: 'tooDeep'; path: string }
  | { type: 'unreadable'; path: string }

/**
 * Something odd found in the data folder. Fixable ones are fixed automatically
 * on load; the rest are listed in the Issues view. The wording comes from the
 * Rust side (core/src/issues.rs) so it is written once.
 */
export type Issue = IssueKind & {
  /** What is wrong, one line. */
  message: string
  fixable: boolean
  /** What it is about: the file or folder name, without ".md". */
  name: string
  /** An item that can be opened from the Issues view (a conflict copy), or null. */
  itemId: string | null
}

/** One line of unsorted.md. Pass it back unchanged to file or remove it. */
export interface UnsortedEntry {
  line: number
  raw: string
  /** "YYYY-MM-DD HH:MM" */
  added: string | null
  text: string
}

export interface Snapshot {
  dataFolder: string
  items: Item[]
  issues: Issue[]
  unsorted: UnsortedEntry[]
}

export interface Trashed {
  trashPath: string
  originalPath: string
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

// Errors arrive as plain strings written for the UI ("A project goes inside an area").

export const getDataFolder = () => invoke<string | null>('get_data_folder')
export const setDataFolder = (path: string) => invoke<void>('set_data_folder', { path })
/** First launch: where Moss suggests keeping files (Documents/Moss). `display` writes the home folder as "~". */
export const suggestedDataFolder = () => invoke<{ path: string; display: string }>('suggested_data_folder')
/** First launch: makes the folder, adds the example if asked (empty folders only), and opens it. True if the example was added. */
export const startDataFolder = (path: string, example: boolean) => invoke<boolean>('start_data_folder', { path, example })
export const loadLibrary = () => invoke<Snapshot>('load_library')

/** `due` (YYYY-MM-DD) is for a task whose title had a date in it. */
export const createItem = (kind: Kind, parent: string | null, title: string, due: string | null = null) =>
  invoke<string>('create_item', { kind, parent, title, due })
export const renameItem = (id: string, title: string) => invoke<void>('rename_item', { id, title })
/** Moves into `parent` (pass the current parent to reorder), before `before` or at the end. */
export const moveItem = (id: string, parent: string | null, before: string | null = null) =>
  invoke<void>('move_item', { id, parent, before })
export const setField = (id: string, field: 'status' | 'due' | 'color' | 'icon' | 'repeat' | 'blocked_by', value: string | null) =>
  invoke<void>('set_field', { id, field, value })
/**
 * Changes a task's status. Finishing a repeating task puts it back to Todo with
 * its next due date, which is returned (null for anything else).
 */
export const setStatus = (id: string, status: string) => invoke<string | null>('set_status', { id, status })
export const readBody = (id: string) => invoke<string>('read_body', { id })

/** A search match inside an item's text (titles are matched in the UI). */
export interface TextHit {
  id: string
  snippet: string
}
export const searchText = (query: string) => invoke<TextHit[]>('search_text', { query })
export const writeBody = (id: string, body: string) => invoke<void>('write_body', { id, body })
export const trashItem = (id: string) => invoke<Trashed>('trash_item', { id })
export const restoreItem = (t: Trashed) => invoke<void>('restore_item', { ...t })

/** One thing in the trash (see core/src/trash.rs). */
export interface TrashEntry {
  /** Where it is now, inside the hidden .trash folder. */
  path: string
  /** Where it came from; null for things deleted before the app kept notes (can't be restored here). */
  original: string | null
  title: string
  kind: Kind | null
  /** Titles of what it was inside, top first. */
  from: string[]
  /** "YYYY-MM-DD HH:MM" */
  deleted: string
}
export const listTrash = () => invoke<TrashEntry[]>('list_trash')
export const deleteForever = (path: string) => invoke<void>('delete_forever', { path })
export const emptyTrash = () => invoke<number>('empty_trash')
export const revealInFinder = (id: string) => invoke<void>('reveal_in_finder', { id })
export const itemPath = (id: string) => invoke<string>('item_path', { id })
/** Shows a file or folder by its path inside the data folder (for Issues, whose items may not have loaded). */
export const revealPath = (path: string) => invoke<void>('reveal_path', { path })

export const addUnsorted = (text: string) => invoke<UnsortedEntry>('add_unsorted', { text })
/**
 * Turns an entry into a task, page or project. `text` (the entry without its
 * date words) and `due` are for a date the app understood in it.
 */
export const fileUnsorted = (
  entry: UnsortedEntry,
  kind: Kind,
  parent: string | null,
  extras: { text?: string; due?: string } = {},
) => invoke<string>('file_unsorted', { entry, kind, parent, text: extras.text ?? null, due: extras.due ?? null })
export const removeUnsorted = (entry: UnsortedEntry) => invoke<void>('remove_unsorted', { entry })
export const restoreUnsorted = (entry: UnsortedEntry) => invoke<void>('restore_unsorted', { entry })

/** Runs `callback` whenever files change outside the app. Returns a function that stops listening. */
export const onDataChanged = (callback: (paths: string[]) => void): Promise<UnlistenFn> =>
  listen<string[]>('data-changed', (event) => callback(event.payload))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Experimental 120fps drawing (macOS only). */
export interface HighRefresh {
  supported: boolean
  enabled: boolean
}
export const getHighRefresh = () => invoke<HighRefresh>('get_high_refresh')
export const setHighRefresh = (enabled: boolean) => invoke<void>('set_high_refresh', { enabled })

// ---------------------------------------------------------------------------
// Git sync (src-tauri/src/sync.rs)
// ---------------------------------------------------------------------------

export interface SyncInfo {
  gitAvailable: boolean
  /** False in builds made without a GitHub App. */
  loginAvailable: boolean
  /** The signed-in GitHub username. */
  username: string | null
  /** "owner/name", when this data folder syncs. */
  repo: string | null
  paused: boolean
  syncing: boolean
  /** Milliseconds since 1970. */
  lastSynced: number | null
  error: string | null
  /** Files not committed yet. */
  pending: number
}

/** The code you type on GitHub to approve Moss. */
export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  /** Seconds between checks. */
  interval: number
  /** Seconds until the code stops working. */
  expiresIn: number
}

export interface GithubRepo {
  fullName: string
  private: boolean
  defaultBranch: string
  cloneUrl: string
  /** Nothing has been pushed to it yet. */
  empty: boolean
}

export const syncState = () => invoke<SyncInfo>('sync_state')
export const githubLoginStart = () => invoke<DeviceCode>('github_login_start')
export const githubLoginPoll = (deviceCode: string) =>
  invoke<'waiting' | 'slow_down' | 'done'>('github_login_poll', { deviceCode })
export const githubLogout = () => invoke<void>('github_logout')
export const githubRepos = () => invoke<GithubRepo[]>('github_repos')
/** The GitHub page where you choose which repositories Moss can use. */
export const githubInstallUrl = () => invoke<string>('github_install_url')
export const syncConnect = (repo: GithubRepo) => invoke<void>('sync_connect', { repo })
export const syncNow = () => invoke<void>('sync_now')
export const syncNudge = () => invoke<void>('sync_nudge')
export const syncSetPaused = (paused: boolean) => invoke<void>('sync_set_paused', { paused })
export const syncDisconnect = () => invoke<void>('sync_disconnect')

/** Runs `callback` whenever the sync status changes. */
export const onSyncChanged = (callback: () => void): Promise<UnlistenFn> => listen('sync-changed', () => callback())

/** Sync kept both versions of some files (the number of them). */
export const onSyncConflicts = (callback: (count: number) => void): Promise<UnlistenFn> =>
  listen<number>('sync-conflicts', (event) => callback(event.payload))

// ---------------------------------------------------------------------------
// Backups (src-tauri/src/backup/)
// ---------------------------------------------------------------------------

export type BackupKind = 'automatic' | 'manual' | 'beforeRestore'

export interface Backup {
  kind: BackupKind
  /** Pass back to `restoreBackup`. Don't show it. */
  path: string
  fileName: string
  /** "YYYY-MM-DD HH:MM" */
  when: string
  /** Milliseconds since 1970. */
  madeAt: number
  bytes: number
}

export interface Backups {
  /** Backs up about once a day. */
  automatic: boolean
  /** Newest first. */
  items: Backup[]
}

export const getBackups = () => invoke<Backups>('backups_get')
export const setAutomaticBackups = (automatic: boolean) => invoke<void>('backups_set_automatic', { automatic })
/** Makes a backup you asked for; it is kept until you delete it. */
export const backUpNow = () => invoke<Backup>('backup_now')
/** Replaces the data folder's files with a backup (or any zip you picked). Returns the backup made of what was there. */
export const restoreBackup = (path: string) => invoke<Backup>('backup_restore', { path })
export const revealBackups = () => invoke<void>('backups_reveal')
