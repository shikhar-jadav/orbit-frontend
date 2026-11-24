export function formatHumanSchedule(expr?: string, isOneShot?: boolean): string {
  if (!expr) return ''
  const clean = expr.trim()

  // Clean raw "UTC cron: " prefix if present
  const cronExpr = clean
    .replace(/^UTC cron:\s*/i, '')
    .replace(/^Cron\s+`([^`]+)`$/i, '$1')
    .trim()

  if (!isOneShot) {
    const intervalMatch = clean.match(
      /^every\s+(\d+)\s+(minutes?|hours?|days?)(?:\(s\))?$/i,
    )
    if (intervalMatch) {
      const count = Number(intervalMatch[1])
      const unit = intervalMatch[2].replace(/s$/i, '').toLowerCase()
      return count === 1
        ? `Every ${unit}`
        : `Every ${count} ${unit}s`
    }

    if (cronExpr === '* * * * *') return 'Every minute'
    if (cronExpr === '*/2 * * * *') return 'Every 2 minutes'
    if (cronExpr === '*/5 * * * *') return 'Every 5 minutes'
    if (cronExpr === '*/10 * * * *') return 'Every 10 minutes'
    if (cronExpr === '*/15 * * * *') return 'Every 15 minutes'
    if (cronExpr === '*/30 * * * *') return 'Every 30 minutes'
    if (cronExpr === '0 * * * *') return 'Every hour'
    if (cronExpr === '0 9 * * *') return 'Daily at 9:00 AM'
    if (cronExpr === '0 9 * * 1-5') return 'Every weekday at 9:00 AM'
    if (cronExpr === '0 10 * * 1') return 'Every Monday at 10:00 AM'
    if (cronExpr === '0 0 * * *') return 'Every midnight'
    const fields = cronExpr.split(/\s+/)
    if (
      fields.length === 5 &&
      /^\d+$/.test(fields[0]) &&
      /^\d+$/.test(fields[1]) &&
      Number(fields[0]) < 60 &&
      Number(fields[1]) < 24
    ) {
      const minute = fields[0].padStart(2, '0')
      const hour = Number(fields[1])
      const time = `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`
      if (fields[2] === '*' && fields[3] === '*' && fields[4] === '*') {
        return `Every day at ${time}`
      }
      if (
        /^\d+$/.test(fields[2]) &&
        Number(fields[2]) >= 1 &&
        Number(fields[2]) <= 31 &&
        fields[3] === '*' &&
        fields[4] === '*'
      ) {
        return `Monthly on day ${Number(fields[2])} at ${time}`
      }
      if (fields[2] === '*' && fields[3] === '*' && /^\d+(?:,\d+)*$/.test(fields[4])) {
        const days = fields[4].split(',').map(Number)
        if (days.every((day) => day >= 0 && day <= 6)) {
          if (days.length === 7) return `Every day at ${time}`
          const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          return `On ${days.map((day) => names[day]).join(', ')} at ${time}`
        }
      }
    }
    if (cronExpr.startsWith('*/')) {
      const match = cronExpr.match(/^\*\/(\d+)\s*\*\s*\*\s*\*\s*\*$/)
      if (match) return `Every ${match[1]} minutes`
    }
    return `Cron (${cronExpr})`
  }

  // One-shot ISO or string
  try {
    const d = new Date(clean)
    if (!isNaN(d.getTime())) {
      const today = new Date()
      const isToday = d.toDateString() === today.toDateString()
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (isToday) return `Today at ${timeStr}`
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`
    }
  } catch { /* Invalid date strings use the original schedule text. */ }

  return clean
}
