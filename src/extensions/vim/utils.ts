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
  return $pos.start($pos.depth)
}

export function lineEndAt(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
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
export function paragraphBounds(state: EditorState, pos: number): { from: number; to: number } {
  const $pos = state.doc.resolve(pos)
  const depth = $pos.depth
  const start = $pos.before(depth)
  const end = $pos.after(depth)
  return { from: start, to: end }
}
