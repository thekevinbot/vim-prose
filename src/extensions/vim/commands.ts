import {
  EditorState,
  Transaction,
  TextSelection,
  Selection,
} from 'prosemirror-state'
import { Node as ProseMirrorNode, ResolvedPos, Slice } from 'prosemirror-model'
import { VimState } from './types'
import { lineEndAt, paragraphBounds } from './utils'
import {
  ClipboardContent,
  getLinewiseClipboardLines,
  writeSystemClipboardRange,
} from './clipboard'

interface ListItemContext {
  $pos: ResolvedPos
  depth: number
  node: ProseMirrorNode
}

function getListItemContext(state: EditorState, pos: number): ListItemContext | null {
  let $pos = state.doc.resolve(pos)
  if ($pos.depth === 0) {
    if (pos < state.doc.content.size) {
      $pos = state.doc.resolve(pos + 1)
    } else if (pos > 0) {
      $pos = state.doc.resolve(pos - 1)
    } else {
      return null
    }
  }

  return findListItemAtDepth($pos)
}

function findListItemAtDepth($pos: ResolvedPos): ListItemContext | null {
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const node = $pos.node(depth)
    const name = node.type.name
    if (
      name === 'listItem' ||
      name === 'list_item' ||
      name === 'taskItem' ||
      name === 'task_item'
    ) {
      return { $pos, depth, node }
    }
  }
  return null
}

function setSelectionInsideInsertedNode(
  tr: Transaction,
  insertPos: number,
): void {
  try {
    const $inside = tr.doc.resolve(insertPos + 1)
    const selection = Selection.findFrom($inside, 1, true)
    if (selection) {
      tr.setSelection(selection)
      return
    }
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
  } catch {
    // leave as-is
  }
}

function repeatText(text: string, count: number): string {
  return count > 1 ? text.repeat(count) : text
}

function insertSliceRepeated(
  tr: Transaction,
  insertPos: number,
  slice: Slice,
  count: number,
): number {
  let currentInsertPos = insertPos
  for (let i = 0; i < count; i++) {
    const beforeSize = tr.doc.content.size
    tr.setSelection(TextSelection.create(tr.doc, currentInsertPos))
    tr.replaceSelection(slice)
    const insertedSize = tr.doc.content.size - beforeSize
    if (insertedSize <= 0) break
    currentInsertPos = tr.selection.to
  }
  return currentInsertPos
}

function insertLinewiseSlice(
  state: EditorState,
  insertPos: number,
  slice: Slice,
  count: number,
): Transaction | null {
  const tr = state.tr
  try {
    const endPos = insertSliceRepeated(tr, insertPos, slice, count)
    if (endPos <= insertPos) return null
    setSelectionInsideInsertedNode(tr, insertPos)
    return tr
  } catch {
    return null
  }
}

function insertInlineSlice(
  state: EditorState,
  insertPos: number,
  slice: Slice,
  count: number,
  placeCursorAtStart: boolean,
): Transaction | null {
  const tr = state.tr
  try {
    const endPos = insertSliceRepeated(tr, insertPos, slice, count)
    if (endPos <= insertPos) return null
    const selectionPos = placeCursorAtStart
      ? insertPos
      : Math.max(insertPos, endPos - 1)
    tr.setSelection(TextSelection.create(tr.doc, selectionPos))
    return tr
  } catch {
    return null
  }
}

function insertLinewiseText(
  state: EditorState,
  insertPos: number,
  clipboardText: string,
  count: number,
): Transaction {
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return state.tr

  const tr = state.tr
  const lines = getLinewiseClipboardLines(clipboardText)
  let currentInsertPos = insertPos

  for (let i = 0; i < count; i++) {
    for (const line of lines) {
      const node = paragraphType.create(
        null,
        line ? state.schema.text(line) : undefined,
      )
      tr.insert(currentInsertPos, node)
      currentInsertPos += node.nodeSize
    }
  }

  setSelectionInsideInsertedNode(tr, insertPos)
  return tr
}

/**
 * Delete character under cursor (x command).
 */
export function deleteChar(
  state: EditorState,
  pos: number,
  _vimState: VimState,
  count: number = 1,
): Transaction {
  const lineE = lineEndAt(state, pos)
  const to = Math.min(pos + count, lineE)

  if (pos >= lineE) {
    // Nothing to delete, return no-op
    return state.tr
  }

  void writeSystemClipboardRange(state, pos, to, false)

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
  clipboard: ClipboardContent,
  count: number = 1,
): Transaction {
  if (!clipboard.text && !clipboard.slice) return state.tr

  if (clipboard.linewise) {
    // Find the top-level block boundary to insert after
    let $pos = state.doc.resolve(pos)
    if ($pos.depth === 0 && pos < state.doc.content.size) {
      $pos = state.doc.resolve(pos + 1)
    }
    const insertPos = $pos.depth >= 1 ? $pos.after(1) : state.doc.content.size
    if (clipboard.slice) {
      const richTr = insertLinewiseSlice(state, insertPos, clipboard.slice, count)
      if (richTr) return richTr
    }
    if (!clipboard.text) return state.tr
    return insertLinewiseText(state, insertPos, clipboard.text, count)
  } else {
    const insertPos = pos + 1
    const clampedPos = Math.min(insertPos, lineEndAt(state, pos))
    if (clipboard.slice) {
      const richTr = insertInlineSlice(
        state,
        clampedPos,
        clipboard.slice,
        count,
        false,
      )
      if (richTr) return richTr
    }
    if (!clipboard.text) return state.tr
    // Insert text after cursor
    const textToInsert = repeatText(clipboard.text, count)
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
  clipboard: ClipboardContent,
  count: number = 1,
): Transaction {
  if (!clipboard.text && !clipboard.slice) return state.tr

  if (clipboard.linewise) {
    // Find the top-level block boundary to insert before
    let $pos = state.doc.resolve(pos)
    if ($pos.depth === 0 && pos < state.doc.content.size) {
      $pos = state.doc.resolve(pos + 1)
    }
    const insertPos = $pos.depth >= 1 ? $pos.before(1) : 0
    if (clipboard.slice) {
      const richTr = insertLinewiseSlice(state, insertPos, clipboard.slice, count)
      if (richTr) return richTr
    }
    if (!clipboard.text) return state.tr
    return insertLinewiseText(state, insertPos, clipboard.text, count)
  } else {
    if (clipboard.slice) {
      const richTr = insertInlineSlice(state, pos, clipboard.slice, count, true)
      if (richTr) return richTr
    }
    if (!clipboard.text) return state.tr
    // Insert text before cursor
    const textToInsert = repeatText(clipboard.text, count)
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
 * Replace count characters under the cursor (r command).
 */
export function replaceChars(
  state: EditorState,
  pos: number,
  char: string,
  count: number = 1,
): Transaction {
  const lineE = lineEndAt(state, pos)
  if (pos >= lineE) return state.tr

  const to = Math.min(pos + count, lineE)
  const replaceCount = to - pos
  if (replaceCount <= 0) return state.tr

  const tr = state.tr.insertText(char.repeat(replaceCount), pos, to)
  const newPos = pos + replaceCount - 1
  try {
    tr.setSelection(TextSelection.create(tr.doc, newPos))
  } catch {
    // leave as-is
  }
  return tr
}

/**
 * Open line below and enter insert mode (o command).
 */
export function openLineBelow(
  state: EditorState,
  pos: number,
  vimState: VimState,
): Transaction {
  const listItemContext = getListItemContext(state, pos)
  if (listItemContext) {
    const { $pos, depth, node } = listItemContext
    const tr = state.tr
    const insertPos = $pos.after(depth)
    const newListItem = node.type.createAndFill(node.attrs)
    if (newListItem) {
      tr.insert(insertPos, newListItem)
      setSelectionInsideInsertedNode(tr, insertPos)
      vimState.mode = 'insert'
      return tr
    }
  }

  const bounds = paragraphBounds(state, pos)
  const insertPos = bounds.to
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return state.tr

  const tr = state.tr
  const newNode = paragraphType.create()
  tr.insert(insertPos, newNode)

  // Move cursor into the new paragraph
  setSelectionInsideInsertedNode(tr, insertPos)

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
  const listItemContext = getListItemContext(state, pos)
  if (listItemContext) {
    const { $pos, depth, node } = listItemContext
    const tr = state.tr
    const insertPos = $pos.before(depth)
    const newListItem = node.type.createAndFill(node.attrs)
    if (newListItem) {
      tr.insert(insertPos, newListItem)
      setSelectionInsideInsertedNode(tr, insertPos)
      vimState.mode = 'insert'
      return tr
    }
  }

  const bounds = paragraphBounds(state, pos)
  const insertPos = bounds.from
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return state.tr

  const tr = state.tr
  const newNode = paragraphType.create()
  tr.insert(insertPos, newNode)

  // Move cursor into the new paragraph
  setSelectionInsideInsertedNode(tr, insertPos)

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
