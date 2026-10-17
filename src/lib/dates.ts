// Due date labels and how urgent they look.

export type DueTone = 'normal' | 'soon' | 'overdue'

/** How many days ahead still counts as "due soon". */
const SOON_DAYS = 2

/** Today as YYYY-MM-DD in your time zone (same format as the files). */
export function today(): string {
  return toIso(new Date())
}

/** "Today", "Tomorrow", "Yesterday", "Oct 24", or "Oct 24, 2027" in another year. */
export function dueLabel(due: string): string {
  const days = daysFromToday(due)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  const date = fromIso(due)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Finished items never look urgent. */
export function dueTone(due: string, done: boolean): DueTone {
  if (done) return 'normal'
  const days = daysFromToday(due)
  if (days < 0) return 'overdue'
  if (days <= SOON_DAYS) return 'soon'
  return 'normal'
}

/** "Oct 15" style, for created dates. */
export function shortDate(iso: string): string {
  return fromIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysFromToday(iso: string): number {
  const ms = fromIso(iso).getTime() - fromIso(today()).getTime()
  return Math.round(ms / 86_400_000)
}

// Parse as local midnight. `new Date("2026-10-17")` would be UTC midnight,
// which is the evening before in Ohio.
function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** For a "YYYY-MM-DD HH:MM" stamp: "10:42 PM" today, "Yesterday", otherwise "Oct 12". */
export function stampLabel(stamp: string): string {
  const [date, time] = stamp.split(' ')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const when = new Date(y, m - 1, d, hh, mm)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.round((startOfToday.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000)
  if (days === 0) return when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
