import {
  Plugin,
  PluginKey,
  EditorState,
  Selection,
  Transaction,
} from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { VimState, VimEditorCommands, defaultVimState } from './types'
import { handleKeyDown } from './keyHandler'
import { findAllMatches } from './utils'

export const vimPluginKey = new PluginKey<VimState>('vimMode')

export function createVimPlugin(commands: VimEditorCommands): Plugin<VimState> {
  const vimState = defaultVimState()

  return new Plugin<VimState>({
    key: vimPluginKey,

    state: {
      init(): VimState {
        return vimState
      },
      apply(tr: Transaction, value: VimState): VimState {
        // Map mark positions through document changes
        if (tr.docChanged && Object.keys(value.marks).length > 0) {
          const newMarks: Record<string, number> = {}
          for (const [key, pos] of Object.entries(value.marks)) {
            newMarks[key] = tr.mapping.map(pos)
          }
          value.marks = newMarks
        }
        return value
      },
    },

    view(editorView) {
      // Create search bar element
      const searchBar = document.createElement('div')
      searchBar.className = 'vim-search-bar'
      searchBar.style.display = 'none'

      const searchPrefix = document.createElement('span')
      searchPrefix.className = 'vim-search-prefix'
      searchPrefix.textContent = '/'
      searchBar.appendChild(searchPrefix)

      const searchInput = document.createElement('span')
      searchInput.className = 'vim-search-input'
      searchBar.appendChild(searchInput)

      const searchCursor = document.createElement('span')
      searchCursor.className = 'vim-search-cursor'
      searchCursor.textContent = '\u2588'
      searchBar.appendChild(searchCursor)

      // Insert after the editor
      editorView.dom.parentNode?.insertBefore(
        searchBar,
        editorView.dom.nextSibling,
      )

      return {
        update() {
          if (vimState.searchActive) {
            searchBar.style.display = 'flex'
            searchInput.textContent = vimState.searchQuery
          } else {
            searchBar.style.display = 'none'
          }
        },
        destroy() {
          searchBar.remove()
        },
      }
    },

    props: {
      handleDOMEvents: {
        mouseup: (view: EditorView) => {
          setTimeout(() => {
            const { from, to } = view.state.selection
            if (from !== to && vimState.mode === 'normal') {
              // Native selection in normal mode → enter visual mode
              vimState.mode = 'visual'
              vimState.visualAnchor = from
              vimState.visualHead = to > from ? to - 1 : from
              view.dispatch(view.state.tr)
            } else if (
              from === to &&
              (vimState.mode === 'visual' || vimState.mode === 'visual-line')
            ) {
              // Click (empty selection) in visual mode → exit to normal
              vimState.mode = 'normal'
              vimState.visualAnchor = null
              vimState.visualHead = null
              view.dispatch(view.state.tr)
            }
          }, 0)
          return false
        },
      },

      handleKeyDown(view: any, event: any) {
        return handleKeyDown(view, event, vimState, commands)
      },

      handleTextInput(
        _view: EditorView,
        _from: number,
        _to: number,
        text: string,
      ) {
        if (vimState.isTrackingInsert) {
          vimState.insertTextBuffer += text
        }
        return false
      },

      attributes(_state: any) {
        return {
          'data-vim-mode': vimState.mode,
          class: `vim-mode vim-mode-${vimState.mode}`,
        }
      },

      decorations(state: EditorState) {
        const decorations: Decoration[] = []
        const cursorPos = vimState.visualHead ?? state.selection.$head.pos

        if (vimState.mode !== 'insert' && vimState.mode !== 'replace') {
          // Block cursor
          try {
            let $pos = state.doc.resolve(cursorPos)
            // If at document root (depth 0), find nearest textblock
            if ($pos.depth === 0) {
              const sel =
                Selection.findFrom($pos, 1, true) ||
                Selection.findFrom($pos, -1, true)
              if (sel) $pos = sel.$from
            }
            if ($pos.depth > 0) {
              const lineEnd = $pos.end($pos.depth)
              if (cursorPos < lineEnd) {
                decorations.push(
                  Decoration.inline(cursorPos, cursorPos + 1, {
                    class: 'vim-block-cursor',
                  }),
                )
              } else {
                decorations.push(
                  Decoration.widget(
                    cursorPos,
                    () => {
                      const span = document.createElement('span')
                      span.className = 'vim-block-cursor-eol'
                      span.textContent = '\u00a0'
                      return span
                    },
                    { side: 0 },
                  ),
                )
              }
            }
          } catch {
            // Position invalid, skip cursor decoration
          }

          // Visual selection highlight via decoration (more reliable than ::selection)
          if (
            (vimState.mode === 'visual' || vimState.mode === 'visual-line') &&
            state.selection.from < state.selection.to
          ) {
            decorations.push(
              Decoration.inline(state.selection.from, state.selection.to, {
                class: 'vim-visual-selection',
              }),
            )

            // Inline decorations won't visibly highlight empty textblocks, so
            // add a block-level decoration for selected empty lines.
            state.doc.nodesBetween(
              state.selection.from,
              state.selection.to,
              (node, pos) => {
                if (
                  node.isTextblock &&
                  node.content.size === 0 &&
                  state.selection.from <= pos + node.nodeSize &&
                  state.selection.to >= pos
                ) {
                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: 'vim-visual-selection-line',
                    }),
                  )
                }
              },
            )
          }
        }

        // Search match highlights (visible in all modes)
        const activeSearchTerm = vimState.searchActive
          ? vimState.searchQuery
          : vimState.searchHighlightsVisible
            ? vimState.searchTerm
            : ''
        if (activeSearchTerm) {
          const wholeWord = !vimState.searchActive && vimState.searchWholeWord
          const matches = findAllMatches(state, activeSearchTerm, wholeWord)
          for (const matchPos of matches) {
            const end = matchPos + activeSearchTerm.length
            if (end <= state.doc.content.size) {
              const isCurrent = matchPos <= cursorPos && cursorPos < end
              decorations.push(
                Decoration.inline(matchPos, end, {
                  class: isCurrent
                    ? 'vim-search-match-current'
                    : 'vim-search-match',
                }),
              )
            }
          }
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
export function getVimStateFromEditorState(
  state: EditorState,
): VimState | null {
  return vimPluginKey.getState(state) ?? null
}
