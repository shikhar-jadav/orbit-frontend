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
  if (!parts || parts.length <= 1) return parts || []

  const result: MessagePart[] = []
  for (let i = 0; i < parts.length; i++) {
    const originalPart = parts[i]
    const part: MessagePart =
      originalPart.type === 'text'
        ? { ...originalPart, text: collapseRepeatedResponse(originalPart.text) }
        : originalPart

    if (part.type === 'tool' && part.tool.status === 'done' && part.tool.output) {
      const signature = JSON.stringify([
        part.tool.name,
        part.tool.args || {},
        normalizeWhitespace(part.tool.output),
      ])
      const alreadyRendered = result.some((existing) => {
        if (existing.type !== 'tool' || existing.tool.status !== 'done' || !existing.tool.output) return false
        return JSON.stringify([
          existing.tool.name,
          existing.tool.args || {},
          normalizeWhitespace(existing.tool.output),
        ]) === signature
      })
      if (alreadyRendered) continue
    }

    if (part.type === 'text') {
      const text = normalizeWhitespace(part.text || '')
      if (!text) continue

      let isDuplicate = false
      for (let j = i + 1; j < parts.length; j++) {
        const nextPart = parts[j]
        if (nextPart.type === 'text') {
          const nextText = normalizeWhitespace(nextPart.text || '')
          if (nextText && (nextText === text || nextText.startsWith(text))) {
            isDuplicate = true
            break
          }
        }
      }
      if (isDuplicate) {
        continue
      }
    }
    result.push(part)
  }

  return result
}
