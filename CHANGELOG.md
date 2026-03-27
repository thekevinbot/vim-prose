# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
