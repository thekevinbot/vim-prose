import { EditorState, Selection } from 'prosemirror-state'
import {
  lineStart,
  lineEnd,
  firstNonBlank,
  clampPos,
  isWordChar,
  isWhitespace,
  charAt,
  lineStartAt,
  lineEndAt,
} from './utils'

/**
 * Find the next valid text cursor position searching forward from pos.
 */
function findNextTextPos(state: EditorState, pos: number): number | null {
  try {
    const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size))
    const sel = Selection.findFrom($pos, 1, true)
    return sel ? sel.$from.pos : null
  } catch {
    return null
  }
}

/**
 * Find the previous valid text cursor position searching backward from pos.
 */
function findPrevTextPos(state: EditorState, pos: number): number | null {
  try {
    const $pos = state.doc.resolve(Math.max(pos, 0))
    const sel = Selection.findFrom($pos, -1, true)
    return sel ? sel.$from.pos : null
  } catch {
    return null
  }
}

/**
 * Move left by one character; wraps to end of previous line at line start.
 */
export function motionLeft(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) return pos

  const start = lineStartAt(state, pos)
  if (pos > start) return pos - 1

  // At line start, find the end of the previous textblock
  try {
    const beforeTextblock = $pos.before($pos.depth)
    if (beforeTextblock <= 0) return pos
    const $before = state.doc.resolve(beforeTextblock)
    const prevSel = Selection.findFrom($before, -1, true)
    if (!prevSel) return pos
    const $prev = prevSel.$from
    return $prev.end($prev.depth)
  } catch {
    return pos
  }
}

/**
 * Move right by one character; wraps to start of next line at line end.
 */
export function motionRight(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) return pos

  const end = lineEndAt(state, pos)
  if (pos < end) return pos + 1

  // At line end, find the start of the next textblock
  try {
    const afterTextblock = $pos.after($pos.depth)
    if (afterTextblock >= state.doc.content.size) return pos
    const $after = state.doc.resolve(afterTextblock)
    const nextSel = Selection.findFrom($after, 1, true)
    if (!nextSel) return pos
    const $next = nextSel.$from
    return $next.start($next.depth)
  } catch {
    return pos
  }
}

/**
 * Move down by one line, trying to preserve column offset.
 * Uses Selection.findFrom to correctly traverse nested structures
 * (lists, blockquotes, etc.) and skip leaf nodes (hr).
 */
export function motionDown(
  state: EditorState,
  pos: number,
  goalColumn?: number,
): number {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    // At document root, try to find a textblock forward
    const next = findNextTextPos(state, pos)
    return next ?? pos
  }

  const currentLineStart = $pos.start($pos.depth)
  const currentOffset =
    goalColumn !== undefined ? goalColumn : pos - currentLineStart

  // Find the next textblock after the current one
  try {
    const afterTextblock = $pos.after($pos.depth)
    if (afterTextblock >= state.doc.content.size) return pos

    const $after = state.doc.resolve(afterTextblock)
    const nextSel = Selection.findFrom($after, 1, true)
    if (!nextSel) return pos

    const $next = nextSel.$from
    const nextLineStart = $next.start($next.depth)
    const nextLineEnd = $next.end($next.depth)
    const nextLineLen = nextLineEnd - nextLineStart
    return nextLineStart + Math.min(currentOffset, nextLineLen)
  } catch {
    return pos
  }
}

/**
 * Move up by one line, trying to preserve column offset.
 * Uses Selection.findFrom to correctly traverse nested structures.
 */
export function motionUp(
  state: EditorState,
  pos: number,
  goalColumn?: number,
): number {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    const prev = findPrevTextPos(state, pos)
    return prev ?? pos
  }

  const currentLineStart = $pos.start($pos.depth)
  const currentOffset =
    goalColumn !== undefined ? goalColumn : pos - currentLineStart

  // Find the previous textblock before the current one
  try {
    const beforeTextblock = $pos.before($pos.depth)
    if (beforeTextblock <= 0) return pos

    const $before = state.doc.resolve(beforeTextblock)
    const prevSel = Selection.findFrom($before, -1, true)
    if (!prevSel) return pos

    const $prev = prevSel.$from
    const prevLineStart = $prev.start($prev.depth)
    const prevLineEnd = $prev.end($prev.depth)
    const prevLineLen = prevLineEnd - prevLineStart
    return prevLineStart + Math.min(currentOffset, prevLineLen)
  } catch {
    return pos
  }
}

/**
 * Move to start of line (position 0 of text content).
 */
export function motionLineStart(state: EditorState, pos: number): number {
  return lineStartAt(state, pos)
}

/**
 * Move to first non-blank character of line.
 */
export function motionFirstNonBlank(state: EditorState): number {
  return firstNonBlank(state)
}

/**
 * Move to end of line (last character position).
 */
export function motionLineEnd(state: EditorState, pos: number): number {
  const end = lineEndAt(state, pos)
  return end
}

/**
 * Move to start of document.
 */
export function motionDocStart(state: EditorState): number {
  // Position at the start of the first text node
  try {
    const $start = state.doc.resolve(0)
    // Find the first text position
    let pos = 0
    state.doc.nodesBetween(0, state.doc.content.size, (node, nodePos) => {
      if (pos > 0) return false
      if (node.isTextblock) {
        pos = nodePos + 1
        return false
      }
      return true
    })
    return pos || 1
  } catch {
    return 1
  }
}

/**
 * Move to end of document.
 */
export function motionDocEnd(state: EditorState): number {
  // Position at the end of the last text node
  let lastPos = state.doc.content.size
  let found = 0
  state.doc.nodesBetween(0, state.doc.content.size, (node, nodePos) => {
    if (node.isTextblock) {
      found = nodePos + 1 + node.content.size
    }
    return true
  })
  return found || lastPos
}

/**
 * Helper: cross to the start of the next textblock from after the current one.
 */
function crossToNextTextblock(
  state: EditorState,
  $pos: ReturnType<typeof state.doc.resolve>,
): number | null {
  try {
    const afterNode = $pos.after($pos.depth)
    if (afterNode >= state.doc.content.size) return null
    const $after = state.doc.resolve(afterNode)
    const nextSel = Selection.findFrom($after, 1, true)
    if (!nextSel) return null
    return nextSel.$from.start(nextSel.$from.depth)
  } catch {
    return null
  }
}

/**
 * Helper: cross to the end of the previous textblock from before the current one.
 */
function crossToPrevTextblock(
  state: EditorState,
  $pos: ReturnType<typeof state.doc.resolve>,
): number | null {
  try {
    const beforeNode = $pos.before($pos.depth)
    if (beforeNode <= 0) return null
    const $before = state.doc.resolve(beforeNode)
    const prevSel = Selection.findFrom($before, -1, true)
    if (!prevSel) return null
    return prevSel.$from.end(prevSel.$from.depth)
  } catch {
    return null
  }
}

/**
 * Move forward by one word.
 */
export function motionWordForward(state: EditorState, pos: number): number {
  const docSize = state.doc.content.size
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    const next = findNextTextPos(state, pos)
    return next ?? pos
  }

  const lineEndPos = $pos.end($pos.depth)

  // First check if we're at the end of a line and need to cross to next
  if (pos >= lineEndPos) {
    return crossToNextTextblock(state, $pos) ?? pos
  }

  // Walk through text to find next word boundary
  let current = pos
  const ch = charAt(state, current)

  if (isWordChar(ch)) {
    // Skip rest of current word
    while (current < lineEndPos && isWordChar(charAt(state, current))) {
      current++
    }
    // Skip whitespace
    while (current < lineEndPos && isWhitespace(charAt(state, current))) {
      current++
    }
  } else if (isWhitespace(ch)) {
    // Skip whitespace
    while (current < lineEndPos && isWhitespace(charAt(state, current))) {
      current++
    }
  } else {
    // Non-word, non-whitespace (punctuation)
    while (
      current < lineEndPos &&
      !isWordChar(charAt(state, current)) &&
      !isWhitespace(charAt(state, current))
    ) {
      current++
    }
    // Skip whitespace
    while (current < lineEndPos && isWhitespace(charAt(state, current))) {
      current++
    }
  }

  if (current >= lineEndPos) {
    // Move to next textblock start
    return crossToNextTextblock(state, $pos) ?? lineEndPos
  }

  return current
}

/**
 * Move backward by one word.
 */
export function motionWordBackward(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    const prev = findPrevTextPos(state, pos)
    return prev ?? pos
  }

  const lineStartPos = $pos.start($pos.depth)

  if (pos <= lineStartPos) {
    // We're at the start of the line, cross to end of previous textblock
    return crossToPrevTextblock(state, $pos) ?? pos
  }

  let current = pos - 1

  // Skip whitespace backward
  while (current > lineStartPos && isWhitespace(charAt(state, current))) {
    current--
  }

  if (current <= lineStartPos) {
    return lineStartPos
  }

  const ch = charAt(state, current)
  if (isWordChar(ch)) {
    while (current > lineStartPos && isWordChar(charAt(state, current - 1))) {
      current--
    }
  } else {
    // Non-word, non-whitespace (punctuation)
    while (
      current > lineStartPos &&
      !isWordChar(charAt(state, current - 1)) &&
      !isWhitespace(charAt(state, current - 1))
    ) {
      current--
    }
  }

  return current
}

/**
 * Forward find char on current line (f motion).
 */
export function motionFindCharForward(
  state: EditorState,
  pos: number,
  char: string,
): number | null {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) return null
  const end = $pos.end($pos.depth)
  for (let i = pos + 1; i <= end; i++) {
    if (charAt(state, i) === char) {
      return i
    }
  }
  return null
}

/**
 * Backward find char on current line (F motion).
 */
export function motionFindCharBackward(
  state: EditorState,
  pos: number,
  char: string,
): number | null {
  const $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) return null
  const start = $pos.start($pos.depth)
  for (let i = pos - 1; i >= start; i--) {
    if (charAt(state, i) === char) {
      return i
    }
  }
  return null
}

/**
 * Forward till char on current line (t motion) — stops one before the char.
 */
export function motionTillCharForward(
  state: EditorState,
  pos: number,
  char: string,
): number | null {
  const found = motionFindCharForward(state, pos, char)
  if (found !== null && found > pos + 1) {
    return found - 1
  } else if (found !== null && found === pos + 1) {
    return found - 1 // still move, landing on pos itself might be same spot — return it anyway
  }
  return found !== null ? found - 1 : null
}

/**
 * Backward till char on current line (T motion) — stops one after the char.
 */
export function motionTillCharBackward(
  state: EditorState,
  pos: number,
  char: string,
): number | null {
  const found = motionFindCharBackward(state, pos, char)
  if (found !== null) {
    return found + 1
  }
  return null
}

/**
 * Half-page down motion.
 */
export function motionHalfPageDown(state: EditorState, pos: number): number {
  let current = pos
  const lines = 15 // approximate half-page
  for (let i = 0; i < lines; i++) {
    const next = motionDown(state, current)
    if (next === current) break
    current = next
  }
  return current
}

/**
 * Half-page up motion.
 */
export function motionHalfPageUp(state: EditorState, pos: number): number {
  let current = pos
  const lines = 15
  for (let i = 0; i < lines; i++) {
    const next = motionUp(state, current)
    if (next === current) break
    current = next
  }
  return current
}

/**
 * Full-page down motion.
 */
export function motionFullPageDown(state: EditorState, pos: number): number {
  let current = pos
  const lines = 30
  for (let i = 0; i < lines; i++) {
    const next = motionDown(state, current)
    if (next === current) break
    current = next
  }
  return current
}

/**
 * Full-page up motion.
 */
export function motionFullPageUp(state: EditorState, pos: number): number {
  let current = pos
  const lines = 30
  for (let i = 0; i < lines; i++) {
    const next = motionUp(state, current)
    if (next === current) break
    current = next
  }
  return current
}
