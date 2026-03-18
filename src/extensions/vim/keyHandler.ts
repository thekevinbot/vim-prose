import { EditorState, Transaction, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { VimState, VimEditorCommands } from './types'
import {
  motionLeft,
  motionRight,
  motionDown,
  motionUp,
  motionLineStart,
  motionFirstNonBlank,
  motionLineEnd,
  motionDocStart,
  motionDocEnd,
  motionWordForward,
  motionWordBackward,
  motionFindCharForward,
  motionFindCharBackward,
  motionTillCharForward,
  motionTillCharBackward,
  motionHalfPageDown,
  motionHalfPageUp,
  motionFullPageDown,
  motionFullPageUp,
} from './motions'
import {
  resolveTextObject,
  executeDelete,
  executeYank,
  executeChange,
  deleteLines,
  yankLines,
  changeLines,
} from './operators'
import {
  deleteChar,
  pasteAfter,
  pasteBefore,
  openLineBelow,
  openLineAbove,
  joinLines,
} from './commands'
import { updateVisualSelection, getVisualRange } from './visual'
import { lineStartAt, lineEndAt, paragraphBounds, firstNonBlank } from './utils'

function clearPendingState(vimState: VimState) {
  vimState.count = null
  vimState.operator = null
  vimState.findPending = false
  vimState.findMotion = null
  vimState.ggPending = false
  vimState.goalColumn = null
}

function getEffectiveCount(vimState: VimState): number {
  return vimState.count ?? 1
}

/**
 * Apply a motion N times, returning the final position.
 */
function applyMotionNTimes(
  state: EditorState,
  pos: number,
  count: number,
  motionFn: (state: EditorState, pos: number) => number
): number {
  let current = pos
  for (let i = 0; i < count; i++) {
    current = motionFn(state, current)
  }
  return current
}

/**
 * Move cursor to position, clamping to valid range.
 */
function moveCursor(state: EditorState, pos: number): Transaction {
  const clamped = Math.max(0, Math.min(pos, state.doc.content.size))
  const tr = state.tr
  try {
    tr.setSelection(TextSelection.create(tr.doc, clamped))
  } catch {
    // If position is invalid (e.g. inside a node boundary), try to find nearest valid position
    try {
      const $pos = state.doc.resolve(clamped)
      tr.setSelection(TextSelection.create(tr.doc, $pos.pos))
    } catch {
      // leave selection unchanged
    }
  }
  tr.scrollIntoView()
  return tr
}

/**
 * Handle operator + motion/text-object combination.
 */
function handleOperatorMotion(
  state: EditorState,
  vimState: VimState,
  from: number,
  to: number,
  linewise: boolean = false
): Transaction | null {
  const op = vimState.operator
  if (!op) return null

  // Ensure from < to
  const [rangeFrom, rangeTo] = from <= to ? [from, to] : [to, from]

  let tr: Transaction

  switch (op) {
    case 'd':
      tr = executeDelete(state, rangeFrom, rangeTo, vimState, linewise)
      break
    case 'y':
      executeYank(state, rangeFrom, rangeTo, vimState, linewise)
      tr = state.tr // No document change
      break
    case 'c':
      tr = executeChange(state, rangeFrom, rangeTo, vimState, linewise)
      break
    default:
      return null
  }

  clearPendingState(vimState)
  tr.scrollIntoView()
  return tr
}

/**
 * Process a motion key and return the new position (or null if not a motion key).
 */
function resolveMotionKey(
  state: EditorState,
  pos: number,
  key: string,
  count: number,
  ctrlKey: boolean,
  goalColumn?: number
): number | null {
  if (ctrlKey) {
    switch (key) {
      case 'd': return motionHalfPageDown(state, pos)
      case 'u': return motionHalfPageUp(state, pos)
      case 'f': return motionFullPageDown(state, pos)
      case 'b': return motionFullPageUp(state, pos)
      default: return null
    }
  }

  switch (key) {
    case 'h': return applyMotionNTimes(state, pos, count, motionLeft)
    case 'l': return applyMotionNTimes(state, pos, count, motionRight)
    case 'j': {
      let current = pos
      for (let i = 0; i < count; i++) {
        current = motionDown(state, current, goalColumn)
      }
      return current
    }
    case 'k': {
      let current = pos
      for (let i = 0; i < count; i++) {
        current = motionUp(state, current, goalColumn)
      }
      return current
    }
    case '0': return motionLineStart(state, pos)
    case '^': return motionFirstNonBlank(state)
    case '$': return motionLineEnd(state, pos)
    case 'G': return motionDocEnd(state)
    case 'w': return applyMotionNTimes(state, pos, count, motionWordForward)
    case 'b': return applyMotionNTimes(state, pos, count, motionWordBackward)
    default: return null
  }
}

/**
 * Main key handler for the vim plugin.
 */
export function handleKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  vimState: VimState,
  commands: VimEditorCommands
): boolean {
  const state = view.state
  // In visual modes, use the tracked visual head (not $head.pos which is the exclusive selection end)
  const pos = (vimState.mode === 'visual' || vimState.mode === 'visual-line') && vimState.visualHead !== null
    ? vimState.visualHead
    : state.selection.$head.pos
  const key = event.key
  const ctrlKey = event.ctrlKey || event.metaKey

  // ── INSERT MODE ──
  if (vimState.mode === 'insert') {
    if (key === 'Escape' || (ctrlKey && key === 'c')) {
      vimState.mode = 'normal'
      clearPendingState(vimState)
      // Move cursor one left (vim behavior) but don't cross line boundary
      const lineS = lineStartAt(state, pos)
      const newPos = pos > lineS ? pos - 1 : pos
      view.dispatch(moveCursor(state, newPos))
      return true
    }
    return false // Let all other keys pass through in insert mode
  }

  // ── ESC / CTRL-C (normal/visual) ──
  if (key === 'Escape' || (ctrlKey && key === 'c')) {
    if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
      const restorePos = pos
      vimState.mode = 'normal'
      vimState.visualAnchor = null
      vimState.visualHead = null
      clearPendingState(vimState)
      // Collapse selection to the visual head position
      view.dispatch(moveCursor(state, restorePos))
      return true
    }
    clearPendingState(vimState)
    return true
  }

  // ── TEXT OBJECT RESOLUTION (when operator + i/a is pending) ──
  if ((vimState as any)._textObjectType) {
    // Ignore modifier-only keys — wait for the actual character
    if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
      return true
    }

    const objectType = (vimState as any)._textObjectType as 'i' | 'a'
    delete (vimState as any)._textObjectType
    vimState.findPending = false

    if (key.length !== 1) {
      clearPendingState(vimState)
      return true
    }

    const result = resolveTextObject(state, pos, objectType, key)
    if (result) {
      if (vimState.operator) {
        const tr = handleOperatorMotion(state, vimState, result.from, result.to, false)
        if (tr) view.dispatch(tr)
        clearPendingState(vimState)
      } else if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
        vimState.visualAnchor = result.from
        vimState.visualHead = result.to > result.from ? result.to - 1 : result.from
        const tr = state.tr
        try {
          tr.setSelection(TextSelection.create(tr.doc, result.from, result.to))
        } catch {
          // leave as-is
        }
        view.dispatch(tr)
      }
    } else {
      clearPendingState(vimState)
    }
    return true
  }

  // ── FIND PENDING (waiting for char after f/F/t/T) ──
  if (vimState.findPending) {
    // Ignore modifier-only keys — wait for the actual character
    if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
      return true
    }

    if (key.length !== 1) {
      clearPendingState(vimState)
      return true
    }

    const count = getEffectiveCount(vimState)
    let targetPos: number | null = null

    for (let i = 0; i < count; i++) {
      const searchFrom = targetPos ?? pos
      let result: number | null = null
      switch (vimState.findMotion) {
        case 'f': result = motionFindCharForward(state, searchFrom, key); break
        case 'F': result = motionFindCharBackward(state, searchFrom, key); break
        case 't': result = motionTillCharForward(state, searchFrom, key); break
        case 'T': result = motionTillCharBackward(state, searchFrom, key); break
      }
      if (result === null) break
      targetPos = result
    }

    if (targetPos !== null) {
      if (vimState.operator) {
        // For forward motions (f/t): range is [pos, targetPos+1)
        // For backward motions (F/T): range is [targetPos, pos)
        let rangeFrom: number, rangeTo: number
        if (vimState.findMotion === 'f' || vimState.findMotion === 't') {
          rangeFrom = pos
          rangeTo = targetPos + 1 // inclusive of the target char for f, pos after t-stop for t
        } else {
          rangeFrom = targetPos
          rangeTo = pos
        }

        const tr = handleOperatorMotion(state, vimState, rangeFrom, rangeTo, false)
        if (tr) view.dispatch(tr)
      } else if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
        const tr = state.tr
        updateVisualSelection(state, tr, vimState, targetPos)
        vimState.visualHead = targetPos
        view.dispatch(tr)
      } else {
        view.dispatch(moveCursor(state, targetPos))
      }
    }

    vimState.findPending = false
    vimState.findMotion = null
    vimState.count = null
    if (!vimState.operator) {
      // operator was already cleared by handleOperatorMotion
    }
    return true
  }

  // ── DIGIT ACCUMULATION ──
  if (key >= '1' && key <= '9') {
    vimState.count = (vimState.count ?? 0) * 10 + parseInt(key)
    return true
  }
  if (key === '0' && vimState.count !== null) {
    vimState.count = vimState.count * 10
    return true
  }

  // ── GG PENDING ──
  if (vimState.ggPending) {
    if (key === 'g') {
      vimState.ggPending = false
      const targetPos = motionDocStart(state)
      if (vimState.operator) {
        const tr = handleOperatorMotion(state, vimState, pos, targetPos, false)
        if (tr) view.dispatch(tr)
      } else if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
        const tr = state.tr
        updateVisualSelection(state, tr, vimState, targetPos)
        vimState.visualHead = targetPos
        view.dispatch(tr)
      } else {
        view.dispatch(moveCursor(state, targetPos))
      }
      clearPendingState(vimState)
      return true
    }
    vimState.ggPending = false
    return true
  }

  // ── OPERATOR PENDING or VISUAL: i/a starts text object ──
  if ((vimState.operator || vimState.mode === 'visual' || vimState.mode === 'visual-line') && (key === 'i' || key === 'a')) {
    ;(vimState as any)._textObjectType = key as 'i' | 'a'
    return true
  }

  // ── NORMAL + VISUAL MODE DISPATCH ──
  const count = getEffectiveCount(vimState)

  // ── CTRL key combinations ──
  if (ctrlKey) {
    switch (key) {
      case 'r': {
        // Redo
        for (let i = 0; i < count; i++) {
          commands.redo()
        }
        clearPendingState(vimState)
        return true
      }
      case 'd':
      case 'u':
      case 'f':
      case 'b': {
        const targetPos = resolveMotionKey(state, pos, key, count, true)
        if (targetPos !== null) {
          if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
            const tr = state.tr
            updateVisualSelection(state, tr, vimState, targetPos)
            vimState.visualHead = targetPos
            view.dispatch(tr)
          } else {
            view.dispatch(moveCursor(state, targetPos))
          }
        }
        clearPendingState(vimState)
        return true
      }
      case 'c': {
        // Ctrl-C acts as escape
        return false // Already handled above
      }
    }
    return false
  }

  // ── VISUAL MODE operations ──
  if (vimState.mode === 'visual' || vimState.mode === 'visual-line') {
    switch (key) {
      case 'v': {
        if (vimState.mode === 'visual') {
          // Toggle off visual mode
          vimState.mode = 'normal'
          vimState.visualAnchor = null
          vimState.visualHead = null
          view.dispatch(moveCursor(state, pos))
        } else {
          // Switch from visual-line to characterwise visual
          vimState.mode = 'visual'
        }
        clearPendingState(vimState)
        return true
      }
      case 'V': {
        if (vimState.mode === 'visual-line') {
          // Toggle off visual-line mode
          vimState.mode = 'normal'
          vimState.visualAnchor = null
          vimState.visualHead = null
          view.dispatch(moveCursor(state, pos))
        } else {
          // Switch to visual-line from characterwise
          vimState.mode = 'visual-line'
          const tr = state.tr
          updateVisualSelection(state, tr, vimState, pos)
          view.dispatch(tr)
        }
        clearPendingState(vimState)
        return true
      }
      case 'y': {
        const range = getVisualRange(state, vimState)
        if (range) {
          executeYank(state, range.from, range.to, vimState, range.linewise)
        }
        vimState.mode = 'normal'
        vimState.visualAnchor = null
        vimState.visualHead = null
        // Position cursor at start of yanked range, resolving to text position for linewise
        let cursorPos = range ? range.from : pos
        if (range?.linewise && range.from < state.doc.content.size) {
          try {
            const $p = state.doc.resolve(range.from + 1)
            cursorPos = $p.start($p.depth)
          } catch { /* keep cursorPos */ }
        }
        view.dispatch(moveCursor(state, cursorPos))
        clearPendingState(vimState)
        return true
      }
      case 'd':
      case 'x': {
        const range = getVisualRange(state, vimState)
        if (range) {
          const tr = executeDelete(state, range.from, range.to, vimState, range.linewise)
          vimState.mode = 'normal'
          vimState.visualAnchor = null
          vimState.visualHead = null
          clearPendingState(vimState)
          tr.scrollIntoView()
          view.dispatch(tr)
        }
        return true
      }
      case 'c': {
        const range = getVisualRange(state, vimState)
        if (range) {
          const tr = executeChange(state, range.from, range.to, vimState, range.linewise)
          vimState.visualAnchor = null
          vimState.visualHead = null
          clearPendingState(vimState)
          tr.scrollIntoView()
          view.dispatch(tr)
        }
        return true
      }
      default: {
        // Try as motion — prepare goalColumn for j/k
        if (key === 'j' || key === 'k') {
          if (vimState.goalColumn === null) {
            try {
              const $pos = state.doc.resolve(pos)
              vimState.goalColumn = pos - $pos.start($pos.depth)
            } catch { vimState.goalColumn = 0 }
          }
        }
        const savedGoal = (key === 'j' || key === 'k') ? vimState.goalColumn : null
        const targetPos = resolveMotionKey(state, pos, key, count, false, vimState.goalColumn ?? undefined)
        if (targetPos !== null) {
          const tr = state.tr
          updateVisualSelection(state, tr, vimState, targetPos)
          vimState.visualHead = targetPos
          view.dispatch(tr)
          clearPendingState(vimState)
          vimState.goalColumn = savedGoal
          return true
        }

        // gg motion
        if (key === 'g') {
          vimState.ggPending = true
          return true
        }

        // f/F/t/T
        if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
          vimState.findPending = true
          vimState.findMotion = key
          return true
        }
      }
    }
    return true // Consume all keys in visual mode
  }

  // ── NORMAL MODE DISPATCH ──

  // Operator pending mode: doubled operator = linewise
  if (vimState.operator) {
    if (key === vimState.operator) {
      // dd, yy, cc — linewise operation
      switch (vimState.operator) {
        case 'd': {
          const tr = deleteLines(state, pos, count, vimState)
          clearPendingState(vimState)
          tr.scrollIntoView()
          view.dispatch(tr)
          return true
        }
        case 'y': {
          yankLines(state, pos, count, vimState)
          clearPendingState(vimState)
          return true
        }
        case 'c': {
          const tr = changeLines(state, pos, count, vimState)
          clearPendingState(vimState)
          tr.scrollIntoView()
          view.dispatch(tr)
          return true
        }
      }
    }

    // Operator + motion — prepare goalColumn for j/k
    if (key === 'j' || key === 'k') {
      if (vimState.goalColumn === null) {
        try {
          const $pos = state.doc.resolve(pos)
          vimState.goalColumn = pos - $pos.start($pos.depth)
        } catch { vimState.goalColumn = 0 }
      }
    }
    const targetPos = resolveMotionKey(state, pos, key, count, false, vimState.goalColumn ?? undefined)
    if (targetPos !== null) {
      let from = pos
      let to = targetPos

      // For $ motion with operator, include the end position
      if (key === '$') {
        to = targetPos
      }

      // For w motion with operator, the range is from cursor to target
      if (key === 'w') {
        to = targetPos
      }

      const tr = handleOperatorMotion(state, vimState, from, to, false)
      if (tr) view.dispatch(tr)
      return true
    }

    // Operator + gg
    if (key === 'g') {
      vimState.ggPending = true
      return true
    }

    // Operator + f/F/t/T
    if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
      vimState.findPending = true
      vimState.findMotion = key
      return true
    }

    // Operator + text object (i/a already handled above)
    return true
  }

  // ── Normal mode key dispatch ──
  switch (key) {
    // Mode switching
    case 'i': {
      vimState.mode = 'insert'
      clearPendingState(vimState)
      view.dispatch(state.tr) // Trigger view update for mode change
      return true
    }
    case 'I': {
      vimState.mode = 'insert'
      const fnbPos = firstNonBlank(state)
      view.dispatch(moveCursor(state, fnbPos))
      clearPendingState(vimState)
      return true
    }
    case 'a': {
      vimState.mode = 'insert'
      // Move cursor one right (after current char)
      const newPos = Math.min(pos + 1, lineEndAt(state, pos))
      view.dispatch(moveCursor(state, newPos))
      clearPendingState(vimState)
      return true
    }
    case 'A': {
      vimState.mode = 'insert'
      const endPos = lineEndAt(state, pos)
      view.dispatch(moveCursor(state, endPos))
      clearPendingState(vimState)
      return true
    }
    case 'v': {
      vimState.mode = 'visual'
      vimState.visualAnchor = pos
      vimState.visualHead = pos
      clearPendingState(vimState)
      // Set initial selection (single character)
      const tr = state.tr
      try {
        tr.setSelection(TextSelection.create(tr.doc, pos, Math.min(pos + 1, state.doc.content.size)))
      } catch {
        // leave as-is
      }
      view.dispatch(tr)
      return true
    }
    case 'V': {
      vimState.mode = 'visual-line'
      vimState.visualAnchor = pos
      vimState.visualHead = pos
      clearPendingState(vimState)
      const tr = state.tr
      updateVisualSelection(state, tr, vimState, pos)
      view.dispatch(tr)
      return true
    }

    // Operators
    case 'd': {
      vimState.operator = 'd'
      return true
    }
    case 'y': {
      vimState.operator = 'y'
      return true
    }
    case 'c': {
      vimState.operator = 'c'
      return true
    }

    // Linewise shortcuts
    case 'D': {
      // Delete to end of line
      const endPos = lineEndAt(state, pos)
      if (pos < endPos) {
        const tr = executeDelete(state, pos, endPos, vimState, false)
        view.dispatch(tr)
      }
      clearPendingState(vimState)
      return true
    }
    case 'Y': {
      // Yank to end of line
      const endPos = lineEndAt(state, pos)
      executeYank(state, pos, endPos, vimState, false)
      clearPendingState(vimState)
      return true
    }
    case 'C': {
      // Change to end of line
      const endPos = lineEndAt(state, pos)
      if (pos < endPos) {
        const tr = executeChange(state, pos, endPos, vimState, false)
        view.dispatch(tr)
      } else {
        vimState.mode = 'insert'
      }
      clearPendingState(vimState)
      return true
    }

    // Editing commands
    case 'x': {
      const tr = deleteChar(state, pos, vimState, count)
      view.dispatch(tr)
      clearPendingState(vimState)
      return true
    }
    case 'p': {
      const tr = pasteAfter(state, pos, vimState, count)
      view.dispatch(tr)
      clearPendingState(vimState)
      return true
    }
    case 'P': {
      const tr = pasteBefore(state, pos, vimState, count)
      view.dispatch(tr)
      clearPendingState(vimState)
      return true
    }
    case 'o': {
      const tr = openLineBelow(state, pos, vimState)
      view.dispatch(tr)
      clearPendingState(vimState)
      return true
    }
    case 'O': {
      const tr = openLineAbove(state, pos, vimState)
      view.dispatch(tr)
      clearPendingState(vimState)
      return true
    }
    case 'J': {
      const tr = joinLines(state, pos, count)
      view.dispatch(tr)
      clearPendingState(vimState)
      return true
    }

    // Undo
    case 'u': {
      for (let i = 0; i < count; i++) {
        commands.undo()
      }
      clearPendingState(vimState)
      return true
    }

    // Motions
    case 'j':
    case 'k': {
      if (vimState.goalColumn === null) {
        try {
          const $pos = state.doc.resolve(pos)
          vimState.goalColumn = pos - $pos.start($pos.depth)
        } catch { vimState.goalColumn = 0 }
      }
      const savedGoal = vimState.goalColumn
      const targetPos = resolveMotionKey(state, pos, key, count, false, savedGoal)
      if (targetPos !== null) {
        view.dispatch(moveCursor(state, targetPos))
      }
      clearPendingState(vimState)
      vimState.goalColumn = savedGoal
      return true
    }
    case 'h':
    case 'l':
    case '^':
    case '$':
    case 'w':
    case 'b': {
      const targetPos = resolveMotionKey(state, pos, key, count, false)
      if (targetPos !== null) {
        view.dispatch(moveCursor(state, targetPos))
      }
      clearPendingState(vimState)
      return true
    }
    case '0': {
      // 0 is motion to line start (only when not part of a count)
      const targetPos = motionLineStart(state, pos)
      view.dispatch(moveCursor(state, targetPos))
      clearPendingState(vimState)
      return true
    }
    case 'G': {
      const targetPos = motionDocEnd(state)
      view.dispatch(moveCursor(state, targetPos))
      clearPendingState(vimState)
      return true
    }
    case 'g': {
      vimState.ggPending = true
      return true
    }

    // Find/Till
    case 'f':
    case 'F':
    case 't':
    case 'T': {
      vimState.findPending = true
      vimState.findMotion = key
      return true
    }
  }

  // Consume all remaining keys in normal mode to prevent them from inserting text
  if (key.length === 1) {
    return true
  }

  return false
}
