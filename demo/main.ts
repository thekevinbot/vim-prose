import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { VimMode, getVimMode } from '../src/extensions/vim/tiptap'
import '../src/extensions/vim/vim-mode.css'

const editor = new Editor({
  element: document.querySelector('#editor')!,
  extensions: [
    StarterKit,
    VimMode,
  ],
  content: `
    <p>Welcome to vim-prose — a Vim mode for rich-text editing.</p>
    <p>You're currently in normal mode. Press <strong>i</strong> to start typing, or try motions like <strong>w</strong>, <strong>b</strong>, <strong>j</strong>, <strong>k</strong> to move around.</p>
    <p>This editor supports operators too: try <strong>dw</strong> to delete a word, <strong>dd</strong> to delete a line, or <strong>yy</strong> then <strong>p</strong> to copy and paste a paragraph.</p>
    <p>Press <strong>v</strong> for visual selection, <strong>V</strong> for line selection, and <strong>Esc</strong> to return to normal mode. Happy editing!</p>
  `,
})

const badge = document.getElementById('mode-badge')!
const hint = document.getElementById('mode-hint')!

const modeHints: Record<string, string> = {
  normal: '',
  insert: '-- press Esc to return to normal --',
  visual: '-- visual --',
  'visual-line': '-- visual line --',
}

function updateModeDisplay() {
  const mode = getVimMode(editor)
  badge.textContent = mode === 'visual-line' ? 'V-Line' : mode.charAt(0).toUpperCase() + mode.slice(1)
  badge.className = mode
  hint.textContent = modeHints[mode] ?? ''
}

// Update mode display on every transaction (mode changes always dispatch a transaction now)
editor.on('transaction', updateModeDisplay)
updateModeDisplay()
