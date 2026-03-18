/**
 * Tiptap v3 extension wrapper for VimMode.
 *
 * Usage:
 *   import { VimMode } from './extensions/vim/tiptap'
 *   const editor = new Editor({
 *     extensions: [VimMode],
 *   })
 *
 * Requires @tiptap/core to be installed by the consumer.
 */
import { Extension } from '@tiptap/core'
import { createVimPlugin, vimPluginKey } from './state'
import type { VimState, Mode } from './types'

export const VimMode = Extension.create({
  name: 'vimMode',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      createVimPlugin({
        undo: () => (editor.commands as any).undo(),
        redo: () => (editor.commands as any).redo(),
        indent: () => {
          try {
            return editor.commands.sinkListItem('listItem')
          } catch {
            return false
          }
        },
        outdent: () => {
          try {
            return editor.commands.liftListItem('listItem')
          } catch {
            return false
          }
        },
      }),
    ]
  },
})

export function getVimMode(editor: any): Mode {
  const state = vimPluginKey.getState(editor.state) as VimState | undefined
  return state?.mode ?? 'normal'
}

export function getVimStatus(editor: any): string {
  const state = vimPluginKey.getState(editor.state) as VimState | undefined
  return state?.statusMessage ?? ''
}

export type { VimState, Mode }
