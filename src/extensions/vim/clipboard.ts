import {
  Slice,
  Fragment,
  DOMParser as ProseMirrorDOMParser,
  DOMSerializer,
  Node as ProseMirrorNode,
  Mark as ProseMirrorMark,
} from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

const VIM_PROSE_CLIPBOARD_MIME = 'application/x-vim-prose'

interface SerializedClipboardPayload {
  linewise: boolean
  slice: ReturnType<Slice['toJSON']>
}

export interface ClipboardContent {
  text: string
  linewise: boolean
  slice: Slice | null
}

type ClipboardSerializer = (
  slice: Slice,
) => { dom: HTMLElement; text: string; slice: Slice }

let lastInternalClipboardContent: ClipboardContent | null = null
let clipboardSerializer: ClipboardSerializer | null = null

export function isLinewiseClipboardText(text: string): boolean {
  return text.endsWith('\n')
}

function normalizeClipboardWriteText(text: string, linewise: boolean): string {
  if (!linewise) return text
  return text.endsWith('\n') ? text : `${text}\n`
}

function textFromSlice(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, '\n', '\n')
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function unescapeMarkdownPunctuation(text: string): string {
  return text.replace(/\\([\\`*_[\]{}()#+.!|-])/g, '$1')
}

function renderInlineMarkdownToHTML(input: string): string {
  let html = escapeHTML(unescapeMarkdownPunctuation(input))
  const codeTokens: string[] = []

  html = html.replace(/`([^`]+)`/g, (_m, code: string) => {
    const token = `__MD_CODE_${codeTokens.length}__`
    codeTokens.push(`<code>${code}</code>`)
    return token
  })

  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, href: string) => `<a href="${href}">${label}</a>`,
  )
  html = html.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
  html = html.replace(/(\*|_)([^*_]+?)\1/g, '<em>$2</em>')

  return html.replace(/__MD_CODE_(\d+)__/g, (_m, idx: string) => {
    const token = Number.parseInt(idx, 10)
    return codeTokens[token] ?? ''
  })
}

function isBlockMarkdownLine(line: string): boolean {
  return (
    /^\s{0,3}(#{1,6})\s+\S/.test(line) ||
    /^\s{0,3}\d+[.)]\s+\S/.test(line) ||
    /^\s{0,3}[-+*]\s+\S/.test(line) ||
    /^\s{0,3}>+\s+\S/.test(line) ||
    /^\s{0,3}```/.test(line)
  )
}

function looksLikeStructuredMarkdown(text: string): boolean {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return false

  const lines = normalized.split('\n')
  const hasHeading = lines.some((line) => /^\s{0,3}(#{1,6})\s+\S/.test(line))
  const hasOrderedList = lines.some((line) => /^\s{0,3}\d+[.)]\s+\S/.test(line))
  const hasBulletList = lines.some((line) => /^\s{0,3}[-+*]\s+\S/.test(line))

  if (hasHeading || hasOrderedList || hasBulletList) return true
  return false
}

function markdownToHTML(markdown: string): string | null {
  const normalized = markdown.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return null

  const lines = normalized.split('\n')
  const blocks: string[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length)
      const content = renderInlineMarkdownToHTML(headingMatch[2].trim())
      blocks.push(`<h${level}>${content}</h${level}>`)
      i += 1
      continue
    }

    const orderedMatch = line.match(/^\s{0,3}(\d+)[.)]\s+(.*)$/)
    if (orderedMatch) {
      const start = Number.parseInt(orderedMatch[1], 10) || 1
      const items: string[] = []
      let j = i
      while (j < lines.length) {
        const itemMatch = lines[j].match(/^\s{0,3}(\d+)[.)]\s+(.*)$/)
        if (!itemMatch) break
        items.push(`<li>${renderInlineMarkdownToHTML(itemMatch[2].trim())}</li>`)
        j += 1
      }
      const startAttr = start > 1 ? ` start="${start}"` : ''
      blocks.push(`<ol${startAttr}>${items.join('')}</ol>`)
      i = j
      continue
    }

    const bulletMatch = line.match(/^\s{0,3}[-+*]\s+(.*)$/)
    if (bulletMatch) {
      const items: string[] = []
      let j = i
      while (j < lines.length) {
        const itemMatch = lines[j].match(/^\s{0,3}[-+*]\s+(.*)$/)
        if (!itemMatch) break
        items.push(`<li>${renderInlineMarkdownToHTML(itemMatch[1].trim())}</li>`)
        j += 1
      }
      blocks.push(`<ul>${items.join('')}</ul>`)
      i = j
      continue
    }

    const paragraphLines: string[] = []
    let j = i
    while (j < lines.length && lines[j].trim() && !isBlockMarkdownLine(lines[j])) {
      paragraphLines.push(lines[j].trim())
      j += 1
    }
    const paragraphText = paragraphLines.join(' ')
    if (paragraphText) {
      blocks.push(`<p>${renderInlineMarkdownToHTML(paragraphText)}</p>`)
    }
    i = j
  }

  return blocks.length > 0 ? blocks.join('') : null
}

function isListNodeName(name: string): boolean {
  return (
    name === 'bulletList' ||
    name === 'bullet_list' ||
    name === 'orderedList' ||
    name === 'ordered_list' ||
    name === 'taskList' ||
    name === 'task_list'
  )
}

function isListItemNodeName(name: string): boolean {
  return (
    name === 'listItem' ||
    name === 'list_item' ||
    name === 'taskItem' ||
    name === 'task_item'
  )
}

function escapeMarkdownText(text: string): string {
  return text.replace(/([\\`*_[\]{}()#+.!|-])/g, '\\$1')
}

function applyMarkdownMarks(text: string, marks: readonly ProseMirrorMark[]): string {
  let result = escapeMarkdownText(text)
  for (const mark of marks) {
    const name = mark.type.name
    if (name === 'code') {
      result = `\`${text.replace(/`/g, '\\`')}\``
      continue
    }
    if (name === 'bold' || name === 'strong') {
      result = `**${result}**`
      continue
    }
    if (name === 'italic' || name === 'em') {
      result = `*${result}*`
      continue
    }
    if (name === 'strike') {
      result = `~~${result}~~`
      continue
    }
    if (name === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : ''
      if (href) {
        result = `[${result}](${href})`
      }
    }
  }
  return result
}

function renderInlineMarkdown(node: ProseMirrorNode): string {
  const name = node.type.name
  if (name === 'hardBreak' || name === 'hard_break') return '  \n'
  if (node.isText) {
    return applyMarkdownMarks(node.text ?? '', node.marks)
  }
  let out = ''
  node.forEach((child) => {
    out += renderInlineMarkdown(child)
  })
  return out
}

function indentMarkdownBlock(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

function renderListItemMarkdown(
  item: ProseMirrorNode,
  depth: number,
  marker: string,
): string {
  const indent = '  '.repeat(depth)
  const continuationIndent = `${indent}  `
  const parts: string[] = []

  item.forEach((child) => {
    parts.push(renderNodeMarkdown(child, depth + 1))
  })

  const first = parts[0]?.trim() || ''
  let out = `${indent}${marker} ${first}`

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    out += `\n${indentMarkdownBlock(part, continuationIndent)}`
  }

  return out
}

function renderListMarkdown(node: ProseMirrorNode, depth: number): string {
  const ordered = node.type.name === 'orderedList' || node.type.name === 'ordered_list'
  const start = ordered && typeof node.attrs?.start === 'number' ? node.attrs.start : 1
  const lines: string[] = []
  let index = 0

  node.forEach((child) => {
    if (!isListItemNodeName(child.type.name)) {
      lines.push(renderNodeMarkdown(child, depth))
      return
    }
    const isTask = child.type.name === 'taskItem' || child.type.name === 'task_item'
    const marker = isTask
      ? child.attrs?.checked
        ? '- [x]'
        : '- [ ]'
      : ordered
        ? `${start + index}.`
        : '-'
    lines.push(renderListItemMarkdown(child, depth, marker))
    index += 1
  })

  return lines.join('\n')
}

function renderNodeMarkdown(node: ProseMirrorNode, depth: number = 0): string {
  const name = node.type.name

  if (isListNodeName(name)) {
    return renderListMarkdown(node, depth)
  }

  if (name === 'paragraph') {
    return renderInlineMarkdown(node)
  }

  if (name === 'heading') {
    const level =
      typeof node.attrs?.level === 'number'
        ? Math.max(1, Math.min(6, node.attrs.level))
        : 1
    return `${'#'.repeat(level)} ${renderInlineMarkdown(node)}`
  }

  if (name === 'blockquote') {
    const content = renderFragmentMarkdown(node.content, depth)
    return indentMarkdownBlock(content, '> ')
  }

  if (name === 'codeBlock' || name === 'code_block') {
    const language =
      typeof node.attrs?.language === 'string' ? node.attrs.language : ''
    return `\`\`\`${language}\n${node.textContent}\n\`\`\``
  }

  if (name === 'horizontalRule' || name === 'horizontal_rule') {
    return '---'
  }

  if (node.isTextblock || node.isInline) {
    return renderInlineMarkdown(node)
  }

  return renderFragmentMarkdown(node.content, depth)
}

function renderFragmentMarkdown(
  fragment: ProseMirrorNode['content'],
  depth: number = 0,
): string {
  const parts: Array<{ name: string; value: string }> = []
  fragment.forEach((child) => {
    const rendered = renderNodeMarkdown(child, depth).trimEnd()
    if (rendered) {
      parts.push({ name: child.type.name, value: rendered })
    }
  })
  if (parts.length === 0) return ''

  let out = parts[0].value
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1]
    const current = parts[i]
    const compactListJoin =
      (isListNodeName(prev.name) && isListNodeName(current.name)) ||
      (isListItemNodeName(prev.name) && isListItemNodeName(current.name)) ||
      (isListNodeName(prev.name) && isListItemNodeName(current.name)) ||
      (isListItemNodeName(prev.name) && isListNodeName(current.name))
    out += compactListJoin ? `\n${current.value}` : `\n\n${current.value}`
  }

  return out
}

function serializeSliceToMarkdown(slice: Slice): string | null {
  const markdown = renderFragmentMarkdown(slice.content).trim()
  return markdown || null
}

function isListContainerNodeName(name: string): boolean {
  return (
    name === 'orderedList' ||
    name === 'ordered_list' ||
    name === 'bulletList' ||
    name === 'bullet_list' ||
    name === 'taskList' ||
    name === 'task_list'
  )
}

function findBestLinewiseWrapper(
  state: EditorState,
  from: number,
  to: number,
  slice: Slice,
) {
  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  const maxDepth = Math.min($from.depth, $to.depth)

  // Prefer preserving the explicit list container type when linewise content
  // came from list items (ordered vs unordered/task).
  for (let depth = maxDepth; depth >= 1; depth--) {
    if ($from.node(depth) !== $to.node(depth)) continue
    const node = $from.node(depth)
    if (
      isListContainerNodeName(node.type.name) &&
      node.type.validContent(slice.content)
    ) {
      return node
    }
  }

  const sharedDepth = $from.sharedDepth(to)
  if (sharedDepth < 1) return null
  const sharedParent = $from.node(sharedDepth)
  if (!sharedParent.isBlock || !sharedParent.type.validContent(slice.content)) {
    return null
  }
  return sharedParent
}

function getClipboardSlice(
  state: EditorState,
  from: number,
  to: number,
  linewise: boolean,
): Slice {
  const slice = state.doc.slice(from, to)
  if (!linewise || (slice.openStart === 0 && slice.openEnd === 0)) {
    return slice
  }

  try {
    const parent = findBestLinewiseWrapper(state, from, to, slice)
    if (!parent) {
      return slice
    }
    const wrapped = parent.type.create(parent.attrs, slice.content, parent.marks)
    return new Slice(Fragment.from(wrapped), 0, 0)
  } catch {
    return slice
  }
}

function serializeSliceToHTML(state: EditorState, slice: Slice): string | null {
  if (typeof document === 'undefined') return null

  try {
    const serializer = DOMSerializer.fromSchema(state.schema)
    const container = document.createElement('div')
    container.appendChild(serializer.serializeFragment(slice.content))
    return container.innerHTML || null
  } catch {
    return null
  }
}

function parseHTMLToSlice(state: EditorState, html: string): Slice | null {
  if (typeof document === 'undefined') return null

  try {
    const parser = ProseMirrorDOMParser.fromSchema(state.schema)
    const container = document.createElement('div')
    container.innerHTML = html
    return parser.parseSlice(container, { preserveWhitespace: true })
  } catch {
    return null
  }
}

function parseMarkdownToSlice(state: EditorState, markdown: string): Slice | null {
  const html = markdownToHTML(markdown)
  if (!html) return null
  return parseHTMLToSlice(state, html)
}

function parseSerializedClipboardPayload(
  state: EditorState,
  raw: string,
): SerializedClipboardPayload | null {
  try {
    const parsed = JSON.parse(raw) as {
      linewise?: unknown
      slice?: unknown
    }
    if (typeof parsed.linewise !== 'boolean' || !parsed.slice) {
      return null
    }
    Slice.fromJSON(state.schema, parsed.slice)
    return {
      linewise: parsed.linewise,
      slice: parsed.slice as ReturnType<Slice['toJSON']>,
    }
  } catch {
    return null
  }
}

async function readClipboardType(
  item: ClipboardItem,
  type: string,
): Promise<string | null> {
  if (!item.types.includes(type)) return null
  try {
    const blob = await item.getType(type)
    return await blob.text()
  } catch {
    return null
  }
}

export function getLinewiseClipboardLines(text: string): string[] {
  const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text
  return withoutTrailingNewline.length > 0
    ? withoutTrailingNewline.split('\n')
    : ['']
}

export function setClipboardSerializerFromView(view: EditorView | null): void {
  if (!view) {
    clipboardSerializer = null
    return
  }
  clipboardSerializer = (slice: Slice) => view.serializeForClipboard(slice)
}

export async function writeSystemClipboardRange(
  state: EditorState,
  from: number,
  to: number,
  linewise: boolean = false,
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false
  }

  const slice = getClipboardSlice(state, from, to, linewise)
  let clipboardSlice = slice
  let text = normalizeClipboardWriteText(
    state.doc.textBetween(from, to, '\n', '\n'),
    linewise,
  )
  let html = serializeSliceToHTML(state, slice)

  if (clipboardSerializer) {
    try {
      const serialized = clipboardSerializer(slice)
      clipboardSlice = serialized.slice
      text = normalizeClipboardWriteText(serialized.text, linewise)
      html = serialized.dom.innerHTML || html
    } catch {
      // Fall back to local serializers.
    }
  }

  const markdown = serializeSliceToMarkdown(clipboardSlice)
  const markdownText = markdown
    ? normalizeClipboardWriteText(markdown, linewise)
    : null
  const shouldPreferMarkdownPlainText =
    markdownText !== null && markdownText.length > 0 && markdownText !== text
  const plainText = shouldPreferMarkdownPlainText ? markdownText : text

  lastInternalClipboardContent = {
    text: plainText,
    linewise,
    slice: clipboardSlice,
  }

  if (
    navigator.clipboard.write &&
    typeof ClipboardItem !== 'undefined' &&
    typeof Blob !== 'undefined'
  ) {
    try {
      const payload: SerializedClipboardPayload = {
        linewise,
        slice: clipboardSlice.toJSON(),
      }
      const clipboardData: Record<string, Blob> = {
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        [VIM_PROSE_CLIPBOARD_MIME]: new Blob([JSON.stringify(payload)], {
          type: VIM_PROSE_CLIPBOARD_MIME,
        }),
      }
      if (html) {
        clipboardData['text/html'] = new Blob([html], { type: 'text/html' })
      }
      if (markdownText) {
        clipboardData['text/markdown'] = new Blob([markdownText], {
          type: 'text/markdown',
        })
        clipboardData['text/x-markdown'] = new Blob([markdownText], {
          type: 'text/x-markdown',
        })
      }
      await navigator.clipboard.write([new ClipboardItem(clipboardData)])
      return true
    } catch {
      // Fall through to plain-text writeText fallback.
    }
  }

  if (!navigator.clipboard.writeText) return false
  try {
    await navigator.clipboard.writeText(plainText)
    return true
  } catch {
    return false
  }
}

export async function writeSystemClipboardText(
  text: string,
  linewise: boolean = false,
): Promise<boolean> {
  const normalizedText = normalizeClipboardWriteText(text, linewise)
  lastInternalClipboardContent = {
    text: normalizedText,
    linewise,
    slice: null,
  }

  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(normalizedText)
    return true
  } catch {
    return false
  }
}

export function getLastInternalClipboardContent(): ClipboardContent | null {
  return lastInternalClipboardContent
}

export async function readSystemClipboardContent(
  state: EditorState,
): Promise<ClipboardContent | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return null
  }

  if (navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const text = (await readClipboardType(item, 'text/plain')) ?? ''

        const serialized = await readClipboardType(item, VIM_PROSE_CLIPBOARD_MIME)
        if (serialized) {
          const payload = parseSerializedClipboardPayload(state, serialized)
          if (payload) {
            const slice = Slice.fromJSON(state.schema, payload.slice)
            const normalizedText = text || normalizeClipboardWriteText(textFromSlice(slice), payload.linewise)
            return {
              text: normalizedText,
              linewise: payload.linewise,
              slice,
            }
          }
        }

        const html = await readClipboardType(item, 'text/html')
        if (html) {
          const slice = parseHTMLToSlice(state, html)
          if (slice) {
            return {
              text,
              linewise: isLinewiseClipboardText(text),
              slice,
            }
          }
        }

        const markdown =
          (await readClipboardType(item, 'text/markdown')) ??
          (await readClipboardType(item, 'text/x-markdown'))
        if (markdown) {
          const slice = parseMarkdownToSlice(state, markdown)
          if (slice) {
            return {
              text: markdown,
              linewise:
                isLinewiseClipboardText(markdown) ||
                looksLikeStructuredMarkdown(markdown),
              slice,
            }
          }
        }

        if (text) {
          if (looksLikeStructuredMarkdown(text)) {
            const markdownSlice = parseMarkdownToSlice(state, text)
            if (markdownSlice) {
              return {
                text,
                linewise:
                  isLinewiseClipboardText(text) || looksLikeStructuredMarkdown(text),
                slice: markdownSlice,
              }
            }
          }

          return {
            text,
            linewise: isLinewiseClipboardText(text),
            slice: null,
          }
        }
      }
    } catch {
      // Fall through to readText fallback.
    }
  }

  const text = await readSystemClipboardText()
  if (text === null) return null
  if (looksLikeStructuredMarkdown(text)) {
    const markdownSlice = parseMarkdownToSlice(state, text)
    if (markdownSlice) {
      return {
        text,
        linewise: isLinewiseClipboardText(text) || looksLikeStructuredMarkdown(text),
        slice: markdownSlice,
      }
    }
  }
  return {
    text,
    linewise: isLinewiseClipboardText(text),
    slice: null,
  }
}

export async function readSystemClipboardText(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return null
  }

  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
