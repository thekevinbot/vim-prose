import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { VimMode, getVimMode, getVimStatus } from '../src/extensions/vim/tiptap'
import '../src/extensions/vim/vim-mode.css'

const editor = new Editor({
  element: document.querySelector('#editor')!,
  extensions: [StarterKit, VimMode],
  content: `
    <h2>Welcome to vim-prose</h2>
    <p>A Vim mode for rich-text editing with ProseMirror and Tiptap. Navigate through this document using vim motions — the cursor moves smoothly through headings, lists, blockquotes, and horizontal rules.</p>
    <h3>Getting Started</h3>
    <ol>
      <li>Press <strong>i</strong> to enter insert mode and start typing</li>
      <li>Press <strong>Esc</strong> to return to normal mode</li>
      <li>Use <strong>j</strong> and <strong>k</strong> to navigate between lines</li>
      <li>Try <strong>w</strong> and <strong>b</strong> to move by word</li>
    </ol>
    <blockquote><p>The best way to predict the future is to invent it. — Alan Kay</p></blockquote>
    <h3>Operators</h3>
    <p>Combine operators with motions for powerful editing:</p>
    <ul>
      <li><strong>dw</strong> — delete a word</li>
      <li><strong>dd</strong> — delete a line</li>
      <li><strong>yy</strong> then <strong>p</strong> — yank and paste a line</li>
      <li><strong>ciw</strong> — change inner word</li>
    </ul>
    <hr>
    <h3>Visual Mode</h3>
    <p>Press <strong>v</strong> for character-wise visual selection, or <strong>V</strong> for line selection. You can also click and drag to create a visual selection with the mouse.</p>
    <p>Use <strong>d</strong>, <strong>c</strong>, or <strong>y</strong> on a visual selection to delete, change, or yank the selected text.</p>
  `,
})

const badge = document.getElementById('mode-badge')!
const hint = document.getElementById('mode-hint')!

const modeHints: Record<string, string> = {
  normal: '',
  insert: '-- press Esc to return to normal --',
  replace: '-- replace mode (Esc to exit) --',
  visual: '-- visual --',
  'visual-line': '-- visual line --',
}

function updateModeDisplay() {
  const mode = getVimMode(editor)
  badge.textContent =
    mode === 'visual-line'
      ? 'V-Line'
      : mode.charAt(0).toUpperCase() + mode.slice(1)
  badge.className = mode
  const status = getVimStatus(editor)
  hint.textContent = status || (modeHints[mode] ?? '')
}

// Update mode display on every transaction (mode changes always dispatch a transaction now)
editor.on('transaction', updateModeDisplay)
updateModeDisplay()
