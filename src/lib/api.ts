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

export type Kind = 'area' | 'project' | 'milestone' | 'task' | 'note'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type MilestoneStatus = 'open' | 'done'
export type ProjectStatus = 'active' | 'paused' | 'done' | 'dropped'
export type Status = TaskStatus | MilestoneStatus | ProjectStatus

/** Stored by name; the actual color is `--ms-<name>` in tokens.css. */
export type MilestoneColor = 'dusty-blue' | 'mauve' | 'rose' | 'teal' | 'lavender' | 'sand'

/** One area, project, milestone, task or note. Bodies aren't included; use `readBody`. */
export interface Item {
  id: string
  kind: Kind
  title: string
  /** Inside the data folder, e.g. "tasks/Home/Renovate the house". Don't show it in the UI. */
  path: string
  isFolder: boolean
  /** Containing item's id. null for areas and top-level notes. */
  parent: string | null
  status: Status | null
  /** Sort key. Sort siblings by this (string comparison), then by title. */
  order: string | null
  /** YYYY-MM-DD */
  created: string | null
  /** YYYY-MM-DD */
  due: string | null
  color: MilestoneColor | null
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
export const loadLibrary = () => invoke<Snapshot>('load_library')

export const createItem = (kind: Kind, parent: string | null, title: string) =>
  invoke<string>('create_item', { kind, parent, title })
export const renameItem = (id: string, title: string) => invoke<void>('rename_item', { id, title })
/** Moves into `parent` (pass the current parent to reorder), before `before` or at the end. */
export const moveItem = (id: string, parent: string | null, before: string | null = null) =>
  invoke<void>('move_item', { id, parent, before })
export const setField = (id: string, field: 'status' | 'due' | 'color', value: string | null) =>
  invoke<void>('set_field', { id, field, value })
export const readBody = (id: string) => invoke<string>('read_body', { id })
export const writeBody = (id: string, body: string) => invoke<void>('write_body', { id, body })
export const trashItem = (id: string) => invoke<Trashed>('trash_item', { id })
export const restoreItem = (t: Trashed) => invoke<void>('restore_item', { ...t })
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

/** Children of `parent` in display order. `notes` picks the notes tree at the top level. */
export function childrenOf(items: Item[], parent: string | null, notes = false): Item[] {
  return items
    .filter((i) => i.parent === parent && (i.kind === 'note') === notes)
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
