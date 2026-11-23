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
  pubsub_limits_configured?: boolean
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
  const [eventProvider, setEventProvider] = useState<'github' | 'slack' | 'gmail' | 'webhook'>('github')
  const [eventRoutineName, setEventRoutineName] = useState('')
  const [eventActionInstruction, setEventActionInstruction] = useState('')
  const [eventType, setEventType] = useState('issues.opened')
  const [githubRepository, setGithubRepository] = useState('')
  const [githubLabel, setGithubLabel] = useState('')
  const [slackChannel, setSlackChannel] = useState('')
  const [slackPhrase, setSlackPhrase] = useState('')
  const [slackReaction, setSlackReaction] = useState('')
  const [gmailSender, setGmailSender] = useState('')
  const [gmailSubject, setGmailSubject] = useState('')
  const [webhookEventType, setWebhookEventType] = useState('webhook.received')
  const [webhookWhen, setWebhookWhen] = useState('')
  const [webhookFilterField, setWebhookFilterField] = useState('')
  const [webhookFilterOperator, setWebhookFilterOperator] = useState<'equals' | 'contains'>('equals')
  const [webhookFilterValue, setWebhookFilterValue] = useState('')
  const [integrationStatus, setIntegrationStatus] = useState<{
    public_url?: string | null
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
  const [activityUpdatedAt, setActivityUpdatedAt] = useState<string | null>(null)
  const integrationPopupRef = React.useRef<Window | null>(null)

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
        public_url?: string | null
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
      // The OAuth callback is served by the backend domain, not the Vercel frontend domain.
      // Only accept messages from the popup opened by this component and the configured API origin.
      if (!integrationPopupRef.current || event.source !== integrationPopupRef.current) return
      const apiOrigin = integrationStatus?.public_url
      if (!apiOrigin) return
      let expectedOrigin = ''
      try {
        expectedOrigin = new URL(apiOrigin).origin
      } catch {
        return
      }
      if (event.origin !== expectedOrigin) return
      if (!['github', 'slack', 'gmail'].includes(String(event.data?.provider || ''))) return
      if (
        event.data?.type === 'orbit_integration_connected' ||
        event.data?.type === 'orbit_integration_error'
      ) {
        integrationPopupRef.current = null
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
  }, [loadIntegrationStatus, integrationStatus?.public_url])

  const loadRoutineActivity = useCallback(async (routineId: string) => {
    try {
      const [eventResponse, runsResponse] = await Promise.all([
        fetch(`/api/routines/${encodeURIComponent(routineId)}/events`),
        fetch(`/api/routines/${encodeURIComponent(routineId)}/runs?limit=20`),
      ])
      if (!eventResponse.ok || !runsResponse.ok) return
      const [eventData, runsData] = await Promise.all([
        eventResponse.json(),
        runsResponse.json(),
      ])
      setRoutineEvents((eventData.events || []) as RoutineEvent[])
      setRoutineRuns((runsData.runs || []) as RoutineRun[])
      setActivityUpdatedAt(new Date().toISOString())
    } catch {
      // Keep the last known activity visible if a background refresh fails.
    }
  }, [])

  const activeRoutineId = selectedRoutine?.id
  useEffect(() => {
    if (!isOpen || tab !== 'detail' || !activeRoutineId) return
    let stopped = false
    let requestInFlight = false
    const refreshActivity = async () => {
      if (
        stopped ||
        requestInFlight ||
        (typeof document !== 'undefined' && document.visibilityState !== 'visible')
      ) return
      requestInFlight = true
      try {
        await loadRoutineActivity(activeRoutineId)
      } finally {
        requestInFlight = false
      }
    }
    const timer = window.setInterval(() => void refreshActivity(), 4000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [isOpen, tab, activeRoutineId, loadRoutineActivity])

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
        const data = await res.json()
        setSelectedRoutine((current) =>
          current?.id === routineId ? { ...current, next_run_at: data.next_run_at } : current,
        )
        setRoutineActionStatus(`Snoozed for ${minutes} minutes.`)
        void loadRoutines()
      }
    } catch {
      setRoutineActionStatus('Could not snooze this routine.')
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
      await loadRoutineActivity(routineId)
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
      setActivityUpdatedAt(new Date().toISOString())
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
      const editableConditionIndex = existingConditions.findIndex(
        (condition) =>
          condition.field !== 'payload.repository' &&
          condition.field !== 'payload.channel_id',
      )
      // Keep every additional condition intact when editing the first visible condition.
      const preservedConditions = existingConditions.filter(
        (_condition, index) => index !== editableConditionIndex,
      )
      const editedCondition = editFilterField.trim()
        ? {
            field: editFilterField.trim(),
            operator: editFilterOperator,
            value: editFilterValue.trim(),
          }
        : null
      const updatedConditions = [
        ...preservedConditions,
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

    if (!eventRoutineName.trim() || !eventActionInstruction.trim()) {
      setFormError('Add a routine name and describe what Orbit should do.')
      return
    }

    const connectedAccount =
      eventProvider === 'webhook' ? true : Boolean(integrationStatus?.[eventProvider].accounts[0])
    if (!connectedAccount) {
      setFormError('Connect this service before creating its event trigger.')
      return
    }

    const conditions: Array<Record<string, unknown>> = []
    let resolvedEventType = eventType
    let whenToRun = ''

    if (eventProvider === 'github') {
      if (!githubRepository.trim() || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository.trim())) {
        setFormError('Enter a GitHub repository as owner/repository.')
        return
      }
      resolvedEventType = eventType
      whenToRun = `When ${eventType.replaceAll('.', ' ')} occurs in ${githubRepository.trim()}`
      if (githubLabel.trim()) {
        conditions.push({
          field: 'payload.labels',
          operator: 'contains',
          value: githubLabel.trim(),
        })
        whenToRun += ` with the label “${githubLabel.trim()}”`
      }
    } else if (eventProvider === 'slack') {
      if (!slackChannel.trim()) {
        setFormError('Enter the Slack channel Orbit should watch.')
        return
      }
      resolvedEventType = eventType
      whenToRun = `When ${eventType === 'app_mention' ? 'Orbit is mentioned' : eventType === 'reaction_added' ? 'a reaction is added' : 'a new message is posted'} in #${slackChannel.trim().replace(/^#/, '')}`
      if (eventType === 'reaction_added') {
        if (slackReaction.trim()) {
          conditions.push({
            field: 'payload.reaction',
            operator: 'equals',
            value: slackReaction.trim().replace(/^:/, '').replace(/:$/, ''),
          })
          whenToRun += ` with the :${slackReaction.trim().replace(/^:/, '').replace(/:$/, '')}: reaction`
        }
      } else if (slackPhrase.trim()) {
        conditions.push({
          field: 'payload.text',
          operator: 'contains',
          value: slackPhrase.trim(),
        })
        whenToRun += ` containing “${slackPhrase.trim()}”`
      }
    } else if (eventProvider === 'gmail') {
      resolvedEventType = 'email.received'
      const mailbox = integrationStatus?.gmail.accounts[0]?.account_name || 'the connected inbox'
      whenToRun = `When a new email arrives in ${mailbox}`
      if (gmailSender.trim()) {
        conditions.push({ field: 'payload.from', operator: 'contains', value: gmailSender.trim() })
        whenToRun += ` from ${gmailSender.trim()}`
      }
      if (gmailSubject.trim()) {
        conditions.push({ field: 'payload.subject', operator: 'contains', value: gmailSubject.trim() })
        whenToRun += ` with subject containing “${gmailSubject.trim()}”`
      }
    } else {
      resolvedEventType = webhookEventType.trim()
      if (!resolvedEventType) {
        setFormError('Enter the event name your webhook sender will send.')
        return
      }
      whenToRun = webhookWhen.trim() || `When the webhook receives ${resolvedEventType}`
      if (webhookFilterField.trim() || webhookFilterValue.trim()) {
        if (!webhookFilterField.trim().startsWith('payload.') || !webhookFilterValue.trim()) {
          setFormError('For a webhook condition, enter a payload field path and its matching value.')
          return
        }
        conditions.push({
          field: webhookFilterField.trim(),
          operator: webhookFilterOperator,
          value: webhookFilterValue.trim(),
        })
        whenToRun += ` when ${webhookFilterField.trim()} ${webhookFilterOperator} “${webhookFilterValue.trim()}”`
      }
    }

    setCreatingRoutine(true)
    try {
      const requestBody = {
        name: eventRoutineName.trim(),
        instruction: eventActionInstruction.trim(),
        source: eventProvider,
        event_type: resolvedEventType,
        when_to_run: whenToRun,
        filters: conditions.length
          ? { operator: 'AND', conditions }
          : null,
        ...(eventProvider === 'github' ? { repository: githubRepository.trim() } : {}),
        ...(eventProvider === 'slack' ? { channel_name: slackChannel.trim().replace(/^#/, '') } : {}),
      }

      const res = await fetch('/api/routines/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not create event routine.')

      const created = data.routine as Routine
      setRoutines((items) => [created, ...items.filter((item) => item.id !== created.id)])
      setSelectedRoutine(created)
      setWebhookUrl(data.webhook_url || '')
      setEditingRoutine(false)
      setRoutineActionStatus(
        eventProvider === 'github'
          ? 'Routine created. Orbit registered a webhook on the selected repository.'
          : eventProvider === 'slack'
            ? 'Routine created. Finish the Slack Events API setup shown below to start receiving events.'
            : eventProvider === 'gmail'
              ? 'Routine created. New matching emails will start runs.'
              : 'Routine created. Copy the webhook URL and key below, then send a POST when your event occurs.',
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
      integrationPopupRef.current = popup
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

  const eventProviderReady =
    eventProvider === 'webhook' ||
    Boolean(
      integrationStatus &&
      integrationStatus[eventProvider].accounts[0] &&
      integrationStatus.token_storage_configured &&
      integrationStatus.public_url_configured &&
      integrationStatus.webhook_payload_limit_configured &&
      (eventProvider !== 'slack' || integrationStatus.slack.signing_configured) &&
      (eventProvider !== 'gmail' ||
        (integrationStatus.gmail.pubsub_configured && integrationStatus.gmail.pubsub_limits_configured)),
    )

  const latestEvent = routineEvents[0]
  const eventStatusRank: Record<string, number> = {
    received: 0,
    pending: 1,
    queued: 1,
    retrying: 2,
    processing: 2,
    running: 2,
    completed: 3,
    failed: 3,
    skipped: 3,
  }
  const eventStatuses = [latestEvent?.processing_status, latestEvent?.routine_status]
    .filter((status): status is string => Boolean(status))
    .map((status) => status.toLowerCase())
  const latestEventStatus = eventStatuses.sort(
    (a, b) => (eventStatusRank[b] ?? 0) - (eventStatusRank[a] ?? 0),
  )[0] || 'received'
  const latestEventStatusLabel: Record<string, string> = {
    received: 'Received',
    pending: 'Queued',
    queued: 'Queued',
    retrying: 'Retrying',
    processing: 'Running',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    skipped: 'Skipped',
  }
  const latestEventIsTerminal = ['completed', 'failed', 'skipped'].includes(latestEventStatus)
  const latestEventIsFailed = latestEventStatus === 'failed'
  const latestEventStageIndex =
    latestEventStatus === 'pending' || latestEventStatus === 'queued'
      ? 1
      : ['retrying', 'processing', 'running'].includes(latestEventStatus)
        ? 2
        : latestEventIsTerminal
          ? 3
          : 0
  const latestEventStages = [
    'Event received',
    'Matched and queued',
    'Orbit is running',
    latestEventIsFailed ? 'Failed' : latestEventStatus === 'skipped' ? 'Skipped' : 'Result saved',
  ]

  return (
    <ModernDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="routines-modal-title"
      className="routines-modal-dialog"
    >
      <div className="routine-manager">
        <header className="routine-manager-header">
          <div className="routine-manager-heading">
            <span className="routine-manager-eyebrow">ORBIT AUTOMATIONS</span>
            <h2 id="routines-modal-title">Routines</h2>
            <p>Give Orbit work to do on a schedule or when something happens.</p>
          </div>
          <div className="routine-manager-header-actions">
            <nav className="routine-manager-tabs" aria-label="Routine views">
              <button
                type="button"
                className={tab === 'routines' || tab === 'detail' ? 'active' : ''}
                aria-current={tab === 'routines' || tab === 'detail' ? 'page' : undefined}
                onClick={() => setTab('routines')}
              >
                Routines
                <span>{routines.length}</span>
              </button>
              <button
                type="button"
                className={tab === 'history' ? 'active' : ''}
                aria-current={tab === 'history' ? 'page' : undefined}
                onClick={() => {
                  setTab('history')
                  void loadNotifications()
                }}
              >
                Activity
                {unreadCount > 0 && <span className="routine-unread-count">{unreadCount}</span>}
              </button>
            </nav>
            <button
              type="button"
              className="routine-new-button"
              onClick={() => {
                setFormError('')
                setTab('create')
              }}
            >
              <Icon name="plus" size={15} />
              New routine
            </button>
            <button className="routine-close-button" onClick={onClose} aria-label="Close routines">
              <Icon name="close" size={17} />
            </button>
          </div>
        </header>

        {tab === 'create' ? (
          <main className="routine-create-page">
            <div className="routine-page-heading">
              <button type="button" className="routine-back-link" onClick={() => setTab('routines')}>
                <Icon name="chevronLeft" size={15} />
                Back to routines
              </button>
              <span className="routine-manager-eyebrow">NEW AUTOMATION</span>
              <h3>Create a routine</h3>
              <p>Choose what starts the routine, then tell Orbit what to do.</p>
            </div>

            <div className="routine-create-layout">
              <aside className="routine-create-intro">
                <div className="routine-create-icon"><Icon name="zap" size={22} /></div>
                <h4>Let Orbit handle the repeat work</h4>
                <p>Routines run in the background. You can inspect each run, pause it, or change its instructions at any time.</p>
                <div className="routine-create-tip">
                  <strong>Two ways to start</strong>
                  <span><b>Schedule</b> — run at a time or interval you describe.</span>
                  <span><b>Event trigger</b> — start when GitHub, Slack, Gmail, or a webhook sends a matching event.</span>
                </div>
              </aside>

              <section className="routine-create-form-panel">
                <div className="routine-create-mode" role="tablist" aria-label="Routine trigger type">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={createMode === 'schedule'}
                    className={createMode === 'schedule' ? 'active' : ''}
                    onClick={() => {
                      setCreateMode('schedule')
                      setFormError('')
                    }}
                  >
                    <Icon name="clock" size={15} />
                    Schedule
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={createMode === 'event'}
                    className={createMode === 'event' ? 'active' : ''}
                    onClick={() => {
                      setCreateMode('event')
                      setFormError('')
                    }}
                  >
                    <Icon name="zap" size={15} />
                    Event trigger
                  </button>
                </div>

                {formError && <div className="routine-form-error" role="alert">{formError}</div>}

                {createMode === 'schedule' ? (
                  <form className="routine-create-form" onSubmit={handleCreateSubmit}>
                    <div className="routine-form-section-heading">
                      <span>01</span>
                      <div>
                        <h4>What should Orbit do?</h4>
                        <p>Describe the task and when it should happen in one sentence.</p>
                      </div>
                    </div>
                    <label htmlFor="routine-request">Instruction</label>
                    <textarea
                      id="routine-request"
                      rows={6}
                      maxLength={1000}
                      placeholder="Every weekday at 9 AM, check the latest GitHub issues in my repository and send me a concise summary of anything urgent."
                      value={routineRequest}
                      onChange={(e) => setRoutineRequest(e.target.value)}
                      disabled={creatingRoutine}
                      required
                    />
                    <div className="routine-field-hint">
                      Example: “Every Monday at 9 AM, review new leads and prepare a follow-up list.”
                    </div>
                    <div className="routine-form-footer">
                      <span>Orbit will interpret the schedule using your local timezone.</span>
                      <button type="submit" className="routine-primary-button" disabled={creatingRoutine || !routineRequest.trim()}>
                        {creatingRoutine ? 'Creating…' : 'Create routine'}
                        <Icon name="arrowUp" size={15} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="routine-create-form event-routine-form" onSubmit={(event) => void handleCreateEvent(event)}>
                    <div className="routine-form-section">
                      <div className="routine-form-section-heading">
                        <span>01</span>
                        <div>
                          <h4>What should wake Orbit?</h4>
                          <p>Choose the service that sends the event.</p>
                        </div>
                      </div>
                      <div className="event-provider-grid">
                        {([
                          ['github', 'GitHub', 'Issues, pull requests and comments'],
                          ['slack', 'Slack', 'Mentions, messages and reactions'],
                          ['gmail', 'Gmail', 'New incoming email'],
                          ['webhook', 'Webhook', 'Events from any app or service'],
                        ] as const).map(([provider, title, description]) => {
                          const providerStatus = provider === 'webhook' ? null : integrationStatus?.[provider]
                          const connected = provider === 'webhook' || Boolean(providerStatus?.accounts[0])
                          return (
                            <button
                              type="button"
                              key={provider}
                              className={'event-provider-card' + (eventProvider === provider ? ' selected' : '')}
                              aria-pressed={eventProvider === provider}
                              onClick={() => {
                                setEventProvider(provider)
                                if (provider === 'github') setEventType('issues.opened')
                                if (provider === 'slack') setEventType('app_mention')
                                if (provider === 'gmail') setEventType('email.received')
                              }}
                            >
                              <span className="event-provider-topline">
                                <span className="event-provider-mark">{provider === 'github' ? 'GH' : provider === 'slack' ? 'S' : provider === 'gmail' ? 'G' : '↗'}</span>
                                <span className={'event-provider-indicator' + (connected ? ' connected' : '')} />
                              </span>
                              <strong className="event-provider-title">{title}</strong>
                              <span className="event-provider-description">{description}</span>
                              <span className={'event-provider-state' + (connected ? ' connected' : '')}>
                                {provider === 'webhook' ? 'No account needed' : connected ? 'Connected' : 'Connect account'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {eventProvider !== 'webhook' && (
                      <div className="routine-form-section">
                        <div className="routine-form-section-heading">
                          <span>02</span>
                          <div>
                            <h4>Connect your account</h4>
                            <p>Orbit uses this connection only to receive the events you configure.</p>
                          </div>
                        </div>
                        {integrationStatus?.[eventProvider].accounts[0] ? (
                          <div className="event-connection-panel connected">
                            <span className="event-connection-dot" />
                            <div>
                              <strong>Connected as {integrationStatus[eventProvider].accounts[0].account_name}</strong>
                              <p>Your account is ready to use for event triggers.</p>
                            </div>
                            <button type="button" className="routine-secondary-button" onClick={() => void handleDisconnectIntegration(eventProvider)}>
                              Disconnect
                            </button>
                          </div>
                        ) : (
                          <div className="event-connection-panel">
                            <div>
                              <strong>{integrationStatus ? 'Account not connected' : 'Checking connection…'}</strong>
                              <p>
                                {integrationStatus?.[eventProvider].configured
                                  ? 'Connect in a secure sign-in window, then return here.'
                                  : 'OAuth credentials for this service need to be configured on the Orbit server.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="routine-secondary-button"
                              disabled={!integrationStatus?.[eventProvider].configured || !integrationStatus?.token_storage_configured || !integrationStatus?.public_url_configured || creatingRoutine}
                              onClick={() => void handleConnectIntegration(eventProvider)}
                            >
                              Connect {eventProvider === 'github' ? 'GitHub' : eventProvider === 'slack' ? 'Slack' : 'Gmail'}
                            </button>
                          </div>
                        )}
                        {eventProvider === 'slack' && integrationStatus?.slack.accounts[0] && (
                          <div className="event-provider-help">
                            <strong>Slack event delivery</strong>
                            <p>Add this URL as the Request URL in your Slack app’s Event Subscriptions and subscribe to the event types you need.</p>
                            {integrationStatus.slack.events_url && (
                              <div className="routine-copy-row">
                                <code>{integrationStatus.slack.events_url}</code>
                                <button type="button" className="routine-secondary-button" onClick={() => void handleCopyValue(integrationStatus.slack.events_url || '', 'Slack event URL')}>Copy URL</button>
                              </div>
                            )}
                          </div>
                        )}
                        {eventProvider === 'gmail' && integrationStatus?.gmail.accounts[0] && (
                          <div className="event-provider-help">
                            <strong>Gmail push delivery</strong>
                            <p>The Orbit server must have Gmail Pub/Sub configured. Connecting a mailbox alone does not enable incoming events.</p>
                          </div>
                        )}
                        {integrationStatus && (
                          <div className="event-prerequisite-list">
                            {!integrationStatus.token_storage_configured && <small>Server setup needed: configure INTEGRATION_TOKEN_ENCRYPTION_KEY.</small>}
                            {!integrationStatus.public_url_configured && <small>Server setup needed: configure ORBIT_PUBLIC_URL with a public HTTPS address.</small>}
                            {!integrationStatus.webhook_payload_limit_configured && <small>Server setup needed: configure ORBIT_PROVIDER_WEBHOOK_MAX_BYTES.</small>}
                            {eventProvider === 'slack' && !integrationStatus.slack.signing_configured && <small>Server setup needed: configure SLACK_SIGNING_SECRET.</small>}
                            {eventProvider === 'gmail' && !integrationStatus.gmail.pubsub_configured && <small>Server setup needed: configure Gmail Pub/Sub.</small>}
                            {eventProvider === 'gmail' && !integrationStatus.gmail.pubsub_limits_configured && <small>Server setup needed: configure Gmail processing limits.</small>}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="routine-form-section">
                      <div className="routine-form-section-heading">
                        <span>{eventProvider === 'webhook' ? '02' : '03'}</span>
                        <div>
                          <h4>When should it run?</h4>
                          <p>Select an event and narrow it with optional conditions.</p>
                        </div>
                      </div>
                      {eventProvider !== 'webhook' && (
                        <div className="routines-form-field">
                          <label htmlFor="event-type">Event</label>
                          <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                            {(eventProvider === 'github'
                              ? [
                                  ['issues.opened', 'A new issue is opened'],
                                  ['issues.labeled', 'A label is added to an issue'],
                                  ['pull_request.opened', 'A pull request is opened'],
                                  ['issue_comment.created', 'A comment is created on an issue or pull request'],
                                ]
                              : eventProvider === 'slack'
                                ? [
                                    ['app_mention', 'Orbit is mentioned'],
                                    ['message.channels', 'A new channel message is posted'],
                                    ['reaction_added', 'A reaction is added to a message'],
                                  ]
                                : [['email.received', 'A new email arrives']]
                            ).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                          </select>
                        </div>
                      )}
                      {eventProvider === 'github' && (
                        <>
                          <div className="routines-form-field">
                            <label htmlFor="github-repository">Repository</label>
                            <input id="github-repository" value={githubRepository} onChange={(e) => setGithubRepository(e.target.value)} placeholder="owner/repository" required />
                            <small>Orbit will register the event webhook on this repository.</small>
                          </div>
                          <div className="routines-form-field">
                            <label htmlFor="github-label">Only when the issue has this label (optional)</label>
                            <input id="github-label" value={githubLabel} onChange={(e) => setGithubLabel(e.target.value)} placeholder="bug, support, urgent…" />
                          </div>
                        </>
                      )}
                      {eventProvider === 'slack' && (
                        <>
                          <div className="routines-form-field">
                            <label htmlFor="slack-channel">Channel</label>
                            <input id="slack-channel" value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)} placeholder="customer-escalations" required />
                            <small>Enter the channel name without #. The Slack app must be a member.</small>
                          </div>
                          {eventType === 'reaction_added' ? (
                            <div className="routines-form-field">
                              <label htmlFor="slack-reaction">Only this reaction (optional)</label>
                              <input id="slack-reaction" value={slackReaction} onChange={(e) => setSlackReaction(e.target.value)} placeholder="eyes" />
                            </div>
                          ) : (
                            <div className="routines-form-field">
                              <label htmlFor="slack-phrase">Only messages containing this phrase (optional)</label>
                              <input id="slack-phrase" value={slackPhrase} onChange={(e) => setSlackPhrase(e.target.value)} placeholder="needs review" />
                            </div>
                          )}
                        </>
                      )}
                      {eventProvider === 'gmail' && (
                        <>
                          <div className="routines-form-field">
                            <label htmlFor="gmail-sender">Only from this sender (optional)</label>
                            <input id="gmail-sender" type="email" value={gmailSender} onChange={(e) => setGmailSender(e.target.value)} placeholder="alerts@example.com" />
                          </div>
                          <div className="routines-form-field">
                            <label htmlFor="gmail-subject">Subject contains (optional)</label>
                            <input id="gmail-subject" value={gmailSubject} onChange={(e) => setGmailSubject(e.target.value)} placeholder="Invoice or support request" />
                          </div>
                        </>
                      )}
                      {eventProvider === 'webhook' && (
                        <>
                          <div className="routines-form-field">
                            <label htmlFor="webhook-event-type">Event name</label>
                            <input id="webhook-event-type" value={webhookEventType} onChange={(e) => setWebhookEventType(e.target.value)} placeholder="invoice.paid" required maxLength={120} />
                            <small>Use the same event name in the JSON sent to Orbit.</small>
                          </div>
                          <div className="routines-form-field">
                            <label htmlFor="webhook-when">Trigger description (optional)</label>
                            <input id="webhook-when" value={webhookWhen} onChange={(e) => setWebhookWhen(e.target.value)} placeholder="When a paid invoice event is received" maxLength={500} />
                          </div>
                          <div className="routines-form-field">
                            <label htmlFor="webhook-filter-field">Only when this JSON field matches (optional)</label>
                            <input id="webhook-filter-field" value={webhookFilterField} onChange={(e) => setWebhookFilterField(e.target.value)} placeholder="payload.data.status" maxLength={128} />
                          </div>
                          <div className="event-webhook-condition-row">
                            <div className="routines-form-field">
                              <label htmlFor="webhook-filter-operator">Condition</label>
                              <select id="webhook-filter-operator" value={webhookFilterOperator} onChange={(e) => setWebhookFilterOperator(e.target.value as 'equals' | 'contains')}>
                                <option value="equals">equals</option>
                                <option value="contains">contains</option>
                              </select>
                            </div>
                            <div className="routines-form-field">
                              <label htmlFor="webhook-filter-value">Matching value</label>
                              <input id="webhook-filter-value" value={webhookFilterValue} onChange={(e) => setWebhookFilterValue(e.target.value)} placeholder="paid" maxLength={500} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="routine-form-section">
                      <div className="routine-form-section-heading">
                        <span>{eventProvider === 'webhook' ? '03' : '04'}</span>
                        <div>
                          <h4>What should Orbit do?</h4>
                          <p>Give the routine a name and clear instructions for the work.</p>
                        </div>
                      </div>
                      <div className="routines-form-field">
                        <label htmlFor="event-routine-name">Routine name</label>
                        <input id="event-routine-name" value={eventRoutineName} onChange={(e) => setEventRoutineName(e.target.value)} placeholder="Triage new support issues" required maxLength={120} />
                      </div>
                      <div className="routines-form-field">
                        <label htmlFor="event-action-instruction">Instruction</label>
                        <textarea
                          id="event-action-instruction"
                          rows={5}
                          maxLength={4000}
                          placeholder="Review the new issue, identify the likely cause, check related files, and write a concise summary."
                          value={eventActionInstruction}
                          onChange={(e) => setEventActionInstruction(e.target.value)}
                          disabled={creatingRoutine}
                          required
                        />
                        <small>Describe the task and where the result should be delivered. External actions that need approval remain subject to Orbit’s approval flow.</small>
                      </div>
                    </div>

                    <div className="event-final-note">
                      <strong>Only new matching events start this routine.</strong>
                      <span>Orbit checks the service, event type, and conditions before starting the agent. Older activity is not replayed.</span>
                    </div>
                    <div className="routine-form-footer">
                      <span>Your event connection and conditions can be reviewed after creation.</span>
                      <button type="submit" className="routine-primary-button" disabled={creatingRoutine || !eventProviderReady}>
                        {creatingRoutine ? 'Creating…' : 'Create event routine'}
                        <Icon name="arrowUp" size={15} />
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>
          </main>
        ) : tab === 'history' ? (
          <main className="routine-activity-page">
            <div className="routine-page-heading">
              <span className="routine-manager-eyebrow">AUTOMATION ACTIVITY</span>
              <h3>Activity</h3>
              <p>Notifications and updates from your routines.</p>
            </div>
            <div className="routine-activity-toolbar">
              <button type="button" className="routine-secondary-button" onClick={onToggleSound}>
                <Icon name="bell" size={14} />
                Sound {soundEnabled ? 'on' : 'off'}
              </button>
              {notificationPermission !== 'granted' && (
                <button type="button" className="routine-secondary-button" onClick={() => void requestDesktopPermission()}>
                  Enable desktop alerts
                </button>
              )}
              {notifications.some((n) => !n.is_read) && (
                <button type="button" className="routine-secondary-button" onClick={() => void handleMarkAllRead()}>
                  Mark all as read
                </button>
              )}
            </div>
            <div className="routine-activity-list">
              {notifications.length === 0 ? (
                <div className="routine-empty-state">
                  <div className="routine-empty-icon"><Icon name="bell" size={22} /></div>
                  <h4>No activity yet</h4>
                  <p>When a routine runs or sends an alert, it will appear here.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const cleanMsg = n.message
                    .replace(/Reminder \/ Routine '[^']+' triggered successfully\./g, '')
                    .replace(/\*Executed in \d+ms at [^*]+\*/g, '')
                    .trim() || n.title
                  return (
                    <article key={n.id} className={'routine-activity-item' + (!n.is_read ? ' unread' : '')}>
                      <span className="routine-activity-dot" />
                      <div className="routine-activity-copy">
                        <div className="routine-activity-title-row">
                          <strong>{n.title}</strong>
                          <time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                        </div>
                        <p>{cleanMsg}</p>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </main>
        ) : (
          <div className="routine-workspace">
            <aside className="routine-sidebar">
              <div className="routine-sidebar-heading">
                <div>
                  <span className="routine-manager-eyebrow">YOUR AUTOMATIONS</span>
                  <h3>All routines <span>{routines.length}</span></h3>
                </div>
                <button type="button" className="routine-sidebar-add" onClick={() => setTab('create')} aria-label="Create routine">
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <div className="routine-sidebar-list">
                {loading && <div className="routine-sidebar-message">Loading routines…</div>}
                {!loading && routines.length === 0 && (
                  <div className="routine-sidebar-message">Your routines will appear here.</div>
                )}
                {routines.map((r) => {
                  const readableSchedule = formatHumanSchedule(r.schedule_display || r.schedule_expression, r.one_shot)
                  const isSelected = selectedRoutine?.id === r.id
                  const triggerSummary = r.trigger_type === 'event'
                    ? r.trigger_definition?.when || ('When ' + (r.trigger_definition?.event_type || r.event_type || 'an event') + ' arrives')
                    : readableSchedule || r.schedule_expression || 'Scheduled routine'
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={'routine-sidebar-item' + (isSelected ? ' selected' : '')}
                      onClick={() => void handleOpenRoutine(r.id)}
                      aria-pressed={isSelected}
                    >
                      <span className="routine-sidebar-item-icon">
                        <Icon name={r.trigger_type === 'event' ? 'zap' : 'clock'} size={15} />
                      </span>
                      <span className="routine-sidebar-item-copy">
                        <strong>{r.name}</strong>
                        <span>{triggerSummary}</span>
                        <span className="routine-sidebar-item-meta">
                          <i className={r.enabled ? 'active' : ''} />
                          {r.enabled ? 'Active' : 'Paused'}
                          <b>·</b>
                          {r.trigger_type === 'event' ? (r.trigger_definition?.source || r.event_source || 'Event') : r.one_shot ? 'One-time' : 'Schedule'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="routine-sidebar-footer">
                <span><i /> Active</span>
                <span><i className="paused" /> Paused</span>
              </div>
            </aside>

            <main className="routine-detail-pane">
              {!selectedRoutine ? (
                <div className="routine-detail-empty">
                  <div className="routine-empty-icon"><Icon name="clock" size={24} /></div>
                  <h3>Select a routine</h3>
                  <p>Choose a routine from the list to view its instructions, trigger, and recent runs.</p>
                  <button type="button" className="routine-primary-button" onClick={() => setTab('create')}>
                    <Icon name="plus" size={15} />
                    Create a routine
                  </button>
                </div>
              ) : (
                <section className="routine-detail">
                  <div className="routine-detail-topline">
                    <div>
                      <span className={'routine-status-pill' + (selectedRoutine.enabled ? ' active' : ' paused')}>
                        <i />
                        {selectedRoutine.enabled ? 'Active' : 'Paused'}
                      </span>
                      <span className="routine-detail-kind">
                        {selectedRoutine.trigger_type === 'event' ? 'Event-triggered routine' : selectedRoutine.one_shot ? 'One-time routine' : 'Scheduled routine'}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selectedRoutine.enabled}
                      className={'routine-switch' + (selectedRoutine.enabled ? ' on' : '')}
                      onClick={() => void handleTogglePause(selectedRoutine)}
                      aria-label={selectedRoutine.enabled ? 'Pause routine' : 'Resume routine'}
                    >
                      <span />
                    </button>
                  </div>

                  <div className="routine-detail-title-row">
                    <div className="routine-detail-avatar" aria-hidden="true">
                      {selectedRoutine.name.trim().charAt(0).toUpperCase() || 'R'}
                    </div>
                    <div className="routine-detail-title-copy">
                      {editingRoutine ? (
                        <input
                          className="routine-title-input"
                          aria-label="Routine name"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      ) : (
                        <h3>{selectedRoutine.name}</h3>
                      )}
                      <p>{selectedRoutine.trigger_type === 'event' ? (selectedRoutine.trigger_definition?.source || selectedRoutine.event_source || 'Event') + ' trigger' : 'Runs ' + (selectedRoutine.one_shot ? 'once' : 'on a schedule')}</p>
                    </div>
                  </div>

                  <div className="routine-detail-section">
                    <div className="routine-section-heading">
                      <div>
                        <span className="routine-manager-eyebrow">THE WORK</span>
                        <h4>Instruction</h4>
                      </div>
                    </div>
                    {editingRoutine ? (
                      <textarea
                        className="routine-instruction-input"
                        rows={5}
                        value={editInstruction}
                        onChange={(event) => setEditInstruction(event.target.value)}
                        aria-label="Routine instruction"
                      />
                    ) : (
                      <div className="routine-instruction-box">{selectedRoutine.action_prompt}</div>
                    )}
                  </div>

                  <div className="routine-detail-section">
                    <div className="routine-section-heading">
                      <div>
                        <span className="routine-manager-eyebrow">THE TRIGGER</span>
                        <h4>When to run</h4>
                      </div>
                      <span className="routine-trigger-type">{selectedRoutine.trigger_type === 'event' ? 'Event' : 'Schedule'}</span>
                    </div>
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
                          placeholder="When a new issue is opened"
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
                            onChange={(event) => setEditFilterOperator(event.target.value as 'equals' | 'contains')}
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
                      <div className="routine-trigger-summary">
                        <span className="routine-trigger-icon"><Icon name={selectedRoutine.trigger_type === 'event' ? 'zap' : 'clock'} size={16} /></span>
                        <div>
                          <strong>
                            {selectedRoutine.trigger_type === 'event'
                              ? selectedRoutine.trigger_definition?.when || ('When ' + (selectedRoutine.trigger_definition?.event_type || selectedRoutine.event_type || 'an event') + ' arrives')
                              : selectedRoutine.schedule_display || selectedRoutine.schedule_expression || 'Manual run'}
                          </strong>
                          <p>
                            {selectedRoutine.trigger_type === 'event'
                              ? (selectedRoutine.trigger_definition?.source || selectedRoutine.event_source || 'webhook') + ' · ' + (selectedRoutine.trigger_definition?.event_type || selectedRoutine.event_type || 'Event')
                              : selectedRoutine.next_run_at
                                ? 'Next run ' + new Date(selectedRoutine.next_run_at).toLocaleString()
                                : selectedRoutine.one_shot ? 'One-time schedule' : 'Recurring schedule'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedRoutine.trigger_type === 'event' && (selectedRoutine.trigger_definition?.source || selectedRoutine.event_source || 'webhook') === 'webhook' && (
                    <div className="routine-detail-section">
                      <div className="routine-section-heading">
                        <div>
                          <span className="routine-manager-eyebrow">CONNECTION</span>
                          <h4>Webhook endpoint</h4>
                        </div>
                      </div>
                      <p className="routine-detail-help">Send an HTTP POST to this URL when your event occurs. Include the authorization key as a Bearer token.</p>
                      <div className="routine-copy-row">
                        <code>{webhookUrl}</code>
                        <button type="button" className="routine-secondary-button" onClick={() => void handleCopyValue(webhookUrl, 'Webhook URL')}>Copy URL</button>
                      </div>
                      {selectedRoutine.webhook_secret && (
                        <div className="routine-copy-row">
                          <code>Authorization: Bearer {selectedRoutine.webhook_secret}</code>
                          <button
                            type="button"
                            className="routine-secondary-button"
                            onClick={() => void handleCopyValue('Authorization: Bearer ' + (selectedRoutine.webhook_secret || ''), 'Authorization header')}
                          >
                            Copy key
                          </button>
                        </div>
                      )}
                      <div className="event-webhook-example">
                        <span>Example event payload</span>
                        <pre>{JSON.stringify({ event_type: selectedRoutine.event_type || 'webhook.received', event_id: 'your-event-id', data: { status: 'paid' } }, null, 2)}</pre>
                        <button
                          type="button"
                          className="routine-secondary-button"
                          onClick={() => void handleCopyValue(JSON.stringify({ event_type: selectedRoutine.event_type || 'webhook.received', event_id: 'your-event-id', data: { status: 'paid' } }, null, 2), 'Example JSON body')}
                        >
                          Copy example
                        </button>
                      </div>
                      <small className="routine-security-note">Keep the authorization key private. Store it on the server sending the event, never in browser code.</small>
                    </div>
                  )}

                  {selectedRoutine.trigger_type === 'event' && (selectedRoutine.trigger_definition?.source || selectedRoutine.event_source) === 'github' && (
                    <div className="routine-provider-note">
                      <strong>GitHub connection</strong>
                      <p>Orbit registered a webhook for <b>{selectedRoutine.trigger_definition?.repository || 'the selected repository'}</b>. Only new matching events are queued.</p>
                    </div>
                  )}
                  {selectedRoutine.trigger_type === 'event' && (selectedRoutine.trigger_definition?.source || selectedRoutine.event_source) === 'slack' && (
                    <div className="routine-provider-note">
                      <strong>Slack connection</strong>
                      <p>This routine listens for {selectedRoutine.trigger_definition?.when || 'matching Slack activity'}. Configure the Slack Events API with the shared endpoint below.</p>
                      {integrationStatus?.slack.events_url && (
                        <div className="routine-copy-row">
                          <code>{integrationStatus.slack.events_url}</code>
                          <button type="button" className="routine-secondary-button" onClick={() => void handleCopyValue(integrationStatus.slack.events_url || '', 'Slack event URL')}>Copy URL</button>
                        </div>
                      )}
                    </div>
                  )}
                  {selectedRoutine.trigger_type === 'event' && (selectedRoutine.trigger_definition?.source || selectedRoutine.event_source) === 'gmail' && (
                    <div className="routine-provider-note">
                      <strong>Gmail connection</strong>
                      <p>This routine watches {selectedRoutine.trigger_definition?.email_address || integrationStatus?.gmail.accounts[0]?.account_name || 'the connected inbox'} for new incoming email. Existing messages are not replayed.</p>
                    </div>
                  )}

                  {selectedRoutine.trigger_type === 'event' && (
                    <div className="routine-detail-section routine-event-progress-section" aria-live="polite">
                      <div className="routine-section-heading">
                        <div>
                          <span className="routine-manager-eyebrow">TRIGGER ACTIVITY</span>
                          <h4>Latest matching event</h4>
                        </div>
                        <span className="routine-live-refresh">
                          <i />
                          Live · {activityUpdatedAt
                            ? `updated ${new Date(activityUpdatedAt).toLocaleTimeString()}`
                            : 'syncing'}
                        </span>
                      </div>
                      {latestEvent ? (
                        <>
                          <div className="routine-event-current">
                            <div>
                              <strong>{latestEvent.event_type}</strong>
                              <p>
                                {latestEvent.source} · received {new Date(latestEvent.received_at).toLocaleString()}
                              </p>
                            </div>
                            <span className={'routine-run-status ' + latestEventStatus}>
                              {latestEventStatusLabel[latestEventStatus] || latestEventStatus.replaceAll('_', ' ')}
                            </span>
                          </div>
                          <div className="routine-event-pipeline" aria-label={`Event status: ${latestEventStatusLabel[latestEventStatus] || latestEventStatus}`}>
                            {latestEventStages.map((stage, index) => {
                              const isPast = index < latestEventStageIndex
                              const isCurrent = index === latestEventStageIndex && !latestEventIsTerminal
                              const isFailed = index === 3 && latestEventIsFailed
                              const isDone = index === 3 && latestEventIsTerminal && !latestEventIsFailed
                              return (
                                <div
                                  className={
                                    'routine-event-step' +
                                    (isPast || isDone ? ' complete' : '') +
                                    (isCurrent ? ' current' : '') +
                                    (isFailed ? ' failed' : '')
                                  }
                                  key={stage}
                                >
                                  <span className="routine-event-step-marker">
                                    {isPast || isDone ? '✓' : index + 1}
                                  </span>
                                  <span>{stage}</span>
                                </div>
                              )
                            })}
                          </div>
                          <p className="routine-event-progress-copy">
                            {latestEventStatus === 'completed'
                              ? 'Orbit finished this event run. The result is saved in Recent runs and Activity.'
                              : latestEventStatus === 'failed'
                                ? 'Orbit could not complete this event. Check the failure reason in Recent runs.'
                                : latestEventStatus === 'retrying'
                                  ? 'Orbit hit an execution issue and is retrying this event.'
                                  : latestEventStatus === 'processing' || latestEventStatus === 'running'
                                    ? 'The event matched your trigger. Orbit is executing the instruction now.'
                                    : latestEventStatus === 'skipped'
                                      ? 'This event was received but the routine was skipped.'
                                      : 'The event matched your trigger and is waiting in Orbit’s queue.'}
                          </p>
                          {latestEvent.routine_error && (
                            <p className="routine-run-error" role="alert">{latestEvent.routine_error}</p>
                          )}
                          <details className="routine-event-payload">
                            <summary>View event payload</summary>
                            <pre>{JSON.stringify(latestEvent.payload, null, 2)}</pre>
                          </details>
                        </>
                      ) : (
                        <div className="routine-event-waiting">
                          <span className="routine-event-waiting-dot" />
                          <div>
                            <strong>{selectedRoutine.enabled ? 'Waiting for a matching event' : 'Routine is paused'}</strong>
                            <p>
                              {selectedRoutine.enabled
                                ? 'When GitHub, Slack, Gmail, or your webhook sends a new event that matches this trigger, Orbit will queue it and update this panel as the run progresses.'
                                : 'Resume this routine to start receiving new matching events.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="routine-detail-section routine-history-section">
                    <div className="routine-section-heading">
                      <div>
                        <span className="routine-manager-eyebrow">EXECUTION LOG</span>
                        <h4>Recent runs</h4>
                      </div>
                      <button type="button" className="routine-text-button" onClick={() => void loadRoutineActivity(selectedRoutine.id)}>
                        <Icon name="refresh" size={13} />
                        Refresh
                      </button>
                    </div>
                    {routineRuns.length === 0 ? (
                      <p className="routine-empty-inline">No runs yet. Test this routine or wait for its next matching trigger.</p>
                    ) : (
                      <div className="routine-run-list">
                        {routineRuns.map((run) => (
                          <article className="routine-run-item" key={run.id}>
                            <div className="routine-run-item-header">
                              <strong>{run.trigger_source.replaceAll('_', ' ')}</strong>
                              <span className={'routine-run-status ' + run.status.toLowerCase()}>{run.status}</span>
                            </div>
                            <time dateTime={run.created_at}>{new Date(run.created_at).toLocaleString()}</time>
                            {run.result_summary && <p>{run.result_summary}</p>}
                            {run.error && <p className="routine-run-error" role="alert">{run.error}</p>}
                            {typeof run.duration_ms === 'number' && <small>{run.duration_ms.toLocaleString()} ms</small>}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedRoutine.trigger_type === 'event' && (
                    <div className="routine-detail-section">
                      <div className="routine-section-heading">
                        <div>
                          <span className="routine-manager-eyebrow">EVENT DELIVERY</span>
                          <h4>Recent matching events</h4>
                        </div>
                      </div>
                      {routineEvents.length === 0 ? (
                        <p className="routine-empty-inline">No matching events received yet. The routine will start when a new event matches its trigger.</p>
                      ) : (
                        <div className="routine-event-list">
                          {routineEvents.map((event) => (
                            <details key={event.id}>
                              <summary>{event.event_type} <span>· {event.routine_status || event.processing_status}</span></summary>
                              <p>Received {new Date(event.received_at).toLocaleString()} from {event.source}</p>
                              <p>Delivery: {event.processing_status.replaceAll('_', ' ')}</p>
                              {event.routine_error && <p role="alert">{event.routine_error}</p>}
                              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {routineActionStatus && <p className="routine-action-status" role="status">{routineActionStatus}</p>}
                  {editingRoutine && selectedRoutine.trigger_type !== 'event' && (
                    <p className="routine-edit-note">The schedule stays unchanged here. To change its timing, create a new scheduled routine with the updated time.</p>
                  )}
                  <div className="routine-detail-actions">
                    {editingRoutine ? (
                      <>
                        <button type="button" className="routine-primary-button" onClick={() => void handleSaveRoutine()}>
                          Save changes
                        </button>
                        <button type="button" className="routine-secondary-button" onClick={() => setEditingRoutine(false)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="routine-primary-button"
                          disabled={testingRoutine}
                          onClick={() => void handleRunNow(selectedRoutine.id)}
                        >
                          {testingRoutine ? 'Running…' : 'Test run'}
                        </button>
                        <button type="button" className="routine-secondary-button" onClick={() => setEditingRoutine(true)}>
                          <Icon name="edit" size={13} />
                          Edit
                        </button>
                        <button type="button" className="routine-secondary-button" onClick={() => void handleTogglePause(selectedRoutine)}>
                          {selectedRoutine.enabled ? 'Pause' : 'Resume'}
                        </button>
                        {selectedRoutine.one_shot && selectedRoutine.enabled && (
                          <button type="button" className="routine-secondary-button" onClick={() => void handleSnooze(selectedRoutine.id, 10)}>
                            <Icon name="clock" size={13} />
                            Snooze 10m
                          </button>
                        )}
                        <button type="button" className="routine-danger-button" onClick={() => void handleDelete(selectedRoutine.id)}>
                          <Icon name="trash" size={13} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                  <p className="routine-test-note">A test performs real work using this instruction. Tool actions that need approval are declined during background runs.</p>
                </section>
              )}
            </main>
          </div>
        )}
      </div>
    </ModernDialog>
  )
}
