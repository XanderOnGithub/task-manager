// Dates written the way people write them, at the end of a line:
//
//   "call Bob friday"          → "call Bob", due the coming Friday
//   "send the form by tomorrow" → "send the form", due tomorrow
//   "renew passport oct 30"    → "renew passport", due October 30
//   "water plants in 3 days"   → "water plants", due in three days
//
// Only the end of the text is read, so a title like "Friday meeting notes"
// stays as it is. If nothing at the end looks like a date, the text comes back
// unchanged with `due: null`.
//
// What the words mean:
// - a weekday ("friday") is the next one after today. Today itself is "today".
// - "next friday" is the Friday of next week (Monday to Sunday).
// - "next week" is next Monday.
// - a month and day ("oct 30") that has already passed this year means next year.
// - short weekday names ("fri") and a bare "sun" need "by", "on" or "due" in front,
//   so a word like "sat" or "sun" at the end of a title isn't taken for a date.

import { toIso } from './dates'

export interface ParsedDue {
  /** The text without the date words (the text as it was if none were found). */
  text: string
  /** `YYYY-MM-DD`, or null. */
  due: string | null
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
}
const FULL_WEEKDAYS = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

const WEEKDAY = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')
const MONTH = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

interface Phrase {
  /** The date words, as a regular expression source (no anchors). */
  pattern: string
  /**
   * The date they mean, or null if they aren't a real date. `whole` is all the
   * date words, `g` the groups in the pattern, and `connector` is "by", "on", ...
   * if one was in front.
   */
  resolve: (whole: string, g: (string | undefined)[], today: Date, connector: string | undefined) => Date | null
}

const PHRASES: Phrase[] = [
  {
    pattern: 'today|tonight|tomorrow|tmrw',
    resolve: (whole, _g, today) => addDays(today, /^(tomorrow|tmrw)$/i.test(whole) ? 1 : 0),
  },
  {
    pattern: `(next\\s+)?(${WEEKDAY})`,
    resolve: (_whole, g, today, connector) => {
      const name = (g[1] ?? '').toLowerCase()
      // "fri" or "sun" alone could be anything; a full name or a connector makes it a date.
      if (!FULL_WEEKDAYS.has(name) && !connector) return null
      const target = WEEKDAYS[name]
      if (!g[0]) return addDays(today, (target - today.getDay() + 7) % 7 || 7)
      return addDays(today, daysUntilNextMonday(today) + ((target + 6) % 7))
    },
  },
  {
    pattern: 'next\\s+week',
    resolve: (_whole, _g, today) => addDays(today, daysUntilNextMonday(today)),
  },
  {
    pattern: 'in\\s+(\\d{1,3})\\s+(days?|weeks?|months?)',
    resolve: (_whole, g, today) => {
      const n = Number(g[0])
      const unit = (g[1] ?? '').toLowerCase()
      if (n < 1) return null
      if (unit.startsWith('day')) return addDays(today, n)
      if (unit.startsWith('week')) return addDays(today, n * 7)
      return addMonths(today, n)
    },
  },
  {
    pattern: `(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`,
    resolve: (_whole, g, today) => monthDay(MONTHS[(g[0] ?? '').toLowerCase()], Number(g[1]), g[2] ? Number(g[2]) : undefined, today),
  },
  {
    pattern: `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH})\\.?(?:,?\\s+(\\d{4}))?`,
    resolve: (_whole, g, today) => monthDay(MONTHS[(g[1] ?? '').toLowerCase()], Number(g[0]), g[2] ? Number(g[2]) : undefined, today),
  },
  {
    pattern: '(\\d{4})-(\\d{2})-(\\d{2})',
    resolve: (_whole, g) => exact(Number(g[0]), Number(g[1]) - 1, Number(g[2])),
  },
  {
    pattern: '(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?',
    resolve: (_whole, g, today) => {
      const year = g[2] ? (g[2].length === 2 ? 2000 + Number(g[2]) : Number(g[2])) : undefined
      return monthDay(Number(g[0]) - 1, Number(g[1]), year, today)
    },
  },
]

/**
 * Finds a date at the end of `input`. `today` is a parameter so tests (and
 * anything else that cares) can say what day it is.
 */
export function parseDue(input: string, today: Date = new Date()): ParsedDue {
  const text = input.trim().replace(/[.,;!]+$/, '')
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  for (const phrase of PHRASES) {
    // Groups: 1 the text before, 2 the connector ("by", "on", ...), 3 all the
    // date words, then the pattern's own groups. The text part is lazy, so
    // "call Bob on friday" gives "call Bob" and takes "on" as the connector.
    const pattern = new RegExp(`^(.*?\\S)\\s+(?:(by|on|due|until|before)\\s+)?(${phrase.pattern})$`, 'i')
    const match = pattern.exec(text)
    if (!match) continue
    const date = phrase.resolve(match[3], match.slice(4), day, match[2]?.toLowerCase())
    // "call Bob, friday" leaves "call Bob,": the comma was there for the date.
    if (date) return { text: match[1].trim().replace(/[,;:]+$/, ''), due: toIso(date) }
  }
  return { text: input.trim(), due: null }
}

/** How many days from `date` to the next Monday (1 to 7). */
function daysUntilNextMonday(date: Date): number {
  const isoWeekday = ((date.getDay() + 6) % 7) + 1 // Monday 1 ... Sunday 7
  return 8 - isoWeekday
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** `months` later, clamped to the end of a shorter month (Jan 31 + 1 month = Feb 28). */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay))
}

/** A real calendar date, or null (Feb 30 is not one). */
function exact(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null
}

/** A month and day with no year: this year, or next if it has already passed. */
function monthDay(month: number, day: number, year: number | undefined, today: Date): Date | null {
  if (year !== undefined) return exact(year, month, day)
  const thisYear = exact(today.getFullYear(), month, day)
  if (!thisYear) return null
  return thisYear < today ? exact(today.getFullYear() + 1, month, day) : thisYear
}
