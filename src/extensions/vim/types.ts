import type { Node as ProseMirrorNode } from 'prosemirror-model'

export type Mode = 'normal' | 'insert' | 'replace' | 'visual' | 'visual-line'

export interface Register {
  text: string
  linewise: boolean
  content: ProseMirrorNode[] | null
}

export interface RepeatableAction {
  type:
    | 'command'
    | 'operator-linewise'
    | 'operator-motion'
    | 'operator-textobject'
    | 'insert-command'
  key: string
  count: number
  operator?: 'd' | 'y' | 'c'
  motion?: string
  findChar?: string
  findMotion?: 'f' | 'F' | 't' | 'T'
  textObject?: { type: 'i' | 'a'; object: string }
  insertedText?: string
  replaceChar?: string
}

export interface VimState {
  mode: Mode
  count: number | null
  operator: 'd' | 'y' | 'c' | null
  findPending: boolean
  findMotion: 'f' | 'F' | 't' | 'T' | null
  ggPending: boolean
  visualAnchor: number | null
  visualHead: number | null
  register: Register
  goalColumn: number | null
  // Marks
  marks: Record<string, number>
  markPending: boolean
  gotoMarkPending: boolean
  // Search
  searchTerm: string
  searchWholeWord: boolean
  searchActive: boolean
  searchQuery: string
  searchHighlightsVisible: boolean
  // Repeat
  lastAction: RepeatableAction | null
  insertTextBuffer: string
  isTrackingInsert: boolean
  replacePendingCount: number | null
  // Indent pending
  shiftRightPending: boolean
  shiftLeftPending: boolean
  // Center cursor pending
  zzPending: boolean
  // Status message (for status line display)
  statusMessage: string
}

export interface VimEditorCommands {
  undo(): boolean
  redo(): boolean
  indent?(): boolean
  outdent?(): boolean
}

export function defaultVimState(): VimState {
  return {
    mode: 'normal',
    count: null,
    operator: null,
    findPending: false,
    findMotion: null,
    ggPending: false,
    visualAnchor: null,
    visualHead: null,
    register: { text: '', linewise: false, content: null },
    goalColumn: null,
    marks: {},
    markPending: false,
    gotoMarkPending: false,
    searchTerm: '',
    searchWholeWord: false,
    searchActive: false,
    searchQuery: '',
    searchHighlightsVisible: false,
    lastAction: null,
    insertTextBuffer: '',
    isTrackingInsert: false,
    replacePendingCount: null,
    shiftRightPending: false,
    shiftLeftPending: false,
    zzPending: false,
    statusMessage: '',
  }
}
