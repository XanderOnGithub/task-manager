import { describe, expect, it } from 'vitest'
import { normalize, toEditor } from './markdown'

describe('normalize', () => {
  it('drops empty-paragraph <br /> lines and ends with one newline', () => {
    expect(normalize('one\n\n<br />\n\ntwo\n\n\n')).toBe('one\n\n\ntwo\n')
    expect(normalize('')).toBe('')
    expect(normalize('\n\n')).toBe('')
  })

  it('keeps a <br /> line inside a code block', () => {
    expect(normalize('```\n<br />\n```\n')).toBe('```\n<br />\n```\n')
  })

  it('keeps a literal <br /> inside a four-backtick block that contains triple backticks', () => {
    // The review's case: the inner ``` line must not end the outer block.
    const text = ['````md', 'Example:', '```', 'code', '```', '<br />', '````', '', 'after'].join('\n') + '\n'
    expect(normalize(text)).toBe(text)
    expect(normalize(text, true)).toBe(text)
  })

  it('keeps a <br /> line after an inner fence line (the case that used to be dropped)', () => {
    const text = '````\n```\n<br />\n````\n'
    expect(normalize(text)).toBe(text)
  })

  it('treats tilde fences and backtick fences separately', () => {
    const text = '~~~\n```\n<br />\n```\n~~~\n'
    expect(normalize(text)).toBe(text)
    // A ``` line does not close a ~~~ block, and the <br /> after it is still code.
    expect(normalize('~~~\n```\n~~~\n\n<br />\n')).toBe('~~~\n```\n~~~\n')
  })

  it('does not treat inline backticks as a fence', () => {
    expect(normalize('```not a fence```\n\n<br />\n\ntext\n')).toBe('```not a fence```\n\n\ntext\n')
  })

  it('turns the editor spacer lines back into plain blank lines', () => {
    expect(normalize('a\n\n&nbsp;\n\nb\n', true)).toBe('a\n\n\nb\n')
    expect(normalize('a\n\n&nbsp;\n\n&nbsp;\n\nb\n', true)).toBe('a\n\n\n\nb\n')
  })

  it('writes table separators with plain dashes', () => {
    expect(normalize('| a | b |\n| :---- | :- |\n| 1 | 2 |\n')).toBe('| a | b |\n| ----- | --- |\n| 1 | 2 |\n')
  })
})

describe('toEditor', () => {
  it('shows each extra blank line as an empty paragraph', () => {
    expect(toEditor('a\n\nb\n')).toBe('a\n\nb\n')
    expect(toEditor('a\n\n\nb\n')).toBe('a\n\n&nbsp;\n\nb\n')
    expect(toEditor('a\n\n\n\nb\n')).toBe('a\n\n&nbsp;\n\n&nbsp;\n\nb\n')
  })

  it('leaves blank lines inside code blocks alone, including four-backtick blocks', () => {
    const text = '````\n```\n\n\n```\n````\n'
    expect(toEditor(text)).toBe(text)
    const tilde = '~~~\n\n\n\n~~~\n'
    expect(toEditor(tilde)).toBe(tilde)
  })

  it('round-trips extra blank lines through the editor form', () => {
    for (const text of ['a\n\n\nb\n', 'a\n\n\n\n\nb\n', 'one\n\ntwo\n\n\nthree\n']) {
      // The editor writes every block separated by one blank line; emulate that.
      const edited = toEditor(text)
      expect(normalize(edited, true)).toBe(text)
    }
  })
})
