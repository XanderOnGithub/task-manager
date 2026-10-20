// Links between pages.
//
// "/page" in the editor makes a subpage and writes a normal relative markdown
// link to it, `[Name](Name.md)`, so the text still reads and works in any other
// markdown app. Moss adds the page's id after a `#`: `Name.md#id-ABC1234567`.
// Other apps ignore the part after the `#`; Moss uses it to find the page even
// after the page was renamed or another page has the same name.
//
// Links written before ids were added (no `#`) still open: Moss falls back to
// finding a page by its name.

import type { Item } from '../platform/api'

const ID_PREFIX = 'id-'

/** The link text for a page: `Name.md#id-ABC1234567`, escaped for markdown. */
export function pageHref(title: string, id: string): string {
  // encodeURIComponent leaves ( and ) alone, which would end a markdown link early.
  const name = encodeURIComponent(title).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'))
  return `${name}.md#${ID_PREFIX}${id}`
}

/** True for a link that points at a page file (and not a web address or other file). */
export function isPageHref(href: string): boolean {
  return /\.md(#.*)?$/.test(href) && !/^[a-z][a-z0-9+.-]*:/i.test(href)
}

/** The page name and id a page link points at. The id is null for older links. */
export function parsePageHref(href: string): { title: string; id: string | null } {
  const hash = href.indexOf('#')
  const path = hash >= 0 ? href.slice(0, hash) : href
  const fragment = hash >= 0 ? href.slice(hash + 1) : ''
  const file = path.split('/').pop() ?? ''
  let title = file
  try {
    title = decodeURIComponent(file)
  } catch {
    // A stray "%" in an old link: use the name as written.
  }
  return {
    title: title.replace(/\.md$/, ''),
    id: fragment.startsWith(ID_PREFIX) ? fragment.slice(ID_PREFIX.length) : null,
  }
}

/**
 * The page a link points at. By id when the link has one and that page still
 * exists. Otherwise by name: a subpage of `from` first, then a page next to it,
 * then any page with that name.
 */
export function findLinkedPage(items: Item[], href: string, from: Item): Item | undefined {
  const { title, id } = parsePageHref(href)
  if (id) {
    const byId = items.find((i) => i.id === id && i.kind === 'page')
    if (byId) return byId
  }
  const named = items.filter((i) => i.kind === 'page' && i.title === title)
  return named.find((i) => i.parent === from.id) ?? named.find((i) => i.parent === from.parent) ?? named[0]
}
