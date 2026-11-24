import React, { useCallback, useState, useEffect, useRef, type FormEvent } from 'react'
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
    provider_account_id?: string
    provider_account_name?: string
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
  events_ready?: boolean
  events_url?: string | null
  public_url_configured?: boolean
  accounts: Array<{
    provider: string
    provider_account_id: string
    account_name: string
    scopes: string[]
  }>
}

type EventRepository = {
  full_name: string
  private: boolean
  default_branch?: string
  can_manage_webhooks: boolean
}

type EventChannel = {
  id: string
  name: string
  is_member: boolean
  is_private: boolean
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

type RoutineRunMessage = {
  id: number
  run_id: string
  entry_type: 'prompt' | 'trigger' | 'status' | 'tool' | 'assistant' | 'error'
  status?: string | null
  title: string
  content: string
  details?: Record<string, unknown>
  created_at: string
}

export type RoutineExecutionPreview = {
  routine: Routine
  run: RoutineRun
  messages: RoutineRunMessage[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  unreadCount: number
  onClearUnread: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  onOpenExecution: (execution: RoutineExecutionPreview) => void
}

let routinesListCache: { items: Routine[]; fetchedAt: number } | null = null
let routinesListRequest: Promise<Routine[]> | null = null

export const ProactiveRoutinesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  unreadCount,
  onClearUnread,
  soundEnabled,
  onToggleSound,
  onOpenExecution,
}) => {
  const [tab, setTab] = useState<'routines' | 'create' | 'history' | 'detail'>('routines')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [notifications, setNotifications] = useState<ProactiveNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [routineLoadError, setRoutineLoadError] = useState('')
  const [deletingRoutineId, setDeletingRoutineId] = useState<string | null>(null)
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
  const [eventAccountId, setEventAccountId] = useState('')
  const [githubRepositories, setGithubRepositories] = useState<EventRepository[]>([])
  const [slackChannels, setSlackChannels] = useState<EventChannel[]>([])
  const [loadingEventResources, setLoadingEventResources] = useState(false)
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
  const eventProviderAccounts =
    eventProvider === 'webhook' ? [] : integrationStatus?.[eventProvider].accounts ?? []
  const activeEventAccountId = eventProviderAccounts.some(
    (account) => account.provider_account_id === eventAccountId,
  )
    ? eventAccountId
    : eventProviderAccounts[0]?.provider_account_id || ''
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null)
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
  const [routineRuns, setRoutineRuns] = useState<RoutineRun[]>([])
  const [openingRunId, setOpeningRunId] = useState<string | null>(null)
  const integrationPopupRef = useRef<Window | null>(null)
  const routineActivityRequestRef = useRef(0)

  const loadRoutines = useCallback(async () => {
    // Render the last known list immediately when the modal is reopened, then
    // revalidate it so edits made elsewhere still appear without a hard wait.
    if (routinesListCache) {
      setRoutines(routinesListCache.items)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setRoutineLoadError('')
    try {
      if (!routinesListRequest) {
        routinesListRequest = (async () => {
          const res = await fetch('/api/routines', { credentials: 'same-origin' })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.detail || 'Could not load routines.')
          }
          const data = await res.json()
          const items = Array.isArray(data.routines) ? data.routines as Routine[] : []
          routinesListCache = { items, fetchedAt: Date.now() }
          return items
        })().finally(() => {
          routinesListRequest = null
        })
      }
      const items = await routinesListRequest
      setRoutines(items)
    } catch (err) {
      setRoutineLoadError(err instanceof Error ? err.message : 'Could not load routines.')
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
    if (!isOpen) return
    const timer = window.setTimeout(() => {
      // Routine list is the only data needed to open this view. Notifications and
      // account status are fetched lazily when their tabs are visited.
      void loadRoutines()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOpen, loadRoutines])

  useEffect(() => {
    if (!isOpen || tab !== 'history') return
    const timer = window.setTimeout(() => void loadNotifications(), 0)
    return () => window.clearTimeout(timer)
  }, [isOpen, tab, loadNotifications])

  useEffect(() => {
    if (!isOpen || tab !== 'create' || createMode !== 'event' || integrationStatus) return
    const timer = window.setTimeout(() => void loadIntegrationStatus(), 0)
    return () => window.clearTimeout(timer)
  }, [isOpen, tab, createMode, integrationStatus, loadIntegrationStatus])

  useEffect(() => {
    const refreshIntegrationStatus = () => {
      if (isOpen && tab === 'create' && createMode === 'event') void loadIntegrationStatus()
    }
    window.addEventListener('orbit:integrations-updated', refreshIntegrationStatus)
    return () => window.removeEventListener('orbit:integrations-updated', refreshIntegrationStatus)
  }, [isOpen, tab, createMode, loadIntegrationStatus])

  useEffect(() => {
    const handleIntegrationMessage = (event: MessageEvent) => {
      // The OAuth callback is served by the backend domain, not the Vercel frontend domain.
      // Only accept messages from the popup opened by this component and the configured API origin.
      if (!integrationPopupRef.current || event.source !== integrationPopupRef.current) return
      const apiOrigin = integrationStatus?.public_url
      if (!apiOrigin) return
      const expectedOrigin = (() => {
        try {
          return new URL(apiOrigin).origin
        } catch {
          return null
        }
      })()
      if (!expectedOrigin || event.origin !== expectedOrigin) return
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
          window.dispatchEvent(new Event('orbit:integrations-updated'))
          void loadIntegrationStatus()
        }
      }
    }
    window.addEventListener('message', handleIntegrationMessage)
    return () => window.removeEventListener('message', handleIntegrationMessage)
  }, [loadIntegrationStatus, integrationStatus?.public_url])

  useEffect(() => {
    if (!isOpen || tab !== 'create' || createMode !== 'event' || !activeEventAccountId) return
    if (eventProvider !== 'github' && eventProvider !== 'slack') return
    const controller = new AbortController()
    const load = async () => {
      setLoadingEventResources(true)
      try {
        const endpoint =
          eventProvider === 'github'
            ? `/api/integrations/github/repositories?${new URLSearchParams({ account_id: activeEventAccountId })}`
            : `/api/integrations/slack/channels?${new URLSearchParams({ account_id: activeEventAccountId })}`
        const response = await fetch(endpoint, {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.detail || `Could not load ${eventProvider} resources.`)
        }
        const data = await response.json()
        if (eventProvider === 'github') {
          const repositories = (data.repositories || []) as EventRepository[]
          setGithubRepositories(repositories)
          setGithubRepository((current) =>
            repositories.some((item) => item.full_name === current && item.can_manage_webhooks)
              ? current
              : repositories.find((item) => item.can_manage_webhooks)?.full_name || '',
          )
        } else {
          const channels = (data.channels || []) as EventChannel[]
          setSlackChannels(channels)
          setSlackChannel((current) =>
            channels.some((item) => item.name === current && item.is_member)
              ? current
              : channels.find((item) => item.is_member)?.name || '',
          )
        }
      } catch (resourceError) {
        if (!controller.signal.aborted) {
          setFormError(
            resourceError instanceof Error
              ? resourceError.message
              : `Could not load ${eventProvider} resources.`,
          )
        }
      } finally {
        if (!controller.signal.aborted) setLoadingEventResources(false)
      }
    }
    const timer = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [isOpen, tab, createMode, eventProvider, activeEventAccountId])

  const loadRoutineActivity = useCallback(async (routineId: string) => {
    const requestId = ++routineActivityRequestRef.current
    try {
      const runsResponse = await fetch(
        `/api/routines/${encodeURIComponent(routineId)}/runs?limit=20`,
        { credentials: 'same-origin' },
      )
      if (!runsResponse.ok || requestId !== routineActivityRequestRef.current) return
      const runsData = await runsResponse.json()
      if (requestId === routineActivityRequestRef.current) {
        setRoutineRuns((runsData.runs || []) as RoutineRun[])
      }
    } catch {
      // Keep the last known activity visible if a background refresh fails.
    }
  }, [])

  const loadRunConversation = useCallback(async (routineId: string, runId: string) => {
    const response = await fetch(
      `/api/routines/${encodeURIComponent(routineId)}/runs/${encodeURIComponent(runId)}`,
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail || 'Could not load this run conversation.')
    }
    return {
      run: data.run as RoutineRun,
      messages: (data.messages || []) as RoutineRunMessage[],
    }
  }, [])

  const handleOpenRun = async (run: RoutineRun) => {
    if (!selectedRoutine || openingRunId) return
    setOpeningRunId(run.id)
    setRoutineActionStatus('')
    try {
      const execution = await loadRunConversation(selectedRoutine.id, run.id)
      onOpenExecution({
        routine: selectedRoutine,
        run: execution.run,
        messages: execution.messages,
      })
      onClose()
    } catch (err: unknown) {
      setRoutineActionStatus(
        err instanceof Error ? err.message : 'Could not load this execution.',
      )
    } finally {
      setOpeningRunId(null)
    }
  }

  const activeRoutineId = selectedRoutine?.id
  const hasActiveRoutineRun = routineRuns.some((run) =>
    ['queued', 'pending', 'running', 'in_progress'].includes(run.status.toLowerCase()),
  )
  useEffect(() => {
    if (!isOpen || tab !== 'detail' || !activeRoutineId || !hasActiveRoutineRun) return
    let stopped = false
    let requestInFlight = false
    const refreshActivity = async () => {
      if (stopped || requestInFlight || document.visibilityState !== 'visible') return
      requestInFlight = true
      try {
        await loadRoutineActivity(activeRoutineId)
      } finally {
        requestInFlight = false
      }
    }
    const timer = window.setInterval(() => void refreshActivity(), 15000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [isOpen, tab, activeRoutineId, hasActiveRoutineRun, loadRoutineActivity])

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
        const data = (await res.json().catch(() => ({}))) as { detail?: string }
        setRoutineActionStatus(data.detail || (res.status >= 502 && res.status <= 504 ? 'Service waking up. Please retry.' : 'Could not update routine.'))
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
    if (deletingRoutineId) return
    setDeletingRoutineId(routineId)
    setRoutineActionStatus('')
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(routineId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (res.ok) {
        setRoutines((prev) => prev.filter((r) => r.id !== routineId))
        setRoutineRuns([])
        if (selectedRoutine?.id === routineId) {
          setSelectedRoutine(null)
          setTab('routines')
        }
        setRoutineActionStatus('Routine deleted.')
      } else {
        const data = (await res.json().catch(() => ({}))) as { detail?: string }
        setRoutineActionStatus(data.detail || (res.status >= 502 && res.status <= 504 ? 'Service waking up. Please retry.' : 'Could not delete routine.'))
      }
    } catch (err: unknown) {
      setRoutineActionStatus(err instanceof Error ? err.message : 'Could not delete routine.')
    } finally {
      setDeletingRoutineId(null)
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

  const applySelectedRoutine = (routine: Routine) => {
    setSelectedRoutine(routine)
    setEditName(routine.name)
    setEditInstruction(routine.action_prompt)
    const trigger = routine.trigger_definition || {}
    setEditWhen(trigger.when || '')
    setEditEventType(trigger.event_type || routine.event_type || '')
    const filters = trigger.filters || {}
    const filterConditions = Array.isArray(filters.conditions)
      ? (filters.conditions as Record<string, unknown>[])
      : [filters as Record<string, unknown>]
    const firstFilter = filterConditions.find(
      (condition) => condition.field !== 'payload.repository' && condition.field !== 'payload.channel_id',
    ) || {}
    setEditFilterField(typeof firstFilter.field === 'string' ? firstFilter.field : '')
    setEditFilterOperator(firstFilter.operator === 'contains' ? 'contains' : 'equals')
    setEditFilterValue(
      typeof firstFilter.value === 'string' || typeof firstFilter.value === 'number'
        ? String(firstFilter.value)
        : '',
    )
    setEditingRoutine(false)
  }

  const handleOpenRoutine = async (routineId: string) => {
    setRoutineActionStatus('')
    setFormError('')
    routineActivityRequestRef.current += 1
    const cachedRoutine = routines.find((routine) => routine.id === routineId)
    if (cachedRoutine) {
      // The list already contains the full routine definition. Open it immediately
      // and load execution history separately; do not wait for another detail API call.
      applySelectedRoutine(cachedRoutine)
      setRoutineRuns([])
      setTab('detail')
      void loadRoutineActivity(routineId)
      return
    }
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(routineId)}`, { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not open routine.')
      const routine = data.routine as Routine
      applySelectedRoutine(routine)
      setRoutineRuns([])
      setTab('detail')
      void loadRoutineActivity(routineId)
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
      const data = (await res.json().catch(() => ({}))) as { detail?: string } & Partial<Routine>
      if (!res.ok) throw new Error(data.detail || (res.status >= 502 && res.status <= 504 ? 'Service waking up. Please retry.' : 'Could not save routine.'))
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

    const selectedAccount =
      eventProvider === 'webhook'
        ? null
        : integrationStatus?.[eventProvider].accounts.find(
            (account) => account.provider_account_id === activeEventAccountId,
          )
    if (eventProvider !== 'webhook' && !selectedAccount) {
      setFormError('Choose a connected account before creating this event trigger.')
      return
    }
    if (eventProvider === 'slack' && !integrationStatus?.slack.events_ready) {
      setFormError('Slack event delivery is not ready yet. Orbit’s administrator must finish the one-time Slack app setup.')
      return
    }
    if (eventProvider === 'gmail' && !integrationStatus?.gmail.events_ready) {
      setFormError('Gmail event delivery is not ready yet. Orbit’s administrator must finish the one-time Google Pub/Sub setup.')
      return
    }

    const conditions: Array<Record<string, unknown>> = []
    let resolvedEventType: string
    let whenToRun: string

    if (eventProvider === 'github') {
      if (!githubRepository.trim() || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository.trim())) {
        setFormError('Enter a GitHub repository as owner/repository.')
        return
      }
      if (!githubRepositories.some((item) => item.full_name === githubRepository && item.can_manage_webhooks)) {
        setFormError('Choose a repository where this GitHub account can manage webhooks.')
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
      if (!slackChannel.trim() || !slackChannels.some((item) => item.name === slackChannel && item.is_member)) {
        setFormError('Choose a Slack channel where the Orbit app is a member.')
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
      const mailbox = selectedAccount?.account_name || 'the connected inbox'
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
        provider_account_id: selectedAccount?.provider_account_id,
        provider_account_name: selectedAccount?.account_name,
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
      const data = (await res.json().catch(() => ({}))) as { detail?: string; routine?: Routine; webhook_url?: string }
      if (!res.ok) throw new Error(data.detail || (res.status >= 502 && res.status <= 504 ? 'Service waking up. Please retry.' : 'Could not create event routine.'))

      const created = data.routine as Routine
      setRoutines((items) => [created, ...items.filter((item) => item.id !== created.id)])
      setSelectedRoutine(created)
      setEditingRoutine(false)
      setRoutineActionStatus(
        eventProvider === 'github'
          ? 'Routine created. Orbit registered a webhook on the selected repository.'
          : eventProvider === 'slack'
            ? 'Routine created. Orbit is listening for matching Slack events.'
            : eventProvider === 'gmail'
              ? 'Routine created. New matching emails will start runs.'
              : 'Routine created. Copy the webhook URL and key below, then send a POST when your event occurs.',
      )
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
    const popup = window.open('about:blank', 'orbit-event-integration', 'popup,width=600,height=720')
    if (!popup) {
      setFormError('Allow pop-ups to connect this account.')
      return
    }
    integrationPopupRef.current = popup
    try {
      const res = await fetch(`/api/integrations/${provider}/oauth/start`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || `Could not connect ${provider}.`)
      if (typeof data.auth_url !== 'string') throw new Error('The provider did not return an authorization URL.')
      popup.location.href = data.auth_url
      popup.focus()
    } catch (err: unknown) {
      popup.close()
      integrationPopupRef.current = null
      setFormError(err instanceof Error ? err.message : `Could not connect ${provider}.`)
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
        const errData = (await res.json().catch(() => ({}))) as { detail?: string }
        setFormError(errData.detail || (res.status >= 502 && res.status <= 504 ? 'Service waking up. Please retry.' : 'Could not schedule routine.'))
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
      eventAccountId &&
      integrationStatus[eventProvider].accounts.some(
        (account) => account.provider_account_id === eventAccountId,
      ) &&
      integrationStatus.token_storage_configured &&
      integrationStatus.public_url_configured &&
      integrationStatus.webhook_payload_limit_configured &&
      (eventProvider !== 'slack' || integrationStatus.slack.events_ready) &&
      (eventProvider !== 'gmail' || integrationStatus.gmail.events_ready) &&
      (eventProvider !== 'github' || integrationStatus.github.configured),
    )



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
                        {integrationStatus?.[eventProvider].accounts.length ? (
                          <div className="event-connection-panel connected event-account-picker">
                            <span className="event-connection-dot" />
                            <div className="event-account-picker-copy">
                              <strong>Choose a connected account</strong>
                              <select
                                aria-label={`Connected ${eventProvider} account`}
                                value={activeEventAccountId}
                                onChange={(e) => setEventAccountId(e.target.value)}
                              >
                                {integrationStatus[eventProvider].accounts.map((account) => (
                                  <option key={account.provider_account_id} value={account.provider_account_id}>
                                    {account.account_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="routine-secondary-button"
                              disabled={!integrationStatus?.[eventProvider].configured || !integrationStatus?.token_storage_configured || !integrationStatus?.public_url_configured || creatingRoutine}
                              onClick={() => void handleConnectIntegration(eventProvider)}
                            >
                              Connect another
                            </button>
                          </div>
                        ) : (
                          <div className="event-connection-panel">
                            <div>
                              <strong>{integrationStatus ? 'Account not connected' : 'Checking connection…'}</strong>
                              <p>
                                {integrationStatus?.[eventProvider].configured
                                  ? 'Connect in a secure sign-in window, then return here.'
                                  : 'Orbit’s administrator needs to configure this provider’s OAuth credentials.'}
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
                        {eventProvider !== 'github' && integrationStatus && (
                          <div className="event-provider-help">
                            <strong>Orbit-managed event delivery</strong>
                            <p>
                              {eventProvider === 'slack'
                                ? integrationStatus.slack.events_ready
                                  ? 'Ready. Orbit’s Slack Events API endpoint is configured for all connected workspaces.'
                                  : 'Not ready yet. Orbit’s administrator must finish the one-time Slack app Events API setup. You do not need to configure your own Slack app.'
                                : integrationStatus.gmail.events_ready
                                  ? 'Ready. Orbit’s Google Pub/Sub delivery is configured for connected mailboxes.'
                                  : 'Not ready yet. Orbit’s administrator must configure Google Pub/Sub once for Orbit. You do not need to create a Google Cloud project.'}
                            </p>
                          </div>
                        )}
                        {integrationStatus && (
                          <div className="event-prerequisite-list">
                            {!integrationStatus.token_storage_configured && <small>Orbit setup needed: secure provider token storage is not configured.</small>}
                            {!integrationStatus.public_url_configured && <small>Orbit setup needed: public HTTPS callback URL is missing.</small>}
                            {!integrationStatus.webhook_payload_limit_configured && <small>Orbit setup needed: webhook payload limit is missing.</small>}
                            {eventProvider === 'github' && !integrationStatus.github.configured && <small>Orbit setup needed: GitHub OAuth credentials are missing.</small>}
                            {eventProvider === 'slack' && !integrationStatus.slack.events_ready && <small>Slack event delivery is not ready yet; contact your Orbit administrator.</small>}
                            {eventProvider === 'gmail' && !integrationStatus.gmail.events_ready && <small>Gmail event delivery is not ready yet; contact your Orbit administrator.</small>}
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
                            <select
                              id="github-repository"
                              value={githubRepository}
                              onChange={(e) => setGithubRepository(e.target.value)}
                              disabled={!eventAccountId || loadingEventResources || !githubRepositories.length}
                              required
                            >
                              <option value="">
                                {loadingEventResources ? 'Loading repositories…' : 'Choose a repository'}
                              </option>
                              {githubRepositories.map((repository) => (
                                <option
                                  key={repository.full_name}
                                  value={repository.full_name}
                                  disabled={!repository.can_manage_webhooks}
                                >
                                  {repository.full_name}{repository.private ? ' · Private' : ''}{repository.can_manage_webhooks ? '' : ' · Admin access required'}
                                </option>
                              ))}
                            </select>
                            <small>
                              {loadingEventResources
                                ? 'Loading repositories from the selected GitHub account.'
                                : githubRepositories.length
                                  ? 'Orbit can register a webhook on repositories where this account has admin access.'
                                  : 'No repositories are available for this account, or the account could not list them.'}
                            </small>
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
                            <select
                              id="slack-channel"
                              value={slackChannel}
                              onChange={(e) => setSlackChannel(e.target.value)}
                              disabled={!eventAccountId || loadingEventResources || !slackChannels.length}
                              required
                            >
                              <option value="">
                                {loadingEventResources ? 'Loading channels…' : 'Choose a channel'}
                              </option>
                              {slackChannels.map((channel) => (
                                <option key={channel.id} value={channel.name} disabled={!channel.is_member}>
                                  #{channel.name}{channel.is_private ? ' · Private' : ''}{channel.is_member ? '' : ' · Invite Orbit first'}
                                </option>
                              ))}
                            </select>
                            <small>
                              {loadingEventResources
                                ? 'Loading channels from the selected Slack workspace.'
                                : 'Only channels where Orbit has been added can receive event triggers.'}
                            </small>
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
              </div>
              <div className="routine-sidebar-list">
                {loading && routines.length === 0 && <div className="routine-sidebar-message">Loading routines…</div>}
                {routineLoadError && <div className="routine-sidebar-message" role="alert">{routineLoadError}</div>}
                {!loading && routines.length === 0 && (
                  <div className="routine-sidebar-message">No routines yet. Ask Orbit in chat to create a routine or reminder!</div>
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
                  <h3>{routines.length > 0 ? 'Select a routine' : 'No routines configured'}</h3>
                  <p>
                    {routines.length > 0
                      ? 'Choose a routine from the sidebar to inspect its instructions, trigger, and recent run history.'
                      : 'You do not need to register routines here. Tell Orbit in chat what you want to automate!'}
                  </p>
                  <div className="routine-chat-creation-tip">
                    <div className="routine-chat-tip-header">
                      <Icon name="sparkles" size={15} />
                      <span>Create routines directly in chat</span>
                    </div>
                    <p className="routine-chat-tip-subtitle">
                      Simply type what you want in normal chat. Orbit registers event triggers and scheduled tasks automatically:
                    </p>
                    <div className="routine-chat-tip-examples">
                      <div className="routine-chat-example">
                        <code>"Whenever a new issue comes in owner/repo, summarize it and tell me"</code>
                      </div>
                      <div className="routine-chat-example">
                        <code>"Remind me every weekday at 9:00 AM to review pull requests"</code>
                      </div>
                      <div className="routine-chat-example">
                        <code>"When an alert arrives via webhook, analyze the payload"</code>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <section className="routine-detail">
                  <div className="routine-detail-overview">
                    <header className="routine-overview-header routine-name-only-header">
                      <div className="routine-overview-title-copy">
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
                      </div>
                    </header>

                    <section className="routine-overview-block routine-instruction-only">
                      <div className="routine-overview-block-heading">
                        <span className="routine-manager-eyebrow">INSTRUCTION</span>
                        <h4>What Orbit should do</h4>
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
                        <p className="routine-overview-instruction">{selectedRoutine.action_prompt}</p>
                      )}
                    </section>
                  </div>

                  <section className="routine-activity-overview routine-history-only">
                    <div className="routine-activity-heading">
                      <span className="routine-manager-eyebrow">RUN HISTORY</span>
                      <button
                        type="button"
                        className="routine-text-button"
                        onClick={() => void loadRoutineActivity(selectedRoutine.id)}
                      >
                        <Icon name="refresh" size={13} />
                        Refresh
                      </button>
                    </div>

                    <div className="routine-run-history">
                      {routineRuns.length === 0 ? (
                        <p className="routine-empty-inline">
                          No executions yet. Test this routine or wait for its next trigger.
                        </p>
                      ) : (
                        <div className="routine-run-list routine-run-list-compact">
                          {routineRuns.map((run) => (
                            <button
                              type="button"
                              key={run.id}
                              className={'routine-run-row-btn' + (openingRunId === run.id ? ' opening' : '')}
                              onClick={() => void handleOpenRun(run)}
                              disabled={openingRunId === run.id}
                            >
                              <span className="routine-run-row-left">
                                <time dateTime={run.created_at}>
                                  {new Date(run.created_at).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </time>
                              </span>
                              <span className={'routine-run-status ' + run.status.toLowerCase()}>
                                {run.status}
                              </span>
                              <Icon name="chevronRight" size={12} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

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
                        <button type="button" className="routine-danger-button" disabled={deletingRoutineId === selectedRoutine.id} onClick={() => void handleDelete(selectedRoutine.id)}>
                          <Icon name="trash" size={13} />
                          {deletingRoutineId === selectedRoutine.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </section>
              )}
            </main>
          </div>
        )}
      </div>
    </ModernDialog>
  )
}
