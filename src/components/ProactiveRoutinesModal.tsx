import React, { useCallback, useState, useEffect, type FormEvent } from 'react'
import { Icon } from './Icon'
import { ModernDialog } from './ModernDialog'
import { formatHumanSchedule } from './ProactiveChatCards'
import './ProactiveRoutinesModal.css'

export type Routine = {
  id: string
  name: string
  action_prompt: string
  trigger_type: string
  schedule_expression?: string
  schedule_display?: string
  trigger_definition?: {
    source?: string
    event_type?: string
    event_source?: string
    when?: string
    repository?: string
    team_id?: string
    email_address?: string
    filters?: Record<string, unknown>
  }
  event_source?: string
  event_type?: string
  webhook_token?: string
  webhook_secret?: string
  one_shot: boolean
  next_run_at?: string
  last_run_at?: string
  enabled: boolean
  created_at: string
}

type IntegrationStatus = {
  configured: boolean
  signing_configured?: boolean
  pubsub_configured?: boolean
  events_url?: string | null
  public_url_configured?: boolean
  accounts: Array<{
    provider: string
    provider_account_id: string
    account_name: string
    scopes: string[]
  }>
}

export type ProactiveNotification = {
  id: string
  routine_id?: string
  run_id?: string
  title: string
  message: string
  notification_type: string
  is_read: boolean
  created_at: string
  data?: Record<string, unknown>
}

type RoutineEvent = {
  id: string
  source: string
  event_type: string
  received_at: string
  processing_status: string
  payload: Record<string, unknown>
  match_reason?: Record<string, unknown> | string | null
  routine_status: string
  routine_error?: string | null
}

type RoutineRun = {
  id: string
  status: string
  trigger_source: string
  created_at: string
  started_at?: string | null
  completed_at?: string | null
  duration_ms?: number | null
  result_summary?: string | null
  error?: string | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  unreadCount: number
  onClearUnread: () => void
  soundEnabled: boolean
  onToggleSound: () => void
}

export const ProactiveRoutinesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  unreadCount,
  onClearUnread,
  soundEnabled,
  onToggleSound,
}) => {
  const [tab, setTab] = useState<'routines' | 'create' | 'history' | 'detail'>('routines')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [notifications, setNotifications] = useState<ProactiveNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )

  const [routineRequest, setRoutineRequest] = useState('')
  const [creatingRoutine, setCreatingRoutine] = useState(false)
  const [formError, setFormError] = useState('')
  const [createMode, setCreateMode] = useState<'schedule' | 'event'>('schedule')
  const [eventRequest, setEventRequest] = useState('')
  const [integrationStatus, setIntegrationStatus] = useState<{
    public_url_configured: boolean
    webhook_payload_limit_configured: boolean
    token_storage_configured: boolean
    github: IntegrationStatus
    slack: IntegrationStatus
    gmail: IntegrationStatus
  } | null>(null)
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [editingRoutine, setEditingRoutine] = useState(false)
  const [editName, setEditName] = useState('')
  const [editInstruction, setEditInstruction] = useState('')
  const [editWhen, setEditWhen] = useState('')
  const [editEventType, setEditEventType] = useState('')
  const [editFilterField, setEditFilterField] = useState('')
  const [editFilterOperator, setEditFilterOperator] = useState<'equals' | 'contains'>('equals')
  const [editFilterValue, setEditFilterValue] = useState('')
  const [routineActionStatus, setRoutineActionStatus] = useState('')
  const [testingRoutine, setTestingRoutine] = useState(false)
  const [routineEvents, setRoutineEvents] = useState<RoutineEvent[]>([])
  const [routineRuns, setRoutineRuns] = useState<RoutineRun[]>([])

  const loadRoutines = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/routines')
      if (res.ok) {
        const data = await res.json()
        setRoutines(data.routines || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
      }
    } catch {
      // ignore
    }
  }, [])

  const loadIntegrationStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/status')
      if (!res.ok) throw new Error('Could not load connected event integrations.')
      setIntegrationStatus((await res.json()) as {
        public_url_configured: boolean
        webhook_payload_limit_configured: boolean
        token_storage_configured: boolean
        github: IntegrationStatus
        slack: IntegrationStatus
        gmail: IntegrationStatus
      })
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not load event integrations.')
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      // Fetch persisted server state when the modal opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadRoutines()
      void loadNotifications()
      void loadIntegrationStatus()
    }
  }, [isOpen, loadRoutines, loadNotifications, loadIntegrationStatus])

  useEffect(() => {
    const handleIntegrationMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (
        event.data?.type === 'orbit_integration_connected' ||
        event.data?.type === 'orbit_integration_error'
      ) {
        if (event.data.type === 'orbit_integration_error') {
          setFormError(String(event.data.message || 'The integration could not be connected.'))
        } else {
          setFormError('')
          void loadIntegrationStatus()
        }
      }
    }
    window.addEventListener('message', handleIntegrationMessage)
    return () => window.removeEventListener('message', handleIntegrationMessage)
  }, [loadIntegrationStatus])

  const handleTogglePause = async (routine: Routine) => {
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      })
      if (res.ok) {
        const updated = (await res.json()) as Routine
        setSelectedRoutine(updated)
        void loadRoutines()
      } else {
        const data = await res.json()
        setRoutineActionStatus(data.detail || 'Could not update routine.')
      }
    } catch (err: unknown) {
      setRoutineActionStatus(err instanceof Error ? err.message : 'Could not update routine.')
    }
  }

  const handleSnooze = async (routineId: string, minutes: number = 10) => {
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(routineId)}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      if (res.ok) {
        loadRoutines()
      }
    } catch {
      // ignore
    }
  }

  const handleDelete = async (routineId: string) => {
    try {
      const res = await fetch(`/api/routines/${routineId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setRoutines((prev) => prev.filter((r) => r.id !== routineId))
        if (selectedRoutine?.id === routineId) {
          setSelectedRoutine(null)
          setTab('routines')
        }
      } else {
        const data = await res.json()
        setRoutineActionStatus(data.detail || 'Could not delete routine.')
      }
    } catch (err: unknown) {
      setRoutineActionStatus(err instanceof Error ? err.message : 'Could not delete routine.')
    }
  }

  const handleRunNow = async (routineId: string) => {
    setTestingRoutine(true)
    setRoutineActionStatus('Test is running. It will do real work using the routine instructions.')
    try {
      const res = await fetch(`/api/routines/${routineId}/run`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'The routine test failed.')
      setRoutineActionStatus(
        data.status === 'completed'
          ? 'Test completed. The latest run is shown below.'
          : data.error || 'The routine test did not complete.',
      )
      const runsResponse = await fetch('/api/routines/' + encodeURIComponent(routineId) + '/runs?limit=20')
      if (runsResponse.ok) {
        const runsData = await runsResponse.json()
        setRoutineRuns((runsData.runs || []) as RoutineRun[])
      }
      void loadNotifications()
    } catch (err: unknown) {
      setRoutineActionStatus(err instanceof Error ? err.message : 'The routine test failed.')
    } finally {
      setTestingRoutine(false)
    }
  }

  const handleCopyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setRoutineActionStatus(`${label} copied.`)
    } catch {
      setRoutineActionStatus(`Could not copy ${label.toLowerCase()}.`)
    }
  }

  const handleOpenRoutine = async (routineId: string) => {
    setRoutineActionStatus('')
    try {
      const [res, eventResponse, runsResponse] = await Promise.all([
        fetch(`/api/routines/${encodeURIComponent(routineId)}`),
        fetch(`/api/routines/${encodeURIComponent(routineId)}/events`),
        fetch(`/api/routines/${encodeURIComponent(routineId)}/runs?limit=20`),
      ])
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not open routine.')
      const eventData = await eventResponse.json()
      if (!eventResponse.ok) throw new Error(eventData.detail || 'Could not load event history.')
      const runsData = await runsResponse.json()
      if (!runsResponse.ok) throw new Error(runsData.detail || 'Could not load run history.')
      setSelectedRoutine(data.routine as Routine)
      setRoutineEvents((eventData.events || []) as RoutineEvent[])
      setRoutineRuns((runsData.runs || []) as RoutineRun[])
      setWebhookUrl(data.webhook_url || '')
      setEditName(data.routine.name)
      setEditInstruction(data.routine.action_prompt)
      const trigger = data.routine.trigger_definition || {}
      setEditWhen(trigger.when || '')
      setEditEventType(trigger.event_type || data.routine.event_type || '')
      const filters = trigger.filters || {}
      const filterConditions = Array.isArray(filters.conditions)
        ? (filters.conditions as Record<string, unknown>[])
        : [filters as Record<string, unknown>]
      const firstFilter =
        filterConditions.find(
          (condition) =>
            condition.field !== 'payload.repository' &&
            condition.field !== 'payload.channel_id',
        ) || {}
      setEditFilterField(typeof firstFilter.field === 'string' ? firstFilter.field : '')
      setEditFilterOperator(firstFilter.operator === 'contains' ? 'contains' : 'equals')
      setEditFilterValue(
        typeof firstFilter.value === 'string' || typeof firstFilter.value === 'number'
          ? String(firstFilter.value)
          : '',
      )
      setEditingRoutine(false)
      setTab('detail')
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not open routine.')
    }
  }

  const handleSaveRoutine = async () => {
    if (!selectedRoutine) return
    if (!editName.trim() || !editInstruction.trim()) {
      setRoutineActionStatus('Routine name and instruction cannot be empty.')
      return
    }
    if (
      selectedRoutine.trigger_type === 'event' &&
      (!editWhen.trim() || !editEventType.trim() || (editFilterField.trim() && !editFilterValue.trim()))
    ) {
      setRoutineActionStatus('Complete the event type, trigger description, and condition value.')
      return
    }
    try {
      const existingFilters = selectedRoutine.trigger_definition?.filters || {}
      const existingConditions = Array.isArray(existingFilters.conditions)
        ? (existingFilters.conditions as Record<string, unknown>[])
        : Object.keys(existingFilters).length
          ? [existingFilters]
          : []
      const requiredProviderConditions = existingConditions.filter(
        (condition) =>
          condition.field === 'payload.repository' ||
          condition.field === 'payload.channel_id',
      )
      const editedCondition = editFilterField.trim()
        ? {
            field: editFilterField.trim(),
            operator: editFilterOperator,
            value: editFilterValue.trim(),
          }
        : null
      const updatedConditions = [
        ...requiredProviderConditions,
        ...(editedCondition ? [editedCondition] : []),
      ]
      const updatedFilters =
        updatedConditions.length > 1
          ? { operator: 'AND', conditions: updatedConditions }
          : updatedConditions[0] || null
      const res = await fetch(`/api/routines/${encodeURIComponent(selectedRoutine.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          action_prompt: editInstruction,
          ...(selectedRoutine.trigger_type === 'event'
            ? {
                trigger_definition: {
                  ...(selectedRoutine.trigger_definition || {}),
                  source:
                    selectedRoutine.trigger_definition?.source ||
                    selectedRoutine.event_source ||
                    'webhook',
                  event_type: editEventType.trim(),
                  when: editWhen.trim(),
                  filters: updatedFilters,
                },
              }
            : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not save routine.')
      setSelectedRoutine(data as Routine)
      setEditingRoutine(false)
      setRoutineActionStatus('Routine saved.')
      void loadRoutines()
    } catch (err: unknown) {
      setRoutineActionStatus(err instanceof Error ? err.message : 'Could not save routine.')
    }
  }

  const handleCreateEvent = async (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    if (!eventRequest.trim()) {
      setFormError('Describe what should start the routine and what it should do.')
      return
    }
    setCreatingRoutine(true)
    try {
      const res = await fetch('/api/routines/events/from-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: eventRequest.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not create event routine.')
      const created = data.routine as Routine
      setRoutines((items) => [created, ...items.filter((item) => item.id !== created.id)])
      setSelectedRoutine(created)
      setWebhookUrl(data.webhook_url || '')
      setEventRequest('')
      setEditingRoutine(false)
      setRoutineActionStatus(
        created.event_source === 'github'
          ? 'Routine created. GitHub will send new matching events.'
          : created.event_source === 'slack'
            ? 'Routine created. Slack will send new matching events.'
            : created.event_source === 'gmail'
              ? 'Routine created. New matching Gmail messages will start runs.'
              : 'Routine created. Add the signed webhook to your event source.',
      )
      setRoutineEvents([])
      setRoutineRuns([])
      setTab('detail')
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not create event routine.')
    } finally {
      setCreatingRoutine(false)
    }
  }

  const handleConnectIntegration = async (provider: 'github' | 'slack' | 'gmail') => {
    setFormError('')
    try {
      const res = await fetch(`/api/integrations/${provider}/oauth/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Could not connect ${provider}.`)
      const popup = window.open(
        data.auth_url as string,
        'orbit-event-integration',
        'popup,width=600,height=720',
      )
      if (!popup) throw new Error('Allow pop-ups to connect this account.')
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : `Could not connect ${provider}.`)
    }
  }

  const handleDisconnectIntegration = async (provider: 'github' | 'slack' | 'gmail') => {
    setFormError('')
    try {
      const res = await fetch(`/api/integrations/${provider}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Could not disconnect ${provider}.`)
      await loadIntegrationStatus()
      if (provider === 'slack' || provider === 'gmail') {
        setFormError(`${provider === 'slack' ? 'Slack' : 'Gmail'} disconnected. Its event routines were paused.`)
        void loadRoutines()
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : `Could not disconnect ${provider}.`)
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!routineRequest.trim()) {
      setFormError('Describe the task and when you want it scheduled.')
      return
    }

    setCreatingRoutine(true)
    try {
      const res = await fetch('/api/routines/from-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: routineRequest.trim(),
          schedule_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        setFormError(errData.detail || 'Could not schedule routine.')
        return
      }

      setRoutineRequest('')
      setTab('routines')
      void loadRoutines()
    } catch (err: unknown) {
      setFormError(String(err))
    } finally {
      setCreatingRoutine(false)
    }
  }

  const requestDesktopPermission = async () => {
    if (typeof Notification !== 'undefined') {
      const perm = await Notification.requestPermission()
      setNotificationPermission(perm)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      onClearUnread()
      loadNotifications()
    } catch {
      // ignore
    }
  }

  return (
    <ModernDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="routines-modal-title"
      className="routines-modal-dialog"
    >
        <div className="routines-modal-header">
          <div className="routines-header-title">
            <Icon name="clock" size={20} />
            <h2 id="routines-modal-title">{tab === 'detail' ? 'Routine' : 'Routines & Reminders'}</h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {tab !== 'detail' ? <div className="routines-tabs">
          <button
            className={`routines-tab-btn ${tab === 'routines' ? 'active' : ''}`}
            onClick={() => setTab('routines')}
          >
            Routines ({routines.length})
          </button>
          <button
            className={`routines-tab-btn ${tab === 'create' ? 'active' : ''}`}
            onClick={() => setTab('create')}
          >
            + Create routine
          </button>
          <button
            className={`routines-tab-btn ${tab === 'history' ? 'active' : ''}`}
            onClick={() => {
              setTab('history')
              loadNotifications()
            }}
          >
            History & Alerts {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div> : (
          <div className="routine-detail-nav">
            <button className="routine-action-btn" onClick={() => setTab('routines')}>
              Back to routines
            </button>
          </div>
        )}

        <div className="routines-modal-body">
          {tab === 'routines' && (
            <div>
              {loading && <p className="empty-routines">Loading schedules...</p>}
              {!loading && routines.length === 0 && (
                <div className="empty-routines">
                  <p>No routines yet. Start with a schedule or an incoming event.</p>
                  <button
                    className="routines-submit-btn"
                    onClick={() => setTab('create')}
                    style={{ marginTop: '1rem' }}
                  >
                    + Create your first routine
                  </button>
                </div>
              )}
              {routines.map((r) => {
                const readableSchedule = formatHumanSchedule(
                  r.schedule_display || r.schedule_expression,
                  r.one_shot,
                )
                return (
                  <div className="routine-card" key={r.id}>
                    <div className="routine-card-header">
                      <span className="routine-name">{r.name}</span>
                      <div className="routine-badge-group">
                        <span
                          className={`routine-badge ${
                            r.one_shot ? 'timer' : ''
                          } ${!r.enabled ? 'paused' : ''}`}
                        >
                          {r.trigger_type === 'event'
                            ? 'Event trigger'
                            : r.one_shot ? '⏰ One-Time' : '⚡ Recurring'}
                        </span>
                        {!r.enabled && (
                          <span className="routine-badge paused">Paused</span>
                        )}
                      </div>
                    </div>

                    <div className="routine-prompt">{r.action_prompt}</div>

                    {r.trigger_type === 'event' && (
                      <div className="routine-meta">
                        <span>
                          {r.trigger_definition?.when || `When ${r.trigger_definition?.event_type || r.event_type || 'an event'} arrives`}
                        </span>
                      </div>
                    )}

                    <div className="routine-meta">
                      <span>
                        {r.trigger_type === 'event'
                          ? `⚡ ${(r.trigger_definition?.source || r.event_source || 'Event')}`
                          : `📅 ${readableSchedule || r.schedule_expression}`}
                      </span>
                      {r.next_run_at && (
                        <span>
                          ⏳ Next: {new Date(r.next_run_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    <div className="routine-actions">
                      {r.trigger_type !== 'event' && (
                        <button
                          className="routine-action-btn"
                          onClick={() => handleRunNow(r.id)}
                          title="Run immediately"
                        >
                          <Icon name="check" size={12} />
                          <span>Run Now</span>
                        </button>
                      )}
                      <button
                        className="routine-action-btn"
                        onClick={() => void handleOpenRoutine(r.id)}
                      >
                        Open routine
                      </button>
                      <button
                        className="routine-action-btn"
                        onClick={() => handleTogglePause(r)}
                      >
                        <span>{r.enabled ? 'Pause' : 'Resume'}</span>
                      </button>
                      {r.one_shot && r.enabled && (
                        <button
                          className="routine-action-btn"
                          onClick={() => handleSnooze(r.id, 10)}
                          title="Snooze 10 minutes"
                        >
                          <Icon name="clock" size={12} />
                          <span>Snooze 10m</span>
                        </button>
                      )}
                      <button
                        className="routine-action-btn delete"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Icon name="trash" size={12} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'detail' && selectedRoutine && (
            <section className="routine-detail">
              <div className="routine-detail-avatar" aria-hidden="true">
                {selectedRoutine.name.trim().charAt(0).toUpperCase() || 'R'}
              </div>
              <h3>{selectedRoutine.name}</h3>

              <div className="routine-detail-field">
                <span className="routine-detail-label">Instruction</span>
                {editingRoutine ? (
                  <textarea
                    rows={4}
                    value={editInstruction}
                    onChange={(event) => setEditInstruction(event.target.value)}
                  />
                ) : (
                  <p>{selectedRoutine.action_prompt}</p>
                )}
              </div>

              <div className="routine-detail-field">
                <span className="routine-detail-label">When to run</span>
                {editingRoutine && selectedRoutine.trigger_type === 'event' ? (
                  <div className="routine-edit-trigger">
                    <input
                      aria-label="Event type"
                      value={editEventType}
                      onChange={(event) => setEditEventType(event.target.value)}
                      placeholder="issues.opened"
                    />
                    <textarea
                      aria-label="When to run"
                      rows={2}
                      value={editWhen}
                      onChange={(event) => setEditWhen(event.target.value)}
                      placeholder="When a new issue is opened with the bug label"
                    />
                    <div className="routine-edit-filter">
                      <input
                        aria-label="Condition field"
                        value={editFilterField}
                        onChange={(event) => setEditFilterField(event.target.value)}
                        placeholder="payload.labels"
                      />
                      <select
                        aria-label="Condition operator"
                        value={editFilterOperator}
                        onChange={(event) =>
                          setEditFilterOperator(event.target.value as 'equals' | 'contains')
                        }
                      >
                        <option value="equals">equals</option>
                        <option value="contains">contains</option>
                      </select>
                      <input
                        aria-label="Condition value"
                        value={editFilterValue}
                        onChange={(event) => setEditFilterValue(event.target.value)}
                        placeholder="bug"
                      />
                    </div>
                  </div>
                ) : (
                  <p>
                    {selectedRoutine.trigger_type === 'event'
                      ? selectedRoutine.trigger_definition?.when ||
                        `When ${selectedRoutine.trigger_definition?.event_type || selectedRoutine.event_type || 'an event'} arrives`
                      : selectedRoutine.schedule_display ||
                        selectedRoutine.schedule_expression ||
                        'Manual run'}
                  </p>
                )}
              </div>

              {selectedRoutine.trigger_type === 'event' &&
                (selectedRoutine.trigger_definition?.source ||
                  selectedRoutine.event_source ||
                  'webhook') === 'webhook' && (
                <div className="routine-webhook">
                  <h4>Webhook setup</h4>
                  <p>
                    Send a signed POST from your event source to this address. Orbit checks the
                    event type and conditions before queueing work.
                  </p>
                  <div className="routine-copy-row">
                    <code>{webhookUrl}</code>
                    <button
                      type="button"
                      className="routine-action-btn"
                      onClick={() => void handleCopyValue(webhookUrl, 'Webhook address')}
                    >
                      Copy address
                    </button>
                  </div>
                  {selectedRoutine.webhook_secret && (
                    <div className="routine-copy-row">
                      <code>{selectedRoutine.webhook_secret}</code>
                      <button
                        type="button"
                        className="routine-action-btn"
                        onClick={() =>
                          void handleCopyValue(selectedRoutine.webhook_secret || '', 'Webhook key')
                        }
                      >
                        Copy key
                      </button>
                    </div>
                  )}
                  <small>
                    Send <code>x-signature</code> as the HMAC-SHA256 hex digest of
                    <code> timestamp + "." + canonical JSON body</code>. Include
                    <code> x-timestamp</code> when signing. Timestamps expire after five minutes.
                  </small>
                  <small>Only matching event types and conditions enter the execution queue.</small>
                </div>
              )}

              {selectedRoutine.trigger_type === 'event' &&
                (selectedRoutine.trigger_definition?.source ||
                  selectedRoutine.event_source) === 'github' && (
                  <div className="routine-webhook">
                    <h4>GitHub connection</h4>
                    <p>
                      Orbit installed a webhook for{' '}
                      <strong>{selectedRoutine.trigger_definition?.repository || 'the selected repository'}</strong>.
                      Only new events matching this trigger are queued.
                    </p>
                    <small>
                      GitHub delivers signed events directly to Orbit. Disconnect GitHub only after
                      pausing or deleting routines that use this account.
                    </small>
                  </div>
                )}

              {selectedRoutine.trigger_type === 'event' &&
                (selectedRoutine.trigger_definition?.source ||
                  selectedRoutine.event_source) === 'slack' && (
                  <div className="routine-webhook">
                    <h4>Slack connection</h4>
                    <p>
                      This routine listens for <strong>{selectedRoutine.trigger_definition?.when}</strong>.
                      Only new messages or reactions in the selected channel are checked.
                    </p>
                    {integrationStatus?.slack.events_url && (
                      <div className="routine-copy-row">
                        <code>{integrationStatus.slack.events_url}</code>
                        <button
                          type="button"
                          className="routine-action-btn"
                          onClick={() =>
                            void handleCopyValue(integrationStatus.slack.events_url || '', 'Slack event URL')
                          }
                        >
                          Copy event URL
                        </button>
                      </div>
                    )}
                    <small>
                      Configure this URL in your Slack app’s Event Subscriptions and subscribe to{' '}
                      <code>app_mention</code>, <code>message.channels</code>, and{' '}
                      <code>reaction_added</code>.
                    </small>
                  </div>
                )}

              {selectedRoutine.trigger_type === 'event' &&
                (selectedRoutine.trigger_definition?.source ||
                  selectedRoutine.event_source) === 'gmail' && (
                  <div className="routine-webhook">
                    <h4>Gmail connection</h4>
                    <p>
                      This routine watches <strong>{selectedRoutine.trigger_definition?.email_address}</strong>
                      {' '}for new incoming email. Only new messages are checked; existing mail is not replayed.
                    </p>
                    <small>
                      Orbit renews the Gmail watch automatically. Disconnecting Gmail stops its watch and
                      pauses routines that use the account.
                    </small>
                  </div>
                )}

              <section className="routine-run-history" aria-label="Routine run history">
                <div className="routine-run-history-header">
                  <h4>Run history</h4>
                  <button
                    type="button"
                    className="routine-action-btn"
                    onClick={() => void handleOpenRoutine(selectedRoutine.id)}
                  >
                    Refresh
                  </button>
                </div>
                {routineRuns.length === 0 ? (
                  <p>No runs yet. Use Test or wait for the next matching event.</p>
                ) : (
                  routineRuns.map((run) => (
                    <article className="routine-run-item" key={run.id}>
                      <div className="routine-run-item-header">
                        <strong>{run.trigger_source.replaceAll('_', ' ')}</strong>
                        <span className={'routine-run-status ' + run.status.toLowerCase()}>
                          {run.status}
                        </span>
                      </div>
                      <time dateTime={run.created_at}>
                        {new Date(run.created_at).toLocaleString()}
                      </time>
                      {run.result_summary && <p>{run.result_summary}</p>}
                      {run.error && <p className="routine-run-error" role="alert">{run.error}</p>}
                      {typeof run.duration_ms === 'number' && (
                        <small>{run.duration_ms.toLocaleString()} ms</small>
                      )}
                    </article>
                  ))
                )}
              </section>

              {selectedRoutine.trigger_type === 'event' && (
                <section className="routine-event-history" aria-label="Recent matched events">
                  <h4>Recent matches</h4>
                  {routineEvents.length === 0 ? (
                    <p>No matching events yet. Wait for a matching provider event, or send a test webhook if this routine uses a custom webhook.</p>
                  ) : (
                    routineEvents.map((event) => (
                      <details key={event.id}>
                        <summary>
                          {event.event_type} · {event.routine_status}
                        </summary>
                        <p>
                          Received {new Date(event.received_at).toLocaleString()} from {event.source}
                        </p>
                        {event.routine_error && <p role="alert">{event.routine_error}</p>}
                        <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                      </details>
                    ))
                  )}
                </section>
              )}

              {routineActionStatus && (
                <p className="routine-action-status" role="status">{routineActionStatus}</p>
              )}

              <div className="routine-detail-actions">
                {editingRoutine ? (
                  <>
                    <button className="routine-action-btn" onClick={() => void handleSaveRoutine()}>
                      Save
                    </button>
                    <button className="routine-action-btn" onClick={() => setEditingRoutine(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="routine-action-btn"
                      onClick={() => void handleTogglePause(selectedRoutine)}
                    >
                      {selectedRoutine.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      className="routine-action-btn routine-test-btn"
                      disabled={testingRoutine}
                      onClick={() => void handleRunNow(selectedRoutine.id)}
                    >
                      {testingRoutine
                        ? 'Running…'
                        : selectedRoutine.trigger_type === 'event'
                          ? 'Run latest event'
                          : 'Test'}
                    </button>
                    <button
                      className="routine-action-btn"
                      onClick={() => setEditingRoutine(true)}
                    >
                      Edit
                    </button>
                    <button
                      className="routine-action-btn delete"
                      onClick={() => void handleDelete(selectedRoutine.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
              <p className="routine-test-note">
                A test does real work. Tool calls that need approval are declined in the background;
                use chat for approval-required actions.
              </p>
            </section>
          )}

          {tab === 'create' && (
            <div className="routine-create">
              <div className="routine-create-mode" role="tablist" aria-label="Routine type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={createMode === 'schedule'}
                  className={createMode === 'schedule' ? 'active' : ''}
                  onClick={() => setCreateMode('schedule')}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={createMode === 'event'}
                  className={createMode === 'event' ? 'active' : ''}
                  onClick={() => setCreateMode('event')}
                >
                  Event
                </button>
              </div>
              {formError && <div className="error-toast" role="alert">{formError}</div>}
              {createMode === 'schedule' ? (
                <form className="routines-form" onSubmit={handleCreateSubmit}>
                  <div className="routines-form-field">
                    <label htmlFor="routine-request">What would you like to schedule?</label>
                    <textarea
                      id="routine-request"
                      rows={4}
                      maxLength={1000}
                      placeholder="For example: Remind me to drink water every 2 hours on weekdays at 9 AM."
                      value={routineRequest}
                      onChange={(e) => setRoutineRequest(e.target.value)}
                      disabled={creatingRoutine}
                      required
                    />
                    <p className="schedule-help-text">
                      Say what to do and when. One-time dates, repeating intervals, weekdays, and monthly schedules are supported.
                    </p>
                  </div>
                  <button type="submit" className="routines-submit-btn" disabled={creatingRoutine}>
                    {creatingRoutine ? 'Creating schedule...' : 'Create schedule'}
                  </button>
                </form>
              ) : (
                <form className="routines-form" onSubmit={(event) => void handleCreateEvent(event)}>
                  <div className="routines-form-field">
                    <label htmlFor="event-request">What should start it, and what should it do?</label>
                    <textarea
                      id="event-request"
                      rows={5}
                      maxLength={1500}
                      placeholder='For example: When a new issue labeled "bug" opens in owner/repo, investigate it and summarize the likely cause here.'
                      value={eventRequest}
                      onChange={(e) => setEventRequest(e.target.value)}
                      disabled={creatingRoutine}
                      required
                    />
                    <p className="schedule-help-text">
                      Use plain language. Choose one channel or repository and one narrow condition.
                      Existing events won’t run; only new matching activity starts a routine.
                    </p>
                  </div>
                  <div className="routine-integration-connections">
                    <p>Event accounts are separate from regular app connectors.</p>
                    {(['gmail', 'github', 'slack'] as const).map((provider) => {
                      const status = integrationStatus?.[provider]
                      const account = status?.accounts[0]
                      const providerName =
                        provider === 'github' ? 'GitHub' : provider === 'slack' ? 'Slack' : 'Gmail'
                      return (
                        <div className="routine-copy-row" key={provider}>
                          <span>
                            {providerName}:{' '}
                            {account ? `Connected as ${account.account_name}` : 'Not connected'}
                          </span>
                          {!account && (
                            <button
                              type="button"
                              className="routine-action-btn"
                              disabled={!status?.configured || !integrationStatus?.token_storage_configured}
                              onClick={() => void handleConnectIntegration(provider)}
                              title={
                                !integrationStatus?.token_storage_configured
                                  ? 'Configure INTEGRATION_TOKEN_ENCRYPTION_KEY on the server'
                                  : status?.configured
                                  ? `Connect ${provider}`
                                  : `Configure ${provider} OAuth credentials in the server environment`
                              }
                            >
                              Connect {providerName}
                            </button>
                          )}
                          {account && (
                            <button
                              type="button"
                              className="routine-action-btn"
                              onClick={() => void handleDisconnectIntegration(provider)}
                            >
                              Disconnect
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {integrationStatus &&
                      (!integrationStatus.github.configured || !integrationStatus.slack.configured) && (
                        <small>
                          Provider connections need OAuth app credentials in the server environment.
                        </small>
                      )}
                      {integrationStatus &&
                        (!integrationStatus.gmail.configured ||
                          !integrationStatus.gmail.pubsub_configured) && (
                          <small>
                            Gmail also needs Google OAuth credentials and an authenticated Pub/Sub push
                            subscription. See the Gmail event setup in README.md.
                          </small>
                        )}
                    {integrationStatus && !integrationStatus.token_storage_configured && (
                      <small>Set INTEGRATION_TOKEN_ENCRYPTION_KEY to protect saved provider tokens.</small>
                    )}
                    {integrationStatus && !integrationStatus.webhook_payload_limit_configured && (
                      <small>Set ORBIT_PROVIDER_WEBHOOK_MAX_BYTES before receiving GitHub or Slack events.</small>
                    )}
                    {integrationStatus && !integrationStatus.public_url_configured && (
                      <small>Provider triggers also need ORBIT_PUBLIC_URL set to a public HTTPS address.</small>
                    )}
                    {integrationStatus && !integrationStatus.slack.signing_configured && (
                      <small>Slack triggers need SLACK_SIGNING_SECRET configured on the server.</small>
                    )}
                  </div>
                  <button type="submit" className="routines-submit-btn" disabled={creatingRoutine}>
                    {creatingRoutine ? 'Creating routine...' : 'Create event routine'}
                  </button>
                </form>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <button
                    className="routine-action-btn"
                    onClick={onToggleSound}
                    title="Toggle chime audio"
                  >
                    <span>🔔 Sound Chime: {soundEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                  {notificationPermission !== 'granted' && (
                    <button
                      className="routine-action-btn"
                      onClick={requestDesktopPermission}
                    >
                      Enable Desktop Alerts
                    </button>
                  )}
                </div>
                {notifications.some((n) => !n.is_read) && (
                  <button
                    className="routine-action-btn"
                    onClick={handleMarkAllRead}
                  >
                    Mark All Read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="empty-routines">No recent notification history.</p>
              ) : (
                notifications.map((n) => {
                  // Clean message for display in history
                  const cleanMsg = n.message
                    .replace(/Reminder \/ Routine '[^']+' triggered successfully\./g, '')
                    .replace(/\*Executed in \d+ms at [^*]+\*/g, '')
                    .trim() || n.title

                  return (
                    <div
                      key={n.id}
                      className={`notif-history-item ${!n.is_read ? 'unread' : ''}`}
                    >
                      <div className="notif-history-header">
                        <span>{n.title}</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                          {new Date(n.created_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="notif-history-body">{cleanMsg}</div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
    </ModernDialog>
  )
}
