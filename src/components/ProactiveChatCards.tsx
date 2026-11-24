import React, { useState } from 'react'
import { Icon } from './Icon'
import type { ProactiveCardData } from './types'
import './ProactiveChatCards.css'

export interface RoutineSetupCardProps {
  toolOutput: string
  toolArgs?: Record<string, unknown>
  onOpenModal?: () => void
}

function parseRoutineToolOutput(output: string, args?: Record<string, unknown>) {
  if (!output || typeof output !== 'string') return null

  const isReminder = output.includes('Reminder scheduled:') || args?.action === 'schedule'
  const isRecurring = output.includes('Recurring routine created:') || args?.action === 'create'

  if (!isReminder && !isRecurring) return null

  // Extract Name
  let name = ''
  const nameMatch = output.match(/(?:Reminder scheduled|Recurring routine created):\s*['"]?([^'"\n]+)['"]?/)
  if (nameMatch) {
    name = nameMatch[1].trim()
  } else if (args?.name && typeof args.name === 'string') {
    name = args.name.trim()
  }

  // Extract ID
  let id = ''
  const idMatch = output.match(/- ID:\s*`?([a-zA-Z0-9_]+)`?/)
  if (idMatch) {
    id = idMatch[1].trim()
  }

  // Extract Schedule / Time
  let schedule = ''
  const timeMatch = output.match(/- Time:\s*([^\n]+)/)
  const cronMatch = output.match(/- UTC cron:\s*`?([^\n`]+)`?/)
  const nextMatch = output.match(/- Next execution:\s*([^\n]+)/)

  if (timeMatch) {
    schedule = timeMatch[1].trim()
  } else if (cronMatch) {
    schedule = cronMatch[1].trim()
  } else if (args?.run_at && typeof args.run_at === 'string') {
    schedule = args.run_at
  } else if (args?.cron_expression && typeof args.cron_expression === 'string') {
    schedule = args.cron_expression
  }

  const nextExecution = nextMatch ? nextMatch[1].trim() : ''

  // Extract Action Prompt
  let actionPrompt = ''
  const actionMatch = output.match(/- Action:\s*([^\n]+)/)
  if (actionMatch) {
    actionPrompt = actionMatch[1].trim()
  } else if (args?.action_prompt && typeof args.action_prompt === 'string') {
    actionPrompt = args.action_prompt.trim()
  }

  return {
    id,
    name: name || 'Scheduled Routine',
    isOneShot: isReminder,
    schedule,
    nextExecution,
    actionPrompt,
  }
}

function formatHumanSchedule(expr?: string, isOneShot?: boolean): string {
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

export const RoutineSetupCard: React.FC<RoutineSetupCardProps> = ({
  toolOutput,
  toolArgs,
  onOpenModal,
}) => {
  const parsed = parseRoutineToolOutput(toolOutput, toolArgs)
  const [status, setStatus] = useState<'active' | 'paused' | 'running' | 'deleted'>('active')
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!parsed) {
    return null
  }

  const { id, name, isOneShot, schedule, actionPrompt } = parsed
  const readableSchedule = formatHumanSchedule(schedule, isOneShot)

  const handleTogglePause = async () => {
    if (!id) return
    setLoading(true)
    const newEnabled = status === 'paused'
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      })
      if (res.ok) {
        setStatus(newEnabled ? 'active' : 'paused')
        setActionFeedback(newEnabled ? 'Resumed' : 'Paused')
        setTimeout(() => setActionFeedback(null), 2500)
      }
    } catch {
      setActionFeedback('Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRunNow = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(id)}/run`, {
        method: 'POST',
      })
      if (res.ok) {
        setActionFeedback('Triggered')
        setTimeout(() => setActionFeedback(null), 2500)
      }
    } catch {
      setActionFeedback('Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    if (!window.confirm(`Delete routine "${name}"?`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setStatus('deleted')
        setActionFeedback('Deleted')
      }
    } catch {
      setActionFeedback('Failed')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'deleted') {
    return (
      <div className="routine-setup-card deleted">
        <Icon name="trash" size={14} />
        <span>Routine <strong>{name}</strong> deleted.</span>
      </div>
    )
  }

  return (
    <div className={`routine-setup-card ${isOneShot ? 'is-reminder' : 'is-routine'}`}>
      <div className="routine-setup-header">
        <div className="routine-setup-title-box">
          <span className="routine-setup-icon">
            <Icon name={isOneShot ? 'clock' : 'zap'} size={16} />
          </span>
          <span className="routine-setup-name">{name}</span>
        </div>
        <div className="routine-setup-badges">
          <span className={`routine-setup-badge status-${status}`}>
            {status === 'active' ? '● Active' : '⏸ Paused'}
          </span>
          <span className="routine-setup-badge type-badge">
            {isOneShot ? 'One-Time' : 'Recurring'}
          </span>
        </div>
      </div>

      <div className="routine-setup-body">
        {actionPrompt && (
          <div className="routine-setup-prompt">
            "{actionPrompt}"
          </div>
        )}

        <div className="routine-setup-meta-grid">
          <div className="routine-setup-meta-item">
            <span className="meta-label">Schedule:</span>
            <span className="meta-val">{readableSchedule || schedule || 'Configured'}</span>
          </div>
          {id && (
            <div className="routine-setup-meta-item">
              <span className="meta-label">ID:</span>
              <span className="meta-val mono-val">{id}</span>
            </div>
          )}
        </div>
      </div>

      <div className="routine-setup-footer">
        <div className="routine-setup-actions">
          {id && (
            <>
              <button
                className="routine-card-btn"
                onClick={handleTogglePause}
                disabled={loading}
                title={status === 'active' ? 'Pause routine' : 'Resume routine'}
              >
                <Icon name={status === 'active' ? 'chevronRight' : 'check'} size={12} />
                <span>{status === 'active' ? 'Pause' : 'Resume'}</span>
              </button>
              <button
                className="routine-card-btn"
                onClick={handleRunNow}
                disabled={loading}
                title="Run routine now"
              >
                <Icon name="sparkles" size={12} />
                <span>Run Now</span>
              </button>
              <button
                className="routine-card-btn danger"
                onClick={handleDelete}
                disabled={loading}
                title="Delete this schedule"
              >
                <Icon name="trash" size={12} />
                <span>Delete</span>
              </button>
            </>
          )}
          {onOpenModal && (
            <button
              className="routine-card-btn secondary"
              onClick={onOpenModal}
              title="Open full routines manager"
            >
              <span>Manage All</span>
            </button>
          )}
        </div>
        {actionFeedback && (
          <span className="routine-card-feedback">{actionFeedback}</span>
        )}
      </div>
    </div>
  )
}

export interface ProactiveAlertCardProps {
  card: ProactiveCardData
  onOpenModal?: () => void
}

export const ProactiveAlertCard: React.FC<ProactiveAlertCardProps> = ({
  card,
  onOpenModal,
}) => {
  const [snoozed, setSnoozed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isReminder = card.one_shot ?? (card.trigger_type === 'timer')

  const handleSnooze = async (minutes: number = 10) => {
    if (!card.routine_id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(card.routine_id)}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      if (res.ok) {
        setSnoozed(true)
        setFeedback(`Snoozed for ${minutes}m`)
        setTimeout(() => setFeedback(null), 3000)
      } else {
        const data = await res.json().catch(() => ({}))
        setFeedback(typeof data.detail === 'string' ? data.detail : 'Snooze failed')
      }
    } catch {
      setFeedback('Snooze failed')
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async () => {
    if (!card.routine_id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(card.routine_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      if (res.ok) {
        setPaused(true)
        setFeedback('Routine paused')
        setTimeout(() => setFeedback(null), 3000)
      } else {
        const data = await res.json().catch(() => ({}))
        setFeedback(typeof data.detail === 'string' ? data.detail : 'Pause failed')
      }
    } catch {
      setFeedback('Pause failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`proactive-alert-card ${isReminder ? 'is-reminder' : 'is-routine'}`}>
      <div className="proactive-alert-header">
        <div className="proactive-alert-title-box">
          <span className="proactive-alert-icon" aria-hidden="true">
            <Icon name={isReminder ? 'clock' : 'zap'} size={16} />
          </span>
          <span className="proactive-alert-name">{card.routine_name}</span>
          <span className={'proactive-alert-pill' + (paused ? ' paused' : '')}>
            {paused ? 'Paused' : isReminder ? 'Reminder' : 'Routine'}
          </span>
        </div>
        {card.timestamp && (
          <span className="proactive-alert-time">{card.timestamp}</span>
        )}
      </div>

      <div className="proactive-alert-body">
        {card.content}
      </div>

      <div className="proactive-alert-footer">
        <div className="proactive-alert-actions">
          {card.routine_id && isReminder && !snoozed && (
            <button
              className="proactive-alert-btn"
              onClick={() => handleSnooze(10)}
              disabled={loading}
              title="Remind me again in 10 minutes"
            >
              <Icon name="clock" size={12} />
              <span>Snooze 10m</span>
            </button>
          )}
          {card.routine_id && !isReminder && !paused && (
            <button
              className="proactive-alert-btn secondary"
              onClick={handlePause}
              disabled={loading}
              title="Pause this routine schedule"
            >
              <span>Pause</span>
            </button>
          )}
          {onOpenModal && (
            <button
              className="proactive-alert-btn subtle"
              onClick={onOpenModal}
              title="Open Routines & Reminders"
            >
              <span>Manage</span>
            </button>
          )}
        </div>
        {feedback && (
          <span className="proactive-alert-feedback">{feedback}</span>
        )}
      </div>
    </div>
  )
}
