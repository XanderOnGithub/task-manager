import { describe, expect, it } from 'vitest'
import { parseDue } from './naturalDate'

// Tuesday, 20 October 2026.
const TUESDAY = new Date(2026, 9, 20)

const due = (text: string, today = TUESDAY) => parseDue(text, today)

describe('parseDue', () => {
  it('reads today and tomorrow', () => {
    expect(due('call Bob today')).toEqual({ text: 'call Bob', due: '2026-10-20' })
    expect(due('call Bob tomorrow')).toEqual({ text: 'call Bob', due: '2026-10-21' })
    expect(due('call Bob tmrw')).toEqual({ text: 'call Bob', due: '2026-10-21' })
  })

  it('a weekday is the next one after today', () => {
    expect(due('call Bob friday')).toEqual({ text: 'call Bob', due: '2026-10-23' })
    expect(due('call Bob wednesday')).toEqual({ text: 'call Bob', due: '2026-10-21' })
    expect(due('call Bob tuesday')).toEqual({ text: 'call Bob', due: '2026-10-27' }) // today is "today"
    expect(due('call Bob sunday')).toEqual({ text: 'call Bob', due: '2026-10-25' })
  })

  it('"next friday" is the Friday of next week', () => {
    expect(due('call Bob next friday')).toEqual({ text: 'call Bob', due: '2026-10-30' })
    expect(due('call Bob next monday')).toEqual({ text: 'call Bob', due: '2026-10-26' })
    expect(due('call Bob next sunday')).toEqual({ text: 'call Bob', due: '2026-11-01' })
    expect(due('review next week')).toEqual({ text: 'review', due: '2026-10-26' })
    // From a Sunday, "next week" is tomorrow.
    expect(due('review next week', new Date(2026, 9, 25))).toEqual({ text: 'review', due: '2026-10-26' })
  })

  it('short weekday names need by, on or due in front', () => {
    expect(due('call Bob by fri')).toEqual({ text: 'call Bob', due: '2026-10-23' })
    expect(due('call Bob due thu')).toEqual({ text: 'call Bob', due: '2026-10-22' })
    expect(due('call Bob fri')).toEqual({ text: 'call Bob fri', due: null })
    expect(due('go to the beach sun')).toEqual({ text: 'go to the beach sun', due: null })
  })

  it('takes the connector word away with the date', () => {
    expect(due('send the form by tomorrow')).toEqual({ text: 'send the form', due: '2026-10-21' })
    expect(due('call Bob on friday')).toEqual({ text: 'call Bob', due: '2026-10-23' })
    expect(due('pay rent due oct 30')).toEqual({ text: 'pay rent', due: '2026-10-30' })
  })

  it('reads "in N days, weeks or months"', () => {
    expect(due('water plants in 3 days')).toEqual({ text: 'water plants', due: '2026-10-23' })
    expect(due('water plants in 1 day')).toEqual({ text: 'water plants', due: '2026-10-21' })
    expect(due('book the dentist in 2 weeks')).toEqual({ text: 'book the dentist', due: '2026-11-03' })
    expect(due('renew in 3 months')).toEqual({ text: 'renew', due: '2027-01-20' })
    expect(due('x in 1 month', new Date(2026, 0, 31))).toEqual({ text: 'x', due: '2026-02-28' })
  })

  it('reads a month and a day, and a day and a month', () => {
    expect(due('renew passport oct 30')).toEqual({ text: 'renew passport', due: '2026-10-30' })
    expect(due('renew passport October 30th')).toEqual({ text: 'renew passport', due: '2026-10-30' })
    expect(due('renew passport 30 oct')).toEqual({ text: 'renew passport', due: '2026-10-30' })
    expect(due('renew passport 3rd december')).toEqual({ text: 'renew passport', due: '2026-12-03' })
    expect(due('birthday sept 4, 2027')).toEqual({ text: 'birthday', due: '2027-09-04' })
  })

  it('a date that has passed this year means next year', () => {
    expect(due('file taxes jan 15')).toEqual({ text: 'file taxes', due: '2027-01-15' })
    expect(due('file taxes oct 20')).toEqual({ text: 'file taxes', due: '2026-10-20' }) // today still counts
    expect(due('file taxes oct 19')).toEqual({ text: 'file taxes', due: '2027-10-19' })
  })

  it('reads numeric dates', () => {
    expect(due('conference 2026-11-05')).toEqual({ text: 'conference', due: '2026-11-05' })
    expect(due('conference 11/5')).toEqual({ text: 'conference', due: '2026-11-05' })
    expect(due('conference 11/5/27')).toEqual({ text: 'conference', due: '2027-11-05' })
  })

  it('leaves alone what is not a date', () => {
    for (const text of [
      'Friday meeting notes', // at the start, not the end
      'friday', // nothing left for a title
      'pick up 3 tickets',
      'buy milk',
      'call Bob 2/30', // not a real date
      'read chapter 12/40', // month 40 isn't a thing
      'move to may', // a month alone isn't a day
      'plan march 32',
      'fix the 13/13 bug',
      '',
    ]) {
      expect(due(text)).toEqual({ text: text.trim(), due: null })
    }
  })

  it('ignores trailing punctuation and extra spaces', () => {
    expect(due('  call Bob   friday!  ')).toEqual({ text: 'call Bob', due: '2026-10-23' })
    expect(due('call Bob, friday.')).toEqual({ text: 'call Bob', due: '2026-10-23' })
  })

  it('works across a year end', () => {
    const newYearsEve = new Date(2026, 11, 31)
    expect(due('party friday', newYearsEve)).toEqual({ text: 'party', due: '2027-01-01' })
    expect(due('x in 2 days', newYearsEve)).toEqual({ text: 'x', due: '2027-01-02' })
  })
})
