// Typed wrappers around the Rust commands in src-tauri/src/lib.rs.
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
}

/** Something odd found in the data folder. Fixable ones are fixed automatically on load. */
export type Issue =
  | { type: 'missingId'; path: string; id: string }
  | { type: 'duplicateId'; path: string; id: string }
  | { type: 'missingIndex'; path: string; id: string; kind: Kind }
  | { type: 'unclosedFrontmatter'; path: string }
  | { type: 'invalidValue'; path: string; field: string; value: string }
  | { type: 'invalidName'; path: string }
  | { type: 'mixedChildren'; path: string }
  | { type: 'strayFile'; path: string }
  | { type: 'tooDeep'; path: string }

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

export const createItem = (kind: Kind, parent: string | null, title: string) =>
  invoke<string>('create_item', { kind, parent, title })
export const renameItem = (id: string, title: string) => invoke<void>('rename_item', { id, title })
/** Moves into `parent` (pass the current parent to reorder), before `before` or at the end. */
export const moveItem = (id: string, parent: string | null, before: string | null = null) =>
  invoke<void>('move_item', { id, parent, before })
export const setField = (id: string, field: 'status' | 'due' | 'color' | 'icon', value: string | null) =>
  invoke<void>('set_field', { id, field, value })
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

export const addUnsorted = (text: string) => invoke<UnsortedEntry>('add_unsorted', { text })
export const fileUnsorted = (entry: UnsortedEntry, kind: Kind, parent: string | null) =>
  invoke<string>('file_unsorted', { entry, kind, parent })
export const removeUnsorted = (entry: UnsortedEntry) => invoke<void>('remove_unsorted', { entry })
export const restoreUnsorted = (entry: UnsortedEntry) => invoke<void>('restore_unsorted', { entry })

/** Runs `callback` whenever files change outside the app. Returns a function that stops listening. */
export const onDataChanged = (callback: (paths: string[]) => void): Promise<UnlistenFn> =>
  listen<string[]>('data-changed', (event) => callback(event.payload))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Children of `parent` in display order. An area or project holds two lists,
 * its projects/milestones/tasks and its pages; `pages` picks which.
 */
export function childrenOf(items: Item[], parent: string | null, pages = false): Item[] {
  return items
    .filter((i) => i.parent === parent && (i.kind === 'page') === pages)
    .sort(compareForDisplay)
}

/** Same order as the Rust side: order key first, then title. */
export function compareForDisplay(a: Item, b: Item): number {
  if (a.order && b.order) return a.order < b.order ? -1 : a.order > b.order ? 1 : a.title.localeCompare(b.title)
  if (a.order) return -1
  if (b.order) return 1
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

/** The milestone palette, in picker order. Names match `--color-ms-*` in tokens.css. */
export const MILESTONE_COLORS: MilestoneColor[] = ['dusty-blue', 'mauve', 'rose', 'teal', 'lavender', 'sand']

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
  /** False in builds made without a GitHub OAuth app. */
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
export const githubCreateRepo = (name: string, isPrivate: boolean) =>
  invoke<GithubRepo>('github_create_repo', { name, private: isPrivate })
export const syncConnect = (repo: GithubRepo) => invoke<void>('sync_connect', { repo })
export const syncNow = () => invoke<void>('sync_now')
export const syncNudge = () => invoke<void>('sync_nudge')
export const syncSetPaused = (paused: boolean) => invoke<void>('sync_set_paused', { paused })
export const syncDisconnect = () => invoke<void>('sync_disconnect')

/** Runs `callback` whenever the sync status changes. */
export const onSyncChanged = (callback: () => void): Promise<UnlistenFn> => listen('sync-changed', () => callback())
