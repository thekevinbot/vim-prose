import {
  EditorState,
  Transaction,
  TextSelection,
  Selection,
} from 'prosemirror-state'
import { VimState } from './types'
import {
  lineStartAt,
  lineEndAt,
  charAt,
  isWordChar,
  isWhitespace,
  paragraphBounds,
  lineBounds,
} from './utils'
import { writeSystemClipboardRange } from './clipboard'

/**
 * Resolve a text object, returning { from, to } positions.
 */
export function resolveTextObject(
  state: EditorState,
  pos: number,
  type: 'i' | 'a',
  object: string,
): { from: number; to: number } | null {
  if (object === 'w') {
    return resolveWordObject(state, pos)
  }

  const pairs: Record<string, [string, string]> = {
    '(': ['(', ')'],
    ')': ['(', ')'],
    '[': ['[', ']'],
    ']': ['[', ']'],
    '{': ['{', '}'],
    '}': ['{', '}'],
    '<': ['<', '>'],
    '>': ['<', '>'],
    "'": ["'", "'"],
    '"': ['"', '"'],
    '`': ['`', '`'],
  }

  const pair = pairs[object]
  if (!pair) return null

  return resolveDelimiterObject(state, pos, type, pair[0], pair[1])
}

function resolveWordObject(
  state: EditorState,
  pos: number,
): { from: number; to: number } | null {
  const $pos = state.doc.resolve(pos)
  const lineS = $pos.start($pos.depth)
  const lineE = $pos.end($pos.depth)

  const ch = charAt(state, pos)
  if (!ch) return null

  let from = pos
  let to = pos

  if (isWordChar(ch)) {
    // Expand to cover full word
    while (from > lineS && isWordChar(charAt(state, from - 1))) from--
    while (to < lineE && isWordChar(charAt(state, to))) to++
  } else if (isWhitespace(ch)) {
    while (from > lineS && isWhitespace(charAt(state, from - 1))) from--
    while (to < lineE && isWhitespace(charAt(state, to))) to++
  } else {
    // Punctuation
    while (
      from > lineS &&
      !isWordChar(charAt(state, from - 1)) &&
      !isWhitespace(charAt(state, from - 1))
    )
      from--
    while (
      to < lineE &&
      !isWordChar(charAt(state, to)) &&
      !isWhitespace(charAt(state, to))
    )
      to++
  }

  return { from, to }
}

function resolveDelimiterObject(
  state: EditorState,
  pos: number,
  type: 'i' | 'a',
  open: string,
  close: string,
): { from: number; to: number } | null {
  // For quotes, simple scan within current paragraph
  const $pos = state.doc.resolve(pos)
  const lineS = $pos.start($pos.depth)
  const lineE = $pos.end($pos.depth)
  const text = state.doc.textBetween(lineS, lineE, '\n', '\n')
  const offset = pos - lineS

  if (open === close) {
    // Quote-like delimiters: find surrounding pair
    let openIdx = -1
    let closeIdx = -1

    // Find the quote pair that contains the cursor
    const indices: number[] = []
    for (let i = 0; i < text.length; i++) {
      if (text[i] === open) indices.push(i)
    }

    // Find a pair that contains the offset
    for (let i = 0; i < indices.length - 1; i += 2) {
      if (indices[i] <= offset && offset <= indices[i + 1]) {
        openIdx = indices[i]
        closeIdx = indices[i + 1]
        break
      }
    }

    // If cursor is on a delimiter, try to find pair starting from it
    if (openIdx === -1 && text[offset] === open) {
      for (let i = 0; i < indices.length - 1; i++) {
        if (indices[i] === offset) {
          openIdx = indices[i]
          closeIdx = indices[i + 1]
          break
        }
      }
    }

    if (openIdx === -1 || closeIdx === -1) return null

    if (type === 'i') {
      return { from: lineS + openIdx + 1, to: lineS + closeIdx }
    } else {
      return { from: lineS + openIdx, to: lineS + closeIdx + 1 }
    }
  } else {
    // Bracket-like delimiters: handle nesting
    let depth = 0
    let openIdx = -1

    // Search backward for opening bracket
    for (let i = offset; i >= 0; i--) {
      if (text[i] === close && i !== offset) depth++
      if (text[i] === open) {
        if (depth === 0) {
          openIdx = i
          break
        }
        depth--
      }
    }

    if (openIdx === -1) return null

    // Search forward for closing bracket
    depth = 0
    let closeIdx = -1
    for (let i = openIdx + 1; i < text.length; i++) {
      if (text[i] === open) depth++
      if (text[i] === close) {
        if (depth === 0) {
          closeIdx = i
          break
        }
        depth--
      }
    }

    if (closeIdx === -1) return null

    if (type === 'i') {
      return { from: lineS + openIdx + 1, to: lineS + closeIdx }
    } else {
      return { from: lineS + openIdx, to: lineS + closeIdx + 1 }
    }
  }
}

/**
 * Execute a delete operation on the given range.
 * Returns the transaction and the deleted text.
 */
export function executeDelete(
  state: EditorState,
  from: number,
  to: number,
  _vimState: VimState,
  linewise: boolean = false,
): Transaction {
  void writeSystemClipboardRange(state, from, to, linewise)

  let tr: Transaction

  if (linewise) {
    tr = state.tr.delete(from, to)
    const newPos = Math.min(from, tr.doc.content.size)
    try {
      const $pos = tr.doc.resolve(newPos)
      const sel =
        Selection.findFrom($pos, 1, true) || Selection.findFrom($pos, -1, true)
      if (sel) tr.setSelection(sel)
    } catch {
      // leave as-is
    }
  } else {
    tr = state.tr.delete(from, to)
    const newPos = Math.min(from, tr.doc.content.size)
    try {
      tr.setSelection(TextSelection.create(tr.doc, newPos))
    } catch {
      // leave selection as-is
    }
  }

  return tr
}

/**
 * Execute a yank operation on the given range.
 * Does not modify the document.
 */
export function executeYank(
  state: EditorState,
  from: number,
  to: number,
  _vimState: VimState,
  linewise: boolean = false,
): void {
  void writeSystemClipboardRange(state, from, to, linewise)
}

/**
 * Execute a change operation: delete range, then enter insert mode.
 * Returns the transaction.
 */
export function executeChange(
  state: EditorState,
  from: number,
  to: number,
  vimState: VimState,
  linewise: boolean = false,
): Transaction {
  void writeSystemClipboardRange(state, from, to, linewise)

  let tr: Transaction

  if (linewise) {
    // Delete the selected lines and replace with a single empty paragraph
    tr = state.tr.delete(from, to)
    const paragraphType = state.schema.nodes.paragraph
    if (paragraphType) {
      const insertAt = Math.min(from, tr.doc.content.size)
      tr.insert(insertAt, paragraphType.create())
      try {
        tr.setSelection(TextSelection.create(tr.doc, insertAt + 1))
      } catch {
        // leave as-is
      }
    }
  } else {
    tr = state.tr.delete(from, to)
    const newPos = Math.min(from, tr.doc.content.size)
    try {
      tr.setSelection(TextSelection.create(tr.doc, newPos))
    } catch {
      // leave selection as-is
    }
  }

  vimState.mode = 'insert'
  return tr
}

/**
 * Delete a number of lines starting from the current cursor position.
 */
export function deleteLines(
  state: EditorState,
  pos: number,
  count: number,
  _vimState: VimState,
): Transaction {
  let from = lineBounds(state, pos).from
  let to = from

  for (let i = 0; i < count; i++) {
    const bounds = lineBounds(
      state,
      Math.min(to + 1, state.doc.content.size - 1),
    )
    to = bounds.to
    if (to >= state.doc.content.size) break
  }

  to = Math.min(to, state.doc.content.size)

  void writeSystemClipboardRange(state, from, to, true)

  const tr = state.tr.delete(from, to)

  // Position cursor at start of next (or previous) line
  const newPos = Math.min(from, tr.doc.content.size)
  try {
    const $pos = tr.doc.resolve(newPos)
    const sel =
      Selection.findFrom($pos, 1, true) || Selection.findFrom($pos, -1, true)
    if (sel) tr.setSelection(sel)
  } catch {
    // leave as-is
  }

  return tr
}

/**
 * Yank a number of lines starting from the current cursor position.
 */
export function yankLines(
  state: EditorState,
  pos: number,
  count: number,
  _vimState: VimState,
): void {
  let from = lineBounds(state, pos).from
  let to = from

  for (let i = 0; i < count; i++) {
    const bounds = lineBounds(
      state,
      Math.min(to + 1, state.doc.content.size - 1),
    )
    to = bounds.to
    if (to >= state.doc.content.size) break
  }

  to = Math.min(to, state.doc.content.size)

  void writeSystemClipboardRange(state, from, to, true)
}

/**
 * Change a number of lines (clear content, enter insert mode).
 */
export function changeLines(
  state: EditorState,
  pos: number,
  count: number,
  vimState: VimState,
): Transaction {
  // For `cc` with count, delete extra lines and clear the first one
  const $pos = state.doc.resolve(pos)
  const firstLineStart = $pos.start($pos.depth)
  const firstLineEnd = $pos.end($pos.depth)

  if (count <= 1) {
    // Just clear the content of the current line
    void writeSystemClipboardRange(state, firstLineStart, firstLineEnd, true)
    const tr = state.tr.delete(firstLineStart, firstLineEnd)
    tr.setSelection(TextSelection.create(tr.doc, firstLineStart))
    vimState.mode = 'insert'
    return tr
  }

  // Multiple lines: collect text, delete all lines, keep one empty paragraph
  let from = lineBounds(state, pos).from
  let to = from
  for (let i = 0; i < count; i++) {
    const bounds = lineBounds(
      state,
      Math.min(to + 1, state.doc.content.size - 1),
    )
    to = bounds.to
    if (to >= state.doc.content.size) break
  }
  to = Math.min(to, state.doc.content.size)

  void writeSystemClipboardRange(state, from, to, true)

  // Delete all the lines
  const tr = state.tr.delete(from, to)

  // Insert an empty paragraph
  const paragraphType = state.schema.nodes.paragraph
  if (paragraphType) {
    tr.insert(from, paragraphType.create())
  }

  const newPos = Math.min(from + 1, tr.doc.content.size)
  try {
    tr.setSelection(TextSelection.create(tr.doc, newPos))
  } catch {
    // leave as-is
  }

  vimState.mode = 'insert'
  return tr
}
