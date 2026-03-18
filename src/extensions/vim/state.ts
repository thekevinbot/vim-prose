import { Plugin, PluginKey, EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
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

      decorations(state: EditorState) {
        if (vimState.mode === 'insert') return DecorationSet.empty

        const decorations: Decoration[] = []

        // Block cursor
        const cursorPos = vimState.visualHead ?? state.selection.$head.pos
        try {
          const $pos = state.doc.resolve(cursorPos)
          if ($pos.depth > 0) {
            const lineEnd = $pos.end($pos.depth)
            if (cursorPos < lineEnd) {
              decorations.push(
                Decoration.inline(cursorPos, cursorPos + 1, { class: 'vim-block-cursor' })
              )
            } else {
              decorations.push(
                Decoration.widget(cursorPos, () => {
                  const span = document.createElement('span')
                  span.className = 'vim-block-cursor-eol'
                  span.textContent = '\u00a0'
                  return span
                }, { side: 0 })
              )
            }
          }
        } catch {
          // Position invalid, skip cursor decoration
        }

        // Visual selection highlight via decoration (more reliable than ::selection)
        if ((vimState.mode === 'visual' || vimState.mode === 'visual-line') &&
            state.selection.from < state.selection.to) {
          decorations.push(
            Decoration.inline(state.selection.from, state.selection.to, {
              class: 'vim-visual-selection',
            })
          )
        }

        return decorations.length > 0
          ? DecorationSet.create(state.doc, decorations)
          : DecorationSet.empty
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
