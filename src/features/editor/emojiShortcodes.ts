// ":name:" emoji for the editor, using GitHub's shortcode list (gemoji): the
// same names Slack and Discord mostly use (:tada:, :+1:, :fire:). It's only
// loaded with the editor, which is itself loaded lazily.

import { gemoji } from 'gemoji'

export interface Shortcode {
  emoji: string
  /** The name shown, e.g. "tada". */
  name: string
}

/**
 * Emoji for what's been typed after ":", best first: names that start with
 * it, then names that contain it, then emoji whose tags start with it.
 */
export function matchShortcodes(query: string, limit = 8): Shortcode[] {
  const q = query.toLowerCase()
  const starts: Shortcode[] = []
  const contains: Shortcode[] = []
  const tagged: Shortcode[] = []
  for (const entry of gemoji) {
    const name = entry.names.find((n) => n.startsWith(q))
    if (name) starts.push({ emoji: entry.emoji, name })
    else {
      const inside = entry.names.find((n) => n.includes(q))
      if (inside) contains.push({ emoji: entry.emoji, name: inside })
      else if (entry.tags.some((t) => t.startsWith(q))) tagged.push({ emoji: entry.emoji, name: entry.names[0] })
    }
  }
  // Shorter names first among the starts, so ":smi" offers "smile" before "smiley_cat".
  starts.sort((a, b) => a.name.length - b.name.length)
  return [...starts, ...contains, ...tagged].slice(0, limit)
}

/** The emoji whose name is exactly `name`, for ":name:" typed in full. */
export function exactShortcode(name: string): string | null {
  const q = name.toLowerCase()
  return gemoji.find((entry) => entry.names.includes(q))?.emoji ?? null
}
