# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.3.1 - 2026-03-28

### Fixed

- Rich yank/paste now preserves heading, list, and inline formatting structure more reliably.
- Ordered list items copied linewise no longer paste back as unordered list items.
- External markdown clipboard text is now parsed into editor structure (for example `###` headings and `1.` lists) instead of always pasting as literal text.
- Markdown parsing now runs in both `clipboard.read()` and `readText()` fallback paths.

### Changed

- Clipboard writes now include richer multi-format payloads (`text/html`, `text/markdown`, `text/x-markdown`, custom ProseMirror payload).
- `text/plain` output now prefers markdown syntax when structured content is present, improving interoperability with markdown-aware destinations.
- Paste can recover rich structure from internal clipboard memory when browsers only expose plain text on clipboard read.

## 0.3.0 - 2026-03-27

### Added

- `r` single-character replace command with count support (for example `3rx`).
- `R` replace mode for continuous character replacement until `Esc`/`Ctrl-c`.

### Changed

- Clipboard behavior now uses the system clipboard (`navigator.clipboard`) for yank/delete/change/cut and paste commands.
- `p`/`P` now paste from system clipboard text, including linewise paste when clipboard text ends with a trailing newline.

## 0.2.0 - 2026-03-23

### Fixed

- Visual and visual-line selection highlighting now includes selected empty lines.
- Switching from visual-line mode to visual mode now updates the UI immediately.
- Vim-style search is now case-insensitive for `/`, `n`, `N`, and search highlights.
