export const AVATAR_SWATCHES = [
  '#673ab7',
  '#20b8cd',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#6366f1',
  '#ef4444',
] as const

export function computeInitials(name?: string | null): string {
  const cleaned = (name || '').trim()
  if (!cleaned) return 'U'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  return parts[0].slice(0, 2).toUpperCase()
}

export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3
  label: string
  tone: '' | 'weak' | 'fair' | 'strong'
} {
  if (!password) return { score: 0, label: 'Minimum 8 characters', tone: '' }
  let points = 0
  if (password.length >= 8) points += 1
  if (password.length >= 12) points += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) points += 1

  if (password.length < 8 || points <= 1) {
    return { score: 1, label: 'Weak — use at least 8 characters with letters & numbers', tone: 'weak' }
  }
  if (points <= 2) {
    return { score: 2, label: 'Fair — add symbols or length for stronger security', tone: 'fair' }
  }
  return { score: 3, label: 'Strong password', tone: 'strong' }
}

export function formatIsoDate(iso?: string | null): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export type RecentAuthAccount = {
  user_id: string
  email: string
  display_name: string
  avatar_color: string
  role: 'admin' | 'member'
  last_used_at: string
}

const RECENT_ACCOUNTS_KEY = 'orbit_recent_accounts_v1'
const MAX_RECENT_ACCOUNTS = 4

export function getRecentAccounts(): RecentAuthAccount[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ACCOUNTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is RecentAuthAccount => {
        if (!item || typeof item !== 'object') return false
        const rec = item as Record<string, unknown>
        return (
          typeof rec.email === 'string' &&
          rec.email.includes('@') &&
          typeof rec.display_name === 'string' &&
          typeof rec.avatar_color === 'string'
        )
      })
      .slice(0, MAX_RECENT_ACCOUNTS)
  } catch {
    return []
  }
}

export function rememberRecentAccount(user: {
  user_id: string
  email: string
  display_name: string
  avatar_color: string
  role: 'admin' | 'member'
}): RecentAuthAccount[] {
  const normalizedEmail = user.email.trim().toLowerCase()
  const entry: RecentAuthAccount = {
    user_id: user.user_id,
    email: normalizedEmail,
    display_name: user.display_name,
    avatar_color: user.avatar_color || AVATAR_SWATCHES[0],
    role: user.role,
    last_used_at: new Date().toISOString(),
  }
  const existing = getRecentAccounts().filter((acc) => acc.email !== normalizedEmail)
  const next = [entry, ...existing].slice(0, MAX_RECENT_ACCOUNTS)
  try {
    window.localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
  return next
}

export function forgetRecentAccount(email: string): RecentAuthAccount[] {
  const normalized = email.trim().toLowerCase()
  const next = getRecentAccounts().filter((acc) => acc.email !== normalized)
  try {
    window.localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage errors
  }
  return next
}

export function clearRecentAccounts(): void {
  try {
    window.localStorage.removeItem(RECENT_ACCOUNTS_KEY)
  } catch {
    // Ignore storage errors
  }
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
