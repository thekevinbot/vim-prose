export type Mode = 'normal' | 'insert' | 'visual' | 'visual-line'

export interface Register {
  text: string
  linewise: boolean
}

export interface VimState {
  mode: Mode
  count: number | null
  operator: 'd' | 'y' | 'c' | null
  findPending: boolean
  findMotion: 'f' | 'F' | 't' | 'T' | null
  ggPending: boolean
  visualAnchor: number | null
  register: Register
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
    register: { text: '', linewise: false },
  }
}
