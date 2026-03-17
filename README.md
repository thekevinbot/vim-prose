# vim-prose

A Vim keybinding extension for [Tiptap v3](https://tiptap.dev) / ProseMirror. Implements a useful subset of Vim modal editing directly in a rich-text editor, treating each paragraph node as a Vim "line".

Built from scratch against the ProseMirror API — no third-party vim emulation library.

---

## Installation

```bash
npm install vim-prose
```

Peer dependencies: `prosemirror-state`, `prosemirror-view`, `prosemirror-model`

---

## Usage

### With Tiptap v3

```typescript
import { VimMode } from 'vim-prose/tiptap'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

const editor = new Editor({
  extensions: [StarterKit, VimMode],
})
```

Read the current mode (e.g. to render a status bar):

```typescript
import { getVimMode } from 'vim-prose/tiptap'

const mode = getVimMode(editor) // 'normal' | 'insert' | 'visual' | 'visual-line'
```

### With ProseMirror directly

```typescript
import { createVimPlugin } from 'vim-prose'
import { EditorState } from 'prosemirror-state'
import { history, undo, redo } from 'prosemirror-history'

const vimPlugin = createVimPlugin({
  undo: () => undo(view.state, view.dispatch),
  redo: () => redo(view.state, view.dispatch),
})

const state = EditorState.create({
  plugins: [history(), vimPlugin],
})
```

### Optional CSS

Import the bundled CSS for basic mode-indicator styling:

```css
@import 'vim-prose/src/extensions/vim/vim-mode.css';
```

---

## Supported Features

### Modes

| Mode | Description |
|------|-------------|
| `normal` | Default mode — motions, operators, commands |
| `insert` | Native editor input; only `Esc`/`Ctrl-c` is intercepted |
| `visual` | Characterwise selection |
| `visual-line` | Linewise (full paragraph) selection |

### Mode Switching

| Key | Action |
|-----|--------|
| `i` | Insert before cursor |
| `I` | Insert at first non-blank character |
| `a` | Insert after cursor |
| `A` | Insert at end of line |
| `v` | Enter / toggle characterwise visual mode |
| `V` | Enter / toggle visual-line mode |
| `Esc` / `Ctrl-c` | Return to normal mode; clear pending state |

### Motions

Work in normal mode, visual mode, and operator-pending mode.

| Key | Motion |
|-----|--------|
| `h` / `l` | Left / right by character |
| `j` / `k` | Down / up by line (paragraph) |
| `0` | Start of line |
| `^` | First non-blank character of line |
| `$` | End of line |
| `gg` | Start of document |
| `G` | End of document |
| `w` | Forward by word |
| `b` | Backward by word |
| `f{char}` | Forward to next occurrence of char on line (inclusive) |
| `F{char}` | Backward to previous occurrence of char on line (inclusive) |
| `t{char}` | Forward till char (exclusive — stops one before) |
| `T{char}` | Backward till char (exclusive — stops one after) |
| `Ctrl-d` | Half-page down |
| `Ctrl-u` | Half-page up |
| `Ctrl-f` | Full-page down |
| `Ctrl-b` | Full-page up |

### Operators

Operators combine with motions and text objects in normal mode, or act on the selection in visual mode.

| Operator | Action |
|----------|--------|
| `d` | Delete |
| `y` | Yank (copy to register) |
| `c` | Change (delete + enter insert mode) |

Examples: `dw`, `y$`, `ciw`, `da(`, `df,`

### Linewise Shortcuts

| Key | Action |
|-----|--------|
| `dd` | Delete current line |
| `yy` | Yank current line |
| `cc` | Change current line (clear content, enter insert) |
| `D` | Delete to end of line |
| `Y` | Yank to end of line |
| `C` | Change to end of line |

### Text Objects

Used with operators (`d`, `y`, `c`) or in visual mode.

| Object | Inner (`i`) | Around (`a`) |
|--------|------------|--------------|
| Word | `iw` | `aw` (same as `iw`) |
| Parentheses | `i(` / `i)` | `a(` / `a)` |
| Brackets | `i[` / `i]` | `a[` / `a]` |
| Braces | `i{` / `i}` | `a{` / `a}` |
| Angle brackets | `i<` / `i>` | `a<` / `a>` |
| Single quotes | `i'` | `a'` |
| Double quotes | `i"` | `a"` |
| Backticks | `` i` `` | `` a` `` |

`i` selects content inside delimiters; `a` includes the delimiters themselves.

### Editing Commands

| Key | Action |
|-----|--------|
| `x` | Delete character under cursor |
| `p` | Paste register after cursor (linewise: inserts paragraph below) |
| `P` | Paste register before cursor (linewise: inserts paragraph above) |
| `o` | Open new line below, enter insert mode |
| `O` | Open new line above, enter insert mode |
| `J` | Join current line with the next line |

### Undo / Redo

| Key | Action |
|-----|--------|
| `u` | Undo |
| `Ctrl-r` | Redo |

### Count Prefix

All motions, operators, and find/till commands accept a numeric count prefix.

```
3w     → move forward 3 words
2dd    → delete 2 lines
3fa    → jump to the 3rd 'a' to the right
2j     → move down 2 lines
```

### Register

A single unnamed register stores the most recent yank or delete. Deletes from `d`/`x`/`c` and yanks from `y` all write to it. The register carries a linewise flag: pasting a linewise register inserts full paragraphs rather than inline text.

---

## Design Notes

- **Paragraph = line** — ProseMirror paragraph nodes are treated as Vim lines. All line-boundary motions (`0`, `^`, `$`, `j`, `k`) operate at the paragraph level.
- **No system clipboard** — the register is in-memory only; browser clipboard is not used.
- **Single ProseMirror plugin** — all state lives in a `PluginKey` inside a single `Plugin`.
- **Insert mode passthrough** — in insert mode, only `Esc`/`Ctrl-c` is intercepted; all other keys are passed through to ProseMirror's default input handling.
