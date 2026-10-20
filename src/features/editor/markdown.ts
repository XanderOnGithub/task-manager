// Markdown on its way to and from the editor.
//
// Milkdown (the editor) and the files on disk disagree in two small ways, and
// these two functions smooth that over:
//
// - `toEditor` runs when a page loads: it makes extra blank lines visible.
// - `normalize` runs before a page is saved: it removes the editor's noise.
//
// Both leave code blocks exactly as typed. A code block starts at a line of
// three or more backticks (or tildes) and ends at a line of the same
// character, at least as long, with nothing else on it (CommonMark's rule).
// That matters: a block fenced with four backticks may contain a line of three.

/** A paragraph that only holds a non-breaking space, written as `&nbsp;`. */
const SPACER = /^(&nbsp;|\u00a0)\s*$/

/** An open code fence: which character, and how many of them. */
interface Fence {
  char: '`' | '~'
  length: number
}

/** The fence a line opens, or null. A backtick fence's info text can't contain a backtick. */
function opensFence(line: string): Fence | null {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
  if (!match) return null
  const char = match[1][0] as '`' | '~'
  if (char === '`' && match[2].includes('`')) return null
  return { char, length: match[1].length }
}

/** Does this line close `fence`? */
function closesFence(line: string, fence: Fence): boolean {
  const match = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
  return !!match && match[1][0] === fence.char && match[1].length >= fence.length
}

/**
 * Tidy markdown before it goes to disk (outside code blocks, which stay exactly
 * as typed). Milkdown writes an empty paragraph as a `<br />` line, which only
 * adds noise to the file: drop those. Markdown from the editor (`fromEditor`)
 * also needs two fixes:
 * - Milkdown puts a blank line between every two blocks, empty paragraphs
 *   included, so n empty lines come out as 2n+1 blank lines in a row. Write
 *   n+1 instead: an empty line in the editor is one blank line more in the file.
 * - Drop the `&nbsp;` spacer lines the editor uses for extra blank lines (see
 *   `toEditor`), so the file keeps every blank line as a plain blank line.
 * End with one newline.
 */
export function normalize(markdown: string, fromEditor = false): string {
  const out: string[] = []
  let fence: Fence | null = null
  let blanks = 0 // blank lines in a row, not yet written
  const flush = () => {
    const count = fromEditor && blanks > 1 ? Math.floor((blanks + 2) / 2) : blanks
    for (let i = 0; i < count; i++) out.push('')
    blanks = 0
  }
  for (const line of markdown.split('\n')) {
    if (fence) {
      out.push(line)
      if (closesFence(line, fence)) fence = null
      continue
    }
    // A spacer is not a blank line: it ends the run of blanks around it.
    if (fromEditor && SPACER.test(line)) {
      flush()
      continue
    }
    if (line.trim() === '') {
      blanks++
      continue
    }
    flush()
    const opened = opensFence(line)
    if (opened) {
      fence = opened
      out.push(line)
      continue
    }
    if (line.trim() === '<br />') continue
    // Table separator rows: Milkdown writes "| :---- | :- |" (left-aligned);
    // plain dashes ("| ----- | --- |") read better and mean the same.
    if (/^\|(\s*:-+\s*\|)+\s*$/.test(line)) {
      out.push(line.replace(/:(-+)/g, (_, dashes: string) => `-${dashes.padEnd(2, '-')}`))
      continue
    }
    out.push(line)
  }
  flush()
  const text = out.join('\n').replace(/\s+$/, '')
  return text ? `${text}\n` : ''
}

/**
 * Markdown folds several blank lines in a row into one paragraph break, so a
 * file with extra blank lines would lose them on load. For each extra blank
 * line, put an `&nbsp;` paragraph in its place: the editor shows an empty
 * line, and `normalize` turns it back into a plain blank line on save.
 * Outside code blocks, which stay exactly as typed.
 */
export function toEditor(markdown: string): string {
  const out: string[] = []
  let fence: Fence | null = null
  let blanks = 0
  for (const line of markdown.split('\n')) {
    if (!fence && line.trim() === '') {
      blanks++
      continue
    }
    // Between two blocks: n blank lines show n-1 empty lines.
    if (blanks > 0 && out.length > 0) {
      out.push('')
      for (let i = 1; i < blanks; i++) out.push('&nbsp;', '')
    }
    blanks = 0
    out.push(line)
    if (fence) {
      if (closesFence(line, fence)) fence = null
    } else {
      fence = opensFence(line)
    }
  }
  const text = out.join('\n')
  return text ? `${text}\n` : ''
}
