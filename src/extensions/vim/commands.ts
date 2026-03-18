import {
  EditorState,
  Transaction,
  TextSelection,
  Selection,
} from 'prosemirror-state'
import { Fragment, Node as ProseMirrorNode } from 'prosemirror-model'
import { VimState } from './types'
import {
  lineEndAt,
  lineStartAt,
  paragraphBounds,
  lineBounds,
  charAt,
} from './utils'

/**
 * Delete character under cursor (x command).
 */
export function deleteChar(
  state: EditorState,
  pos: number,
  vimState: VimState,
  count: number = 1,
): Transaction {
  const lineE = lineEndAt(state, pos)
  const to = Math.min(pos + count, lineE)

  if (pos >= lineE) {
    // Nothing to delete, return no-op
    return state.tr
  }

  const text = state.doc.textBetween(pos, to, '\n', '\n')
  vimState.register = { text, linewise: false, content: null }

  const tr = state.tr.delete(pos, to)
  const newPos = Math.min(pos, tr.doc.content.size)
  try {
    tr.setSelection(TextSelection.create(tr.doc, newPos))
  } catch {
    // leave as-is
  }
  return tr
}

/**
 * Paste after cursor (p command).
 */
export function pasteAfter(
  state: EditorState,
  pos: number,
  vimState: VimState,
  count: number = 1,
): Transaction {
  if (!vimState.register.text) return state.tr

  if (vimState.register.linewise) {
    // Find the top-level block boundary to insert after
    let $pos = state.doc.resolve(pos)
    if ($pos.depth === 0 && pos < state.doc.content.size) {
      $pos = state.doc.resolve(pos + 1)
    }
    const insertPos = $pos.depth >= 1 ? $pos.after(1) : state.doc.content.size
    const tr = state.tr

    if (vimState.register.content && vimState.register.content.length > 0) {
      // Use stored nodes to preserve formatting
      const allNodes: ProseMirrorNode[] = []
      for (let c = 0; c < count; c++) {
        allNodes.push(...vimState.register.content)
      }
      tr.insert(insertPos, Fragment.from(allNodes))
    } else {
      // Fallback: text-based paste
      const textToInsert = vimState.register.text.repeat(count)
      const paragraphType = state.schema.nodes.paragraph
      if (!paragraphType) return state.tr
      const lines = textToInsert.split('\n')
      let currentInsertPos = insertPos
      for (const line of lines) {
        const newNode = paragraphType.create(
          null,
          line ? state.schema.text(line) : undefined,
        )
        tr.insert(currentInsertPos, newNode)
        currentInsertPos += newNode.nodeSize
      }
    }

    // Position cursor at start of first inserted content
    try {
      const $p = tr.doc.resolve(insertPos + 1)
      const sel = Selection.findFrom($p, 1, true)
      if (sel) tr.setSelection(sel)
    } catch {
      // leave as-is
    }

    return tr
  } else {
    // Insert text after cursor
    const textToInsert = vimState.register.text.repeat(count)
    const insertPos = pos + 1
    const clampedPos = Math.min(insertPos, lineEndAt(state, pos))
    const tr = state.tr.insertText(textToInsert, clampedPos)
    // Position cursor at end of inserted text
    const newPos = clampedPos + textToInsert.length - 1
    try {
      tr.setSelection(
        TextSelection.create(tr.doc, Math.max(clampedPos, newPos)),
      )
    } catch {
      // leave as-is
    }
    return tr
  }
}

/**
 * Paste before cursor (P command).
 */
export function pasteBefore(
  state: EditorState,
  pos: number,
  vimState: VimState,
  count: number = 1,
): Transaction {
  if (!vimState.register.text) return state.tr

  if (vimState.register.linewise) {
    // Find the top-level block boundary to insert before
    let $pos = state.doc.resolve(pos)
    if ($pos.depth === 0 && pos < state.doc.content.size) {
      $pos = state.doc.resolve(pos + 1)
    }
    const insertPos = $pos.depth >= 1 ? $pos.before(1) : 0
    const tr = state.tr

    if (vimState.register.content && vimState.register.content.length > 0) {
      // Use stored nodes to preserve formatting
      const allNodes: ProseMirrorNode[] = []
      for (let c = 0; c < count; c++) {
        allNodes.push(...vimState.register.content)
      }
      tr.insert(insertPos, Fragment.from(allNodes))
    } else {
      // Fallback: text-based paste
      const textToInsert = vimState.register.text.repeat(count)
      const paragraphType = state.schema.nodes.paragraph
      if (!paragraphType) return state.tr
      const lines = textToInsert.split('\n')
      let currentInsertPos = insertPos
      for (const line of lines) {
        const newNode = paragraphType.create(
          null,
          line ? state.schema.text(line) : undefined,
        )
        tr.insert(currentInsertPos, newNode)
        currentInsertPos += newNode.nodeSize
      }
    }

    // Position cursor at start of first inserted content
    try {
      const $p = tr.doc.resolve(insertPos + 1)
      const sel = Selection.findFrom($p, 1, true)
      if (sel) tr.setSelection(sel)
    } catch {
      // leave as-is
    }

    return tr
  } else {
    // Insert text before cursor
    const textToInsert = vimState.register.text.repeat(count)
    const tr = state.tr.insertText(textToInsert, pos)
    // Position cursor at the start of inserted text
    try {
      tr.setSelection(TextSelection.create(tr.doc, pos))
    } catch {
      // leave as-is
    }
    return tr
  }
}

/**
 * Open line below and enter insert mode (o command).
 */
export function openLineBelow(
  state: EditorState,
  pos: number,
  vimState: VimState,
): Transaction {
  const bounds = paragraphBounds(state, pos)
  const insertPos = bounds.to
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return state.tr

  const tr = state.tr
  const newNode = paragraphType.create()
  tr.insert(insertPos, newNode)

  // Move cursor into the new paragraph
  try {
    const newPos = insertPos + 1
    tr.setSelection(TextSelection.create(tr.doc, newPos))
  } catch {
    // leave as-is
  }

  vimState.mode = 'insert'
  return tr
}

/**
 * Open line above and enter insert mode (O command).
 */
export function openLineAbove(
  state: EditorState,
  pos: number,
  vimState: VimState,
): Transaction {
  const bounds = paragraphBounds(state, pos)
  const insertPos = bounds.from
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return state.tr

  const tr = state.tr
  const newNode = paragraphType.create()
  tr.insert(insertPos, newNode)

  // Move cursor into the new paragraph
  try {
    const newPos = insertPos + 1
    tr.setSelection(TextSelection.create(tr.doc, newPos))
  } catch {
    // leave as-is
  }

  vimState.mode = 'insert'
  return tr
}

/**
 * Join current line with next line (J command).
 */
export function joinLines(
  state: EditorState,
  pos: number,
  count: number = 1,
): Transaction {
  const tr = state.tr
  let currentPos = pos

  for (let i = 0; i < count; i++) {
    const $pos = tr.doc.resolve(currentPos)
    const lineE = $pos.end($pos.depth)
    const afterNode = $pos.after($pos.depth)

    // Check if there's a next paragraph
    if (afterNode >= tr.doc.content.size) break

    // Check if we need to add a space
    const lastChar =
      lineE > $pos.start($pos.depth) ? tr.doc.textBetween(lineE - 1, lineE) : ''
    const needsSpace = lastChar !== '' && lastChar !== ' '

    // Delete the boundary between paragraphs
    // The boundary is from the end of current paragraph node to the start of text in next paragraph
    const nextNodePos = afterNode + 1 // start of next paragraph text
    try {
      if (needsSpace) {
        tr.replaceWith(lineE, nextNodePos, state.schema.text(' '))
      } else {
        tr.delete(lineE, nextNodePos)
      }
    } catch {
      break
    }
  }

  return tr
}
