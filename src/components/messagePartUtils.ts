import type { MessagePart } from './types'

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

/** Collapse an exact repeated response block while preserving its original formatting. */
export function collapseRepeatedResponse(value: string | undefined): string {
  const original = (value || '').trim()
  if (!original) return ''
  const paragraphs = original.split(/\n\s*\n/)
  if (paragraphs.length >= 2 && paragraphs.length % 2 === 0) {
    const midpoint = paragraphs.length / 2
    const first = normalizeWhitespace(paragraphs.slice(0, midpoint).join(' '))
    const second = normalizeWhitespace(paragraphs.slice(midpoint).join(' '))
    if (first && first === second) return paragraphs.slice(0, midpoint).join('\n\n').trim()
  }
  return original
}

/**
 * Returns only the trailing portion of `content` that is not already represented in `parts`.
 * Handles separator whitespace (such as `\n\n`) inserted between text parts when `content`
 * is finalized or persisted so interleaved `[text, tool, text]` responses never render twice.
 */
export function extractRemainingMessageText(
  content: string | undefined,
  parts: MessagePart[] | undefined,
): string {
  const full = collapseRepeatedResponse(content)
  if (!full) return ''
  if (!parts || parts.length === 0) return full
  if (parts.some((p) => p.type === 'proactive_card')) return ''

  const textParts = parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => (p.text || '').trim())
    .filter(Boolean)

  if (textParts.length === 0) return full

  const normalizedParts = normalizeWhitespace(textParts.join(' '))
  const normalizedFull = normalizeWhitespace(full)
  if (!normalizedFull || normalizedFull === normalizedParts || normalizedParts.includes(normalizedFull)) {
    return ''
  }

  let remaining = full
  for (const segment of textParts) {
    if (remaining.startsWith(segment)) {
      remaining = remaining.slice(segment.length).trimStart()
    } else {
      return ''
    }
  }

  return remaining.trim()
}

/**
 * Deduplicate text parts in a message where pre-tool text was repeated or
 * superseded by post-tool text, preventing doubled assistant bubbles.
 */
export function deduplicateMessageParts(parts: MessagePart[] | undefined): MessagePart[] {
  if (!parts || parts.length === 0) return parts || []

  const result: MessagePart[] = []
  const seenText = new Set<string>()
  const seenToolCalls = new Set<string>()

  for (let i = 0; i < parts.length; i++) {
    const originalPart = parts[i]

    if (originalPart.type === 'text') {
      const cleanedText = collapseRepeatedResponse(originalPart.text)
      const normalizedText = normalizeWhitespace(cleanedText)
      if (!normalizedText || seenText.has(normalizedText)) continue

      // If a later text segment already contains this whole segment, keep
      // the more complete version. Tool events may sit between the segments.
      const superseded = parts.slice(i + 1).some((nextPart) => {
        if (nextPart.type !== 'text') return false
        const nextText = normalizeWhitespace(collapseRepeatedResponse(nextPart.text))
        return nextText.length > normalizedText.length && nextText.startsWith(normalizedText)
      })
      if (superseded) continue

      seenText.add(normalizedText)
      result.push({ ...originalPart, text: cleanedText })
      continue
    }

    if (originalPart.type === 'tool' && originalPart.tool.status === 'done') {
      const tool = originalPart.tool
      const isWorkspaceWrite =
        tool.name === 'workspace_files' &&
        ['create', 'replace', 'append', 'edit', 'copy'].includes(
          String((tool.args as Record<string, unknown> | undefined)?.action || '').toLowerCase(),
        )
      const callSignature = isWorkspaceWrite
        ? JSON.stringify([tool.name, tool.args || {}])
        : ''
      const outputSignature = tool.output
        ? JSON.stringify([tool.name, tool.args || {}, normalizeWhitespace(tool.output)])
        : ''

      if (
        (callSignature && seenToolCalls.has(callSignature)) ||
        (outputSignature && seenToolCalls.has(outputSignature))
      ) {
        continue
      }
      if (callSignature) seenToolCalls.add(callSignature)
      if (outputSignature) seenToolCalls.add(outputSignature)
    }

    result.push(originalPart)
  }

  return result
}
