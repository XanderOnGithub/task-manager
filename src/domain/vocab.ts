// The words the UI uses for things. Two sets:
//
//   plain   Moss's own vocabulary (Area, Project, Milestone, Task, Unsorted)
//   agile   Settings → General → Formal mode: the same things in agile terms
//           (Initiative, Epic, Sprint, Story, Backlog)
//
// Only the words on screen change. Files, kinds and statuses on disk stay the
// same, so switching back and forth is safe at any time.
//
// Components call `useVocab()` so they redraw when the mode changes. Plain
// helpers (toasts, labels built outside React) call `vocab()`, which reads the
// current mode.

import type { Kind, Status } from '../platform/api'
import { onPrefChange, readPref, usePref } from '../platform/prefs'

export type Wording = 'plain' | 'agile'

const PREF = 'wording'

/** One noun: [singular, plural], lowercase. */
type Noun = readonly [string, string]

interface WordSet {
  nouns: Record<Kind, Noun>
  /** The capture inbox. Used as a name, so it is capitalized. */
  unsorted: string
  /** The sidebar button and dialog that adds to it. */
  quickCapture: string
  /** "Nothing unsorted" */
  nothingUnsorted: string
  /** Statuses as shown. Anything missing falls back to the capitalized status. */
  status: Partial<Record<Status, string>>
  /** Prefix for tasks that wait on others: "Waiting on Pick tile". */
  waitingOn: string
  /** Priority names, from 1 (most) to 4 (least). */
  priority: readonly [string, string, string, string]
}

const PLAIN: WordSet = {
  nouns: {
    area: ['area', 'areas'],
    project: ['project', 'projects'],
    milestone: ['milestone', 'milestones'],
    task: ['task', 'tasks'],
    page: ['page', 'pages'],
  },
  unsorted: 'Unsorted',
  quickCapture: 'Quick capture',
  nothingUnsorted: 'Nothing unsorted',
  status: {},
  waitingOn: 'Waiting on',
  priority: ['Urgent', 'High', 'Medium', 'Low'],
}

const AGILE: WordSet = {
  nouns: {
    area: ['initiative', 'initiatives'],
    project: ['epic', 'epics'],
    milestone: ['sprint', 'sprints'],
    task: ['story', 'stories'],
    page: ['page', 'pages'],
  },
  unsorted: 'Backlog',
  quickCapture: 'Add to backlog',
  nothingUnsorted: 'Backlog is empty',
  status: {
    todo: 'To do',
    doing: 'In progress',
    later: 'Icebox',
    waiting: 'Blocked',
    open: 'Active',
    active: 'Active',
    paused: 'On hold',
    dropped: 'Cancelled',
  },
  waitingOn: 'Blocked by',
  priority: ['Critical', 'Major', 'Minor', 'Trivial'],
}

const cap = (word: string) => word[0].toUpperCase() + word.slice(1)

/** The helpers every screen uses. Lowercase by default; the capitalized ones start with a capital letter. */
export interface Vocab {
  mode: Wording
  /** "task" / "story" */
  noun: (kind: Kind) => string
  /** "Task" / "Story" */
  Noun: (kind: Kind) => string
  /** "tasks" / "stories" */
  nouns: (kind: Kind) => string
  /** "Tasks" / "Stories" */
  Nouns: (kind: Kind) => string
  /** "a task" / "an epic" */
  a: (kind: Kind) => string
  /** "1 task", "3 stories" */
  count: (n: number, kind: Kind) => string
  unsorted: string
  quickCapture: string
  nothingUnsorted: string
  status: (status: Status | null) => string
  waitingOn: string
  /** Priority name for 1–4. */
  priority: (level: number) => string
}

function build(mode: Wording): Vocab {
  const set = mode === 'agile' ? AGILE : PLAIN
  const noun = (kind: Kind) => set.nouns[kind][0]
  const nouns = (kind: Kind) => set.nouns[kind][1]
  return {
    mode,
    noun,
    Noun: (kind) => cap(noun(kind)),
    nouns,
    Nouns: (kind) => cap(nouns(kind)),
    a: (kind) => `${/^[aeiou]/.test(noun(kind)) ? 'an' : 'a'} ${noun(kind)}`,
    count: (n, kind) => `${n} ${n === 1 ? noun(kind) : nouns(kind)}`,
    unsorted: set.unsorted,
    quickCapture: set.quickCapture,
    nothingUnsorted: set.nothingUnsorted,
    status: (status) => (status ? (set.status[status] ?? cap(status)) : ''),
    waitingOn: set.waitingOn,
    priority: (level) => set.priority[level - 1] ?? '',
  }
}

const SETS: Record<Wording, Vocab> = { plain: build('plain'), agile: build('agile') }

const readMode = (): Wording => (readPref<Wording>(PREF, 'plain') === 'agile' ? 'agile' : 'plain')

let current: Wording = readMode()
// Kept up to date for code outside React (toasts, labels built in helpers).
if (typeof window !== 'undefined') onPrefChange(PREF, () => (current = readMode()))

/** The words for the current mode, for code outside components. */
export function vocab(): Vocab {
  return SETS[current]
}

/** The words for a given mode. */
export function vocabFor(mode: Wording): Vocab {
  return SETS[mode]
}

/** The words for the current mode; the component redraws when Formal mode is switched. */
export function useVocab(): Vocab {
  const [mode] = usePref<Wording>(PREF, 'plain')
  return SETS[mode === 'agile' ? 'agile' : 'plain']
}

/** Formal mode as a setting (on = agile words). */
export function useWording() {
  return usePref<Wording>(PREF, 'plain')
}
