import { describe, expect, it } from 'vitest'
import { REPEAT_CHOICES, repeatLabel, repeatPhrase } from './repeat'

describe('repeat words', () => {
  it('are named for people', () => {
    expect(repeatLabel(null)).toBe('Never')
    expect(repeatLabel('weekly')).toBe('Weekly')
    expect(repeatLabel('every 2 weeks')).toBe('Every 2 weeks')
    expect(repeatPhrase('monthly')).toBe('Repeats monthly')
  })

  it('offer the words the core understands, and Never clears it', () => {
    expect(REPEAT_CHOICES.map((c) => c.value)).toEqual([null, 'daily', 'weekly', 'monthly', 'yearly'])
  })
})
