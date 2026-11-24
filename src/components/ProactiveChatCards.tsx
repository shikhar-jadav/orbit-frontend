import React, { useState } from 'react'
import { Icon } from './Icon'
import type { ProactiveCardData } from './types'
import { formatHumanSchedule } from './proactiveRoutineUtils'
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
