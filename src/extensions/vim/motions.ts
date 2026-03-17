import { EditorState } from 'prosemirror-state'
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
 * Move left by one character, clamped to line start.
 */
export function motionLeft(state: EditorState, pos: number): number {
  const start = lineStartAt(state, pos)
  return Math.max(start, pos - 1)
}

/**
 * Move right by one character, clamped to line end.
 */
export function motionRight(state: EditorState, pos: number): number {
  const end = lineEndAt(state, pos)
  return Math.min(end, pos + 1)
}

/**
 * Move down by one line, trying to preserve column offset.
 */
export function motionDown(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  const currentLineStart = $pos.start($pos.depth)
  const currentOffset = pos - currentLineStart

  // Find the next paragraph node
  const currentNodeEnd = $pos.after($pos.depth)
  if (currentNodeEnd >= state.doc.content.size) return pos

  const nextPos = Math.min(currentNodeEnd + 1, state.doc.content.size)
  if (nextPos >= state.doc.content.size) return pos

  try {
    const $next = state.doc.resolve(nextPos)
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
 */
export function motionUp(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  const currentLineStart = $pos.start($pos.depth)
  const currentOffset = pos - currentLineStart

  // Find the previous paragraph node
  const currentNodeStart = $pos.before($pos.depth)
  if (currentNodeStart <= 0) return pos

  const prevPos = currentNodeStart - 1
  if (prevPos < 0) return pos

  try {
    const $prev = state.doc.resolve(prevPos)
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
 * Move forward by one word.
 */
export function motionWordForward(state: EditorState, pos: number): number {
  const docSize = state.doc.content.size

  // First check if we're at the end of a paragraph and need to cross to next
  const $pos = state.doc.resolve(pos)
  const lineEndPos = $pos.end($pos.depth)

  if (pos >= lineEndPos) {
    // We're at the end of the line, try to go to next paragraph
    const afterNode = $pos.after($pos.depth)
    if (afterNode >= docSize) return pos
    const nextPos = afterNode + 1
    if (nextPos >= docSize) return pos
    try {
      const $next = state.doc.resolve(nextPos)
      return $next.start($next.depth)
    } catch {
      return pos
    }
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
    while (current < lineEndPos && !isWordChar(charAt(state, current)) && !isWhitespace(charAt(state, current))) {
      current++
    }
    // Skip whitespace
    while (current < lineEndPos && isWhitespace(charAt(state, current))) {
      current++
    }
  }

  if (current >= lineEndPos) {
    // Move to next paragraph start (empty lines are word stops)
    const afterNode = $pos.after($pos.depth)
    if (afterNode >= docSize) return lineEndPos
    const nextPos = afterNode + 1
    if (nextPos >= docSize) return lineEndPos
    try {
      const $next = state.doc.resolve(nextPos)
      return $next.start($next.depth)
    } catch {
      return lineEndPos
    }
  }

  return current
}

/**
 * Move backward by one word.
 */
export function motionWordBackward(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos)
  const lineStartPos = $pos.start($pos.depth)

  if (pos <= lineStartPos) {
    // We're at the start of the line, try to go to previous paragraph
    const beforeNode = $pos.before($pos.depth)
    if (beforeNode <= 0) return pos
    const prevPos = beforeNode - 1
    if (prevPos < 0) return pos
    try {
      const $prev = state.doc.resolve(prevPos)
      return $prev.end($prev.depth)
    } catch {
      return pos
    }
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
    while (current > lineStartPos && !isWordChar(charAt(state, current - 1)) && !isWhitespace(charAt(state, current - 1))) {
      current--
    }
  }

  return current
}

/**
 * Forward find char on current line (f motion).
 */
export function motionFindCharForward(state: EditorState, pos: number, char: string): number | null {
  const $pos = state.doc.resolve(pos)
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
export function motionFindCharBackward(state: EditorState, pos: number, char: string): number | null {
  const $pos = state.doc.resolve(pos)
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
export function motionTillCharForward(state: EditorState, pos: number, char: string): number | null {
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
export function motionTillCharBackward(state: EditorState, pos: number, char: string): number | null {
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
