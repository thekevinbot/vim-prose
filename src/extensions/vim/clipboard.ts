export function isLinewiseClipboardText(text: string): boolean {
  return text.endsWith('\n')
}

function normalizeClipboardWriteText(text: string, linewise: boolean): string {
  if (!linewise) return text
  return text.endsWith('\n') ? text : `${text}\n`
}

export function getLinewiseClipboardLines(text: string): string[] {
  const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text
  return withoutTrailingNewline.length > 0
    ? withoutTrailingNewline.split('\n')
    : ['']
}

export async function writeSystemClipboardText(
  text: string,
  linewise: boolean = false,
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(
      normalizeClipboardWriteText(text, linewise),
    )
    return true
  } catch {
    return false
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
