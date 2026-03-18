import { EditorState, Transaction, TextSelection } from 'prosemirror-state'
import { VimState } from './types'
import { lineBounds } from './utils'

/**
 * Update the visual selection based on anchor and new head position.
 */
export function updateVisualSelection(
  state: EditorState,
  tr: Transaction,
  vimState: VimState,
  newHead: number,
): Transaction {
  if (vimState.visualAnchor === null) return tr

  const anchor = vimState.visualAnchor
  const head = newHead

  if (vimState.mode === 'visual') {
    // Characterwise visual: select from anchor to head
    // In vim, visual selection is inclusive. We extend head by 1 when head >= anchor
    let selFrom: number, selTo: number
    if (head >= anchor) {
      selFrom = anchor
      selTo = Math.min(head + 1, state.doc.content.size)
    } else {
      selFrom = head
      selTo = Math.min(anchor + 1, state.doc.content.size)
    }

    try {
      tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo))
    } catch {
      // leave as-is
    }
  } else if (vimState.mode === 'visual-line') {
    // Linewise visual: select full lines from anchor to head
    const anchorBounds = lineBounds(state, anchor)
    const headBounds = lineBounds(state, newHead)

    const from = Math.min(anchorBounds.from, headBounds.from)
    const to = Math.max(anchorBounds.to, headBounds.to)

    try {
      tr.setSelection(TextSelection.create(tr.doc, from, to))
    } catch {
      // leave as-is
    }
  }

  tr.scrollIntoView()
  return tr
}

/**
 * Get the effective selection range for visual mode operations (y, d, c, x).
 * Returns the from/to positions and whether it's a linewise operation.
 */
export function getVisualRange(
  state: EditorState,
  vimState: VimState,
): { from: number; to: number; linewise: boolean } | null {
  if (vimState.visualAnchor === null) return null

  const { from, to } = state.selection

  if (vimState.mode === 'visual-line') {
    return { from, to, linewise: true }
  }

  return { from, to, linewise: false }
}
