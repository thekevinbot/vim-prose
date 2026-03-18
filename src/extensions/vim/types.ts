import type { Node as ProseMirrorNode } from 'prosemirror-model'

export type Mode = 'normal' | 'insert' | 'visual' | 'visual-line'

export interface Register {
  text: string
  linewise: boolean
  content: ProseMirrorNode[] | null
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
}

export interface VimEditorCommands {
  undo(): boolean
  redo(): boolean
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
  }
}
