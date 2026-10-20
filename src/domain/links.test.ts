import { describe, expect, it } from 'vitest'
import type { Item } from '../platform/api'
import { findLinkedPage, isPageHref, pageHref, parsePageHref } from './links'

const page = (id: string, title: string, parent: string | null): Item => ({ id, title, parent, kind: 'page' }) as Item

describe('page links', () => {
  it('write the file name and the id, and read both back', () => {
    const href = pageHref('Paint the walls', 'ABC1234567')
    expect(href).toBe('Paint%20the%20walls.md#id-ABC1234567')
    expect(parsePageHref(href)).toEqual({ title: 'Paint the walls', id: 'ABC1234567' })
  })

  it('survive titles with characters that mean something in a link', () => {
    for (const title of ['Q4 (draft)', 'Why #1?', '100% done', 'Café — plan', 'a&b=c']) {
      const href = pageHref(title, 'ID00000001')
      expect(href).not.toMatch(/[()\s]/) // would end or break the markdown link
      expect(parsePageHref(href)).toEqual({ title, id: 'ID00000001' })
    }
  })

  it('older links without an id still give the name', () => {
    expect(parsePageHref('Paint%20the%20walls.md')).toEqual({ title: 'Paint the walls', id: null })
    expect(parsePageHref('Sub/Page.md')).toEqual({ title: 'Page', id: null })
    expect(parsePageHref('Bad%ZZname.md').title).toBe('Bad%ZZname') // not valid escaping: used as written
  })

  it('tell page links from web addresses', () => {
    expect(isPageHref('Name.md')).toBe(true)
    expect(isPageHref('Name.md#id-X')).toBe(true)
    expect(isPageHref('https://example.com/readme.md')).toBe(false)
    expect(isPageHref('mailto:a@b.c')).toBe(false)
    expect(isPageHref('Name.txt')).toBe(false)
  })
})

describe('finding the linked page', () => {
  const home = page('HOME', 'Home', null)
  const items = [home, page('A', 'Plan', 'HOME'), page('B', 'Plan', 'OTHER'), page('C', 'Renamed later', 'HOME')]

  it('uses the id even after the page was renamed', () => {
    const href = pageHref('Old name', 'C')
    expect(findLinkedPage(items, href, home)?.id).toBe('C')
  })

  it('uses the id to tell apart two pages with the same name', () => {
    expect(findLinkedPage(items, pageHref('Plan', 'B'), home)?.id).toBe('B')
  })

  it('falls back to the name when the id is gone or missing, nearest page first', () => {
    expect(findLinkedPage(items, pageHref('Plan', 'GONE'), home)?.id).toBe('A')
    expect(findLinkedPage(items, 'Plan.md', home)?.id).toBe('A')
    expect(findLinkedPage(items, 'Nothing.md', home)).toBeUndefined()
  })
})
