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
        undo: () => editor.commands.undo(),
        redo: () => editor.commands.redo(),
      }),
    ]
  },
})

export function getVimMode(editor: any): Mode {
  const state = vimPluginKey.getState(editor.state) as VimState | undefined
  return state?.mode ?? 'normal'
}

export type { VimState, Mode }
