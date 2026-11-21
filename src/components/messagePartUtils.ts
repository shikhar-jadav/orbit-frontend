import type { MessagePart } from './types'

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * Returns only the trailing portion of `content` that is not already represented in `parts`.
 * Handles separator whitespace (such as `\n\n`) inserted between text parts when `content`
 * is finalized or persisted so interleaved `[text, tool, text]` responses never render twice.
 */
export function extractRemainingMessageText(
  content: string | undefined,
  parts: MessagePart[] | undefined,
): string {
  const full = (content || '').trim()
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
