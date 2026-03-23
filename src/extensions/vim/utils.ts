import { EditorState } from 'prosemirror-state'

/**
 * Get the start position of the current paragraph/line (inside the text node).
 */
export function lineStart(state: EditorState): number {
  const { $head } = state.selection
  return $head.start($head.depth)
}

/**
 * Get the end position of the current paragraph/line (inside the text node).
 */
export function lineEnd(state: EditorState): number {
  const { $head } = state.selection
  return $head.end($head.depth)
}

/**
 * Get line start/end for an arbitrary position.
 */
export function lineStartAt(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) return pos
  return $pos.start($pos.depth)
}

export function lineEndAt(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) return pos
  return $pos.end($pos.depth)
}

/**
 * Get the text content of the current line/paragraph.
 */
export function lineText(state: EditorState): string {
  const start = lineStart(state)
  const end = lineEnd(state)
  return state.doc.textBetween(start, end, '\n', '\n')
}

/**
 * Get the cursor offset within its current paragraph.
 */
export function cursorOffsetInLine(state: EditorState): number {
  const { $head } = state.selection
  return $head.pos - $head.start($head.depth)
}

/**
 * Check if a character is a word character (\w).
 */
export function isWordChar(ch: string): boolean {
  return /\w/.test(ch)
}

/**
 * Check if a character is whitespace.
 */
export function isWhitespace(ch: string): boolean {
  return /\s/.test(ch)
}

/**
 * Get the first non-blank character position on the current line.
 */
export function firstNonBlank(state: EditorState): number {
  const start = lineStart(state)
  const text = lineText(state)
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) {
      return start + i
    }
  }
  return start
}

/**
 * Clamp a position within the document.
 */
export function clampPos(state: EditorState, pos: number): number {
  return Math.max(0, Math.min(pos, state.doc.content.size))
}

/**
 * Get character at a given document position (returns empty string if out of bounds).
 */
export function charAt(state: EditorState, pos: number): string {
  if (pos < 0 || pos >= state.doc.content.size) return ''
  try {
    return state.doc.textBetween(pos, pos + 1, '\n', '\n')
  } catch {
    return ''
  }
}

/**
 * Find the paragraph node boundaries that contain the given position.
 * Returns [nodeStart, nodeEnd] where nodeStart is the position before the node
 * and nodeEnd is the position after the node (including the node itself).
 */
export function paragraphBounds(
  state: EditorState,
  pos: number,
): { from: number; to: number } {
  let $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    // At document root (between nodes), resolve into nearest textblock
    if (pos < state.doc.content.size) {
      $pos = state.doc.resolve(pos + 1)
    } else if (pos > 0) {
      $pos = state.doc.resolve(pos - 1)
    } else {
      return { from: 0, to: state.doc.content.size }
    }
  }
  const depth = $pos.depth
  const start = $pos.before(depth)
  const end = $pos.after(depth)
  return { from: start, to: end }
}

/**
 * Get the word under cursor at the given position.
 */
export function wordUnderCursor(
  state: EditorState,
  pos: number,
): string | null {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) return null
  const lineS = $pos.start($pos.depth)
  const lineE = $pos.end($pos.depth)

  const ch = charAt(state, pos)
  if (!ch || !isWordChar(ch)) return null

  let from = pos
  let to = pos
  while (from > lineS && isWordChar(charAt(state, from - 1))) from--
  while (to < lineE && isWordChar(charAt(state, to))) to++

  if (from === to) return null
  return state.doc.textBetween(from, to)
}

/**
 * Find all positions of a search term in the document.
 */
export function findAllMatches(
  state: EditorState,
  term: string,
  wholeWord: boolean = false,
): number[] {
  if (!term) return []
  const positions: number[] = []
  const searchTerm = term.toLocaleLowerCase()

  state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text
      const textForSearch = text.toLocaleLowerCase()
      let idx = 0
      while (true) {
        const found = textForSearch.indexOf(searchTerm, idx)
        if (found === -1) break
        if (wholeWord) {
          const before = found > 0 ? text[found - 1] : ''
          const after =
            found + term.length < text.length
              ? text[found + term.length]
              : ''
          if ((before && isWordChar(before)) || (after && isWordChar(after))) {
            idx = found + 1
            continue
          }
        }
        positions.push(pos + found)
        idx = found + 1
      }
    }
  })

  return positions.sort((a, b) => a - b)
}

/**
 * Find the next match position after fromPos, wrapping around.
 */
export function findNextMatch(
  state: EditorState,
  term: string,
  fromPos: number,
  wholeWord: boolean = false,
): number | null {
  const matches = findAllMatches(state, term, wholeWord)
  if (matches.length === 0) return null
  for (const pos of matches) {
    if (pos > fromPos) return pos
  }
  return matches[0] // wrap around
}

/**
 * Find the previous match position before fromPos, wrapping around.
 */
export function findPrevMatch(
  state: EditorState,
  term: string,
  fromPos: number,
  wholeWord: boolean = false,
): number | null {
  const matches = findAllMatches(state, term, wholeWord)
  if (matches.length === 0) return null
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i] < fromPos) return matches[i]
  }
  return matches[matches.length - 1] // wrap around
}

/**
 * Find the "line-level" node boundaries for linewise operations (dd, yy, V, etc.).
 * For text inside a list item with a single child, returns the list item bounds.
 * Otherwise returns the textblock bounds (same as paragraphBounds).
 */
export function lineBounds(
  state: EditorState,
  pos: number,
): { from: number; to: number } {
  let $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    if (pos < state.doc.content.size) {
      $pos = state.doc.resolve(pos + 1)
    } else if (pos > 0) {
      $pos = state.doc.resolve(pos - 1)
    } else {
      return { from: 0, to: state.doc.content.size }
    }
  }

  let depth = $pos.depth

  // Walk up through ancestors looking for a list item
  for (let d = $pos.depth - 1; d >= 1; d--) {
    const node = $pos.node(d)
    const name = node.type.name
    if (name === 'listItem' || name === 'list_item') {
      // Use list item bounds if it has only one child (the common case)
      if (node.childCount === 1) {
        depth = d
      }
      break
    }
  }

  return { from: $pos.before(depth), to: $pos.after(depth) }
}
