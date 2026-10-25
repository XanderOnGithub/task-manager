import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { setPref } from '../platform/prefs'
import { statusLabel } from './items'
import { waitingText } from './blocked'
import { useVocab, vocab, vocabFor } from './vocab'

afterEach(() => setPref('wording', 'plain'))

describe('wording', () => {
  it("is Moss's own words by default", () => {
    const words = vocab()
    expect(words.mode).toBe('plain')
    expect(words.Nouns('task')).toBe('Tasks')
    expect(words.a('area')).toBe('an area')
    expect(words.unsorted).toBe('Unsorted')
    expect(statusLabel('doing')).toBe('Doing')
    expect(waitingText(['Pick tile'])).toBe('Waiting on Pick tile')
  })

  it('uses agile terms in Formal mode', () => {
    const words = vocabFor('agile')
    expect(words.Noun('area')).toBe('Initiative')
    expect(words.a('project')).toBe('an epic')
    expect(words.a('milestone')).toBe('a sprint')
    expect(words.count(1, 'task')).toBe('1 story')
    expect(words.count(3, 'task')).toBe('3 stories')
    expect(words.unsorted).toBe('Backlog')
    expect(words.status('doing')).toBe('In progress')
    expect(words.status('waiting')).toBe('Blocked')
    expect(words.status('done')).toBe('Done')
    expect(words.priority(1)).toBe('Critical')
  })

  it('switches everywhere when the setting changes, without touching statuses on disk', () => {
    const { result } = renderHook(() => useVocab())
    expect(result.current.Noun('task')).toBe('Task')
    act(() => setPref('wording', 'agile'))
    expect(result.current.Noun('task')).toBe('Story')
    // Code outside React follows too.
    expect(statusLabel('todo')).toBe('To do')
    expect(waitingText(['A', 'B'])).toBe('Blocked by 2 stories')
  })
})
