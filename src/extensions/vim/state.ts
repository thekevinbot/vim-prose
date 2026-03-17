import { Plugin, PluginKey, EditorState } from 'prosemirror-state'
import { VimState, VimEditorCommands, defaultVimState } from './types'
import { handleKeyDown } from './keyHandler'

export const vimPluginKey = new PluginKey<VimState>('vimMode')

export function createVimPlugin(commands: VimEditorCommands): Plugin<VimState> {
  const vimState = defaultVimState()

  return new Plugin<VimState>({
    key: vimPluginKey,

    state: {
      init(): VimState {
        return vimState
      },
      apply(_tr: any, value: VimState): VimState {
        return value
      },
    },

    props: {
      handleKeyDown(view: any, event: any) {
        return handleKeyDown(view, event, vimState, commands)
      },

      attributes(_state: any) {
        return {
          'data-vim-mode': vimState.mode,
          class: `vim-mode vim-mode-${vimState.mode}`,
        }
      },
    },
  })
}

/**
 * Get the current vim state from an EditorState.
 */
export function getVimStateFromEditorState(state: EditorState): VimState | null {
  return vimPluginKey.getState(state) ?? null
}
