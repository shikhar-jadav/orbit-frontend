import { Component, Fragment, lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import './OrbitDesign.css'
import { Icon } from './components/Icon'
import { ThreadSidebar } from './components/ThreadSidebar'
import { ChatWorkspace } from './components/ChatWorkspace'
import { ModernDialog } from './components/ModernDialog'
import type { CanvasItem } from './components/UniversalCanvas'
import { AuthScreen, type AuthViewMode } from './components/AuthScreen'
import type {
  ProactiveNotification,
  RoutineExecutionPreview,
} from './components/ProactiveRoutinesModal'

type MarketplaceBoundaryState = { hasError: boolean; retryKey: number }

class MarketplaceErrorBoundary extends Component<{ children: ReactNode }, MarketplaceBoundaryState> {
  state: MarketplaceBoundaryState = { hasError: false, retryKey: 0 }

  static getDerivedStateFromError(): Partial<MarketplaceBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('Marketplace crashed while rendering:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel-lazy-loading" role="alert" style={{ flexDirection: 'column', gap: 12, padding: 24 }}>
          <strong>Marketplace could not be displayed.</strong>
          <span style={{ color: 'var(--text-muted, #999)', fontSize: 13 }}>The rest of Orbit is still available. Try loading Marketplace again.</span>
          <button
            type="button"
            onClick={() => this.setState((state) => ({ hasError: false, retryKey: state.retryKey + 1 }))}
            style={{ padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}
          >
            Retry Marketplace
          </button>
        </div>
      )
    }
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>
  }
}

const preloadSettings = () => import('./components/SettingsPanel')
const preloadMarketplace = () => import('./components/MarketplaceView')
const preloadCanvas = () => import('./components/UniversalCanvas')
const preloadRoutines = () => import('./components/ProactiveRoutinesModal')

const SettingsPanel = lazy(() => preloadSettings().then((m) => ({ default: m.SettingsPanel })))
const MarketplaceView = lazy(() => preloadMarketplace().then((m) => ({ default: m.MarketplaceView })))
const UniversalCanvas = lazy(() => preloadCanvas().then((m) => ({ default: m.UniversalCanvas })))
const ProactiveRoutinesModal = lazy(() => preloadRoutines().then((m) => ({ default: m.ProactiveRoutinesModal })))
import {
  clearRecentAccounts,
  rememberRecentAccount,
  type RecentAuthAccount,
} from './components/userUtils'
import { collapseRepeatedResponse, deduplicateMessageParts, extractRemainingMessageText } from './components/messagePartUtils'

import type {
  AuthSessionResponse,
  AuthUser,
  Message,
  MessageAttachment,
  MessageVariant,
  MessagePart,
  Settings,
  SettingsSection,
  SidebarThread,
  Thread,
  ToolEvent,
  UserPreferences,
  HITLCardRequest,
  HITLQuestionItem,
  HITLSubmission,
} from './components/types'

type ThreadPageResponse = {
  items: Thread[]
  has_more: boolean
  next_offset: number
}

type ThreadHistoryResponse = {
  thread: Thread
  messages: Message[]
  has_more_messages: boolean
}

type ThreadUpdatesResponse = {
  messages: Message[]
  has_more: boolean
}

let onUnauthorizedCallback: (() => void) | null = null


class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

async function apiError(message: string, response: Response): Promise<never> {
  if (response.status === 401) {
    onUnauthorizedCallback?.()
  }

  let detail: string | undefined
  const ct = response.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try {
      const body = (await response.json()) as { detail?: string }
      if (typeof body?.detail === 'string' && body.detail.trim()) {
        detail = body.detail.trim()
      }
    } catch {
      // Ignore JSON parse failure
    }
  }

  const fallback =
    response.status >= 502 && response.status <= 504
      ? 'Backend service is waking up or temporarily unavailable. Please retry in a few seconds.'
      : message || `Request failed (${response.status}).`

  const msg = detail || fallback
  if (response.status === 401) throw new UnauthorizedError(msg)
  throw new Error(msg)
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) return await apiError(`Request failed (${response.status}).`, response)
  const ct = response.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    throw new Error('Backend service returned an unexpected HTML response. The server may be sleeping or starting up.')
  }
  return (await response.json()) as T
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) return await apiError(`Request failed (${response.status}).`, response)
  const ct = response.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    throw new Error('Backend service returned an unexpected HTML response. The server may be sleeping or starting up.')
  }
  return (await response.json()) as T
}


function readAuthViewFromPath(path: string): AuthViewMode | undefined {
  if (path === '/signup') return 'signup'
  if (path === '/forgot-password') return 'recovery'
  if (path === '/logged-out' || path === '/logout') return 'logged-out'
  if (path === '/login') return 'login'
  return undefined
}

function authPathFromView(view: AuthViewMode): string {
  if (view === 'signup') return '/signup'
  if (view === 'recovery') return '/forgot-password'
  if (view === 'logged-out') return '/logged-out'
  return '/login'
}

function readRoute() {
  const path = window.location.pathname
  const hash = window.location.hash
  const match = path.match(/^\/c\/([^/]+)\/?$/)
  let settingsSection: SettingsSection = 'general'
  if (hash === '#account') settingsSection = 'account'
  else if (hash === '#appearance') settingsSection = 'appearance'
  else if (hash === '#capabilities') settingsSection = 'capabilities'
  else if (hash === '#integrations') settingsSection = 'integrations'
  const settingsOpen =
    hash === '#settings' ||
    hash === '#account' ||
    hash === '#appearance' ||
    hash === '#capabilities' ||
    hash === '#integrations'
  return {
    threadId: match ? decodeURIComponent(match[1]) : null,
    settings: settingsOpen,
    settingsSection,
    marketplace: hash === '#marketplace',
    authView: readAuthViewFromPath(path),
  }
}



function playNotificationChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch {
    // AudioContext blocked
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}


function routineExecutionToChatMessages(execution: RoutineExecutionPreview): Message[] {
  const routine = execution.routine
  const run = execution.run
  const messages = execution.messages
  const promptEntry = messages.find((entry) => entry.entry_type === 'prompt')
  const instruction = String((promptEntry && promptEntry.content) || routine.action_prompt || '').trim()
  const userContent = instruction || ('Run routine: ' + routine.name)

  const assistantParts: MessagePart[] = []
  const assistantTools: ToolEvent[] = []
  const textParts: string[] = []
  const pendingTools = new Map<string, ToolEvent>()
  let finalResult = ''

  const addText = (value: string) => {
    if (!value.trim()) return
    textParts.push(value)
    assistantParts.push({ type: 'text', text: value })
  }

  const findPendingTool = (name: string) =>
    [...pendingTools.entries()].reverse().find(
      ([, tool]) => tool.name === name && tool.status === 'running',
    )

  for (const entry of messages) {
    const details = isRecord(entry.details) ? entry.details : {}
    const title = entry.title || 'Execution activity'
    const content = entry.content || ''

    if (
      entry.entry_type === 'prompt' ||
      entry.entry_type === 'trigger' ||
      entry.entry_type === 'status'
    ) {
      continue
    }

    if (entry.entry_type === 'error') {
      if (!finalResult) {
        addText('**Error:** ' + content)
      }
      continue
    }

    if (entry.entry_type === 'assistant') {
      finalResult = content
      addText(content)
      continue
    }

    if (entry.entry_type === 'tool') {
      const name = String(details.tool || title.replace(/^Running |^Finished /, '') || 'tool')
      const callId = String(details.tool_call_id || ('routine-' + run.id + '-tool-' + entry.id))
      let tool = pendingTools.get(callId)

      if (entry.status === 'completed') {
        if (!tool) {
          const matchingPending = findPendingTool(name)
          if (matchingPending) tool = matchingPending[1]
        }
        if (!tool) {
          tool = {
            id: callId,
            name,
            args: {},
            status: 'done',
          }
          assistantTools.push(tool)
          assistantParts.push({ type: 'tool', tool })
        }
        tool.output = content
        tool.status = 'done'
        pendingTools.set(callId, tool)
      } else {
        tool = {
          id: callId,
          name,
          args: isRecord(details.args) ? details.args : {},
          status: 'running',
        }
        assistantTools.push(tool)
        assistantParts.push({ type: 'tool', tool })
        pendingTools.set(callId, tool)
      }
    }
  }

  if (!finalResult) {
    finalResult = String(run.result_summary || run.error || 'No final result was saved for this execution.')
    addText(finalResult)
  }

  const assistantContent = textParts.join('\n\n')
  return [
    {
      id: 'routine-run-user-' + run.id,
      role: 'user',
      content: userContent,
      created_at: (promptEntry && promptEntry.created_at) || run.created_at,
    },
    {
      id: 'routine-run-assistant-' + run.id,
      role: 'assistant',
      content: assistantContent,
      created_at: run.completed_at || run.created_at,
      tools: assistantTools,
      parts: assistantParts,
    },
  ]
}

function App() {
  // Keep Render's free web service warm while Orbit is open. This is deliberately
  // fire-and-forget: it never blocks rendering, auth, navigation, or chat requests.
  useEffect(() => {
    let stopped = false
    let inFlight = false
    let timeoutId: number | undefined

    const pingBackend = () => {
      if (
        stopped ||
        inFlight ||
        document.visibilityState !== 'visible' ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) return

      inFlight = true
      const controller = new AbortController()
      timeoutId = window.setTimeout(() => controller.abort(), 8000)

      void fetch('/health', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        keepalive: true,
        signal: controller.signal,
      })
        .catch(() => {
          // A heartbeat is best-effort; normal app requests handle user-facing errors.
        })
        .finally(() => {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId)
          inFlight = false
        })
    }

    // Wake the service on page entry, then keep it warm every 10 minutes.
    pingBackend()
    const intervalId = window.setInterval(pingBackend, 10 * 60 * 1000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') pingBackend()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopped = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [])

  const initialRoute = readRoute()
  const [authLoading, setAuthLoading] = useState(true)
  const [backendBootMessage, setBackendBootMessage] = useState('Connecting to Orbit…')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [hasUsers, setHasUsers] = useState(true)
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false)
  const [unusedRecoveryCodes, setUnusedRecoveryCodes] = useState(0)
  const [authMessage, setAuthMessage] = useState('')
  const [authView, setAuthView] = useState<AuthViewMode>(initialRoute.authView ?? 'login')
  const [authScreenNonce, setAuthScreenNonce] = useState(0)
  const [lastSignedOutUser, setLastSignedOutUser] = useState<RecentAuthAccount | null>(null)
  const [revokedAllDevices, setRevokedAllDevices] = useState(false)
  const [logoutConfirmMode, setLogoutConfirmMode] = useState<
    'logout-active' | 'logout-all' | 'switch-active' | null
  >(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    window.matchMedia('(min-width: 1024px)').matches,
  )
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.matchMedia('(min-width: 1024px)').matches,
  )

  useEffect(() => {
    const breakpoint = window.matchMedia('(min-width: 1024px)')
    const syncLayout = () => {
      const largeScreen = breakpoint.matches
      setIsLargeScreen(largeScreen)
      setSidebarOpen(largeScreen)
    }

    breakpoint.addEventListener('change', syncLayout)
    return () => breakpoint.removeEventListener('change', syncLayout)
  }, [])

  useEffect(() => {
    if (isLargeScreen || !sidebarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isLargeScreen, sidebarOpen])

  const [searchOpen, setSearchOpen] = useState(false)
  const [threads, setThreads] = useState<Thread[]>([])
  const [hasMoreThreads, setHasMoreThreads] = useState(false)
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialRoute.threadId)
  const [pendingRoutineExecution, setPendingRoutineExecution] = useState<RoutineExecutionPreview | null>(null)
  const [settingsPage, setSettingsPage] = useState(initialRoute.settings)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialRoute.settingsSection)
  const [capabilitiesInitialTab, setCapabilitiesInitialTab] = useState<'skills' | 'connectors'>('skills')
  const [marketplaceInitialTab, setMarketplaceInitialTab] = useState<'all' | 'connectors' | 'skills'>('all')
  const [marketplaceInitialConnectorId, setMarketplaceInitialConnectorId] = useState<string | null>(null)
  const [marketplacePage, setMarketplacePage] = useState(initialRoute.marketplace)
  const [threadMenuId, setThreadMenuId] = useState<string | null>(null)
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingThread, setDeletingThread] = useState<Thread | null>(null)
  const [settings, setSettings] = useState<Settings>({ model: null, provider_index: null })
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    language: 'auto',
    send_shortcut: 'enter',
    appearance: 'dark',
  })
  const [input, setInput] = useState('')
  const [routinesModalOpen, setRoutinesModalOpen] = useState(false)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [inAppToast, setInAppToast] = useState<ProactiveNotification | null>(null)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('orbit_notification_sound')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem('orbit_notification_sound', String(next))
      } catch { /* Browser APIs may be unavailable. */ }
      return next
    })
  }

  // Proactive notification stream listener
  useEffect(() => {
    if (!currentUser) return
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource('/api/notifications/stream')

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'init') {
            setUnreadNotifCount(parsed.unread_count || 0)
          } else if (parsed.type === 'proactive_notification' && parsed.notification) {
            const notif = parsed.notification as ProactiveNotification
            setUnreadNotifCount((c) => c + 1)

            if (soundEnabled) {
              playNotificationChime()
            }

            if (activeThreadId) {
              getJson<ThreadHistoryResponse>(
                `/threads/${encodeURIComponent(activeThreadId)}?limit=20&include_extras=false`,
              ).then((data) => {
                if (data.messages) {
                  setMessages(data.messages)
                  setHasOlderMessages(data.has_more_messages)
                }
              }).catch(() => undefined)
            }

            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
              setInAppToast(notif)
              window.setTimeout(() => {
                setInAppToast((curr) => (curr?.id === notif.id ? null : curr))
              }, 7000)
            } else if (
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted'
            ) {
              try {
                new Notification(notif.title, {
                  body: notif.message.slice(0, 160),
                  icon: '/favicon.ico',
                })
              } catch { /* Browser APIs may be unavailable. */ }
            }
          }
        } catch {
          // ignore parse error
        }
      }

      eventSource.onerror = () => {
        eventSource?.close()
      }
    } catch { /* Browser APIs may be unavailable. */ }

    return () => {
      eventSource?.close()
    }
  }, [currentUser, soundEnabled, activeThreadId])
  const [attachments, setAttachments] = useState<File[]>([])
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState<string | number | null>(null)
  const [messageMenuId, setMessageMenuId] = useState<string | number | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [activeCanvas, setActiveCanvas] = useState<CanvasItem | null>(null)
  const [workspaceChangeVersion, setWorkspaceChangeVersion] = useState(0)
  const [hitlRequest, setHitlRequest] = useState<HITLCardRequest | null>(null)


  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // A ref is an immediate mutex: React state alone cannot stop two Enter/click events
  // arriving before the next render.
  const sendInFlightRef = useRef(false)
  const skipLoadThreadRef = useRef<string | null>(null)
  const preserveHistoryScrollRef = useRef<{ height: number; top: number } | null>(null)
  const latestMessageIdRef = useRef(0)

  useEffect(() => {
    if (!activeThreadId) return
    const events = new EventSource(
      `/threads/${encodeURIComponent(activeThreadId)}/workspace/events`,
      { withCredentials: true },
    )
    events.onmessage = () => setWorkspaceChangeVersion((version) => version + 1)
    return () => events.close()
  }, [activeThreadId])

  const visibleThreads = useMemo<SidebarThread[]>(() => {
    const query = deferredSearch.trim().toLowerCase()
    // Filter out inactive orphan threads (0 messages, no branch, not active)
    const validThreads = threads.filter(
      (t) => (t.message_count && t.message_count > 0) || t.parent_thread_id || t.thread_id === activeThreadId,
    )
    const matches = new Set(
      validThreads
        .filter((thread) => !query || (thread.title || '').toLowerCase().includes(query))
        .map((thread) => thread.thread_id),
    )
    if (query) {
      for (const thread of validThreads) {
        if (!matches.has(thread.thread_id)) continue
        let parentId = thread.parent_thread_id
        while (parentId) {
          matches.add(parentId)
          parentId = validThreads.find((item) => item.thread_id === parentId)?.parent_thread_id
        }
      }
    }

    const childrenByParent = new Map<string, Thread[]>()
    const roots: Thread[] = []
    for (const thread of validThreads) {
      if (!matches.has(thread.thread_id)) continue
      if (thread.parent_thread_id && validThreads.some((item) => item.thread_id === thread.parent_thread_id)) {
        const siblings = childrenByParent.get(thread.parent_thread_id) ?? []
        siblings.push(thread)
        childrenByParent.set(thread.parent_thread_id, siblings)
      } else {
        roots.push(thread)
      }
    }

    const flattened: SidebarThread[] = []
    const visited = new Set<string>()
    const appendTree = (thread: Thread, depth: number) => {
      if (visited.has(thread.thread_id)) return
      visited.add(thread.thread_id)
      flattened.push({ ...thread, depth })
      for (const child of childrenByParent.get(thread.thread_id) ?? []) {
        appendTree(child, depth + 1)
      }
    }
    roots.forEach((thread) => appendTree(thread, 0))
    for (const thread of validThreads) {
      if (matches.has(thread.thread_id) && !visited.has(thread.thread_id)) {
        appendTree(thread, 0)
      }
    }
    return flattened
  }, [deferredSearch, threads, activeThreadId])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const updateScreenSize = () => setIsLargeScreen(mediaQuery.matches)
    updateScreenSize()
    mediaQuery.addEventListener('change', updateScreenSize)
    return () => mediaQuery.removeEventListener('change', updateScreenSize)
  }, [])

  const refreshThreads = useCallback(async () => {
    try {
      const limit = Math.max(30, Math.min(threads.length, 150))
      const data = await getJson<ThreadPageResponse>(`/threads/page?limit=${limit}&offset=0`)
      setThreads(data.items)
      setHasMoreThreads(data.has_more)
    } catch {
      // silently fail if refresh fails
    }
  }, [threads.length])

  const loadMoreThreads = useCallback(async () => {
    if (!hasMoreThreads || loadingMoreThreads) return
    setLoadingMoreThreads(true)
    try {
      const data = await getJson<ThreadPageResponse>(
        `/threads/page?limit=30&offset=${threads.length}`,
      )
      setThreads((current) => {
        const existing = new Set(current.map((thread) => thread.thread_id))
        return [...current, ...data.items.filter((thread) => !existing.has(thread.thread_id))]
      })
      setHasMoreThreads(data.has_more)
    } catch {
      // Keep already-loaded sidebar items available if another page fails.
    } finally {
      setLoadingMoreThreads(false)
    }
  }, [hasMoreThreads, loadingMoreThreads, threads])

  const clearWorkspaceState = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setThreads([])
    setHasMoreThreads(false)
    setLoadingMoreThreads(false)
    setMessages([])
    setHasOlderMessages(false)
    setLoadingOlderMessages(false)
    setActiveCanvas(null)
    setAttachments([])
    setPendingRoutineExecution(null)
    setSettings({ model: null, provider_index: null })
    setUserPreferences({ language: 'auto', send_shortcut: 'enter', appearance: 'dark' })
    setSettingsPage(false)
    setMarketplacePage(false)
    setDeletingThread(null)
    setError('')
    setSending(false)
    setLoadingThread(false)
  }, [])

  const handleUnauthorized = useCallback(() => {
    clearWorkspaceState()
    setLogoutConfirmMode(null)
    setCurrentUser(null)
    setHasUsers(true)
    setLastSignedOutUser(null)
    setRevokedAllDevices(false)
    setAuthView('login')
    setAuthScreenNonce((n) => n + 1)
    setAuthMessage('Your session has expired. Sign in again to continue.')
  }, [clearWorkspaceState])

  useEffect(() => {
    onUnauthorizedCallback = handleUnauthorized
    return () => {
      onUnauthorizedCallback = null
    }
  }, [handleUnauthorized])

  useEffect(() => {
    let active = true
    let requestController: AbortController | null = null
    const retryDelaysMs = [1500, 3000, 5000, 8000, 10000]

    const loadInitialSession = async () => {
      let attempts = 0

      while (active) {
        requestController = new AbortController()
        const timeoutId = window.setTimeout(() => requestController?.abort(), 15000)

        try {
          const response = await fetch('/auth/session', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: requestController.signal,
          })
          const contentType = response.headers.get('content-type') || ''

          if (response.ok && contentType.includes('application/json')) {
            const session = (await response.json()) as AuthSessionResponse
            if (!active) return

            setAuthMessage('')
            setHasUsers(session.has_users)
            if (!session.has_users) {
              clearRecentAccounts()
            }
            setEmailOtpEnabled(Boolean(session.email_otp_enabled))
            if (session.authenticated && session.user) {
              rememberRecentAccount(session.user)
              setCurrentUser(session.user)
              setUnusedRecoveryCodes(session.unused_recovery_codes ?? 0)
            } else {
              setCurrentUser(null)
            }
            setAuthLoading(false)
            return
          }

          const retryableStatus =
            response.status >= 500 ||
            response.status === 408 ||
            response.status === 425 ||
            response.status === 429 ||
            response.ok

          if (!retryableStatus) {
            if (active) {
              setCurrentUser(null)
              setAuthMessage(`Orbit could not complete its startup check (HTTP ${response.status}). Please try again.`)
              setAuthLoading(false)
            }
            return
          }
        } catch {
          // A cold start, proxy timeout, or temporary network error is retried below.
        } finally {
          window.clearTimeout(timeoutId)
          requestController = null
        }

        if (!active) return
        attempts += 1
        if (attempts === 1) {
          setBackendBootMessage('Orbit is waking up. Reconnecting automatically…')
        }

        const delayMs = retryDelaysMs[Math.min(attempts - 1, retryDelaysMs.length - 1)]
        await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
      }
    }

    void loadInitialSession()
    return () => {
      active = false
      requestController?.abort()
    }
  }, [])

  useEffect(() => {
    if (!logoutConfirmMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loggingOut) {
        setLogoutConfirmMode(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [logoutConfirmMode, loggingOut])

  const currentUserId = currentUser?.user_id ?? null

  useEffect(() => {
    if (currentUserId) return undefined
    const onPopState = () => {
      const nextView = readAuthViewFromPath(window.location.pathname)
      if (nextView) {
        setAuthView(nextView)
        setAuthScreenNonce((n) => n + 1)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [currentUserId])

  const handleAuthenticated = useCallback((user: AuthUser, unusedCodes?: number) => {
    rememberRecentAccount(user)
    setCurrentUser(user)
    setHasUsers(true)
    if (unusedCodes !== undefined) setUnusedRecoveryCodes(unusedCodes)
    setLastSignedOutUser(null)
    setRevokedAllDevices(false)
    setAuthMessage('')
    setError('')
    const path = window.location.pathname
    if (
      path === '/login' ||
      path === '/signup' ||
      path === '/forgot-password' ||
      path === '/logged-out' ||
      path === '/logout'
    ) {
      window.history.pushState({}, '', '/')
    }
  }, [])

  const logout = useCallback(
    async (
      notice?: string,
      options?: { revokeAll?: boolean; targetView?: AuthViewMode; forgetUser?: boolean },
    ) => {
      const revokeAll = Boolean(options?.revokeAll)
      const forgetUser = Boolean(options?.forgetUser)
      const targetView: AuthViewMode = options?.targetView ?? (forgetUser ? 'login' : 'logged-out')
      const signingOutProfile: RecentAuthAccount | null =
        currentUser && !forgetUser
          ? {
              user_id: currentUser.user_id,
              email: currentUser.email,
              display_name: currentUser.display_name,
              avatar_color: currentUser.avatar_color,
              role: currentUser.role,
              last_used_at: new Date().toISOString(),
            }
          : null

      setLoggingOut(true)
      try {
        const response = revokeAll
          ? await fetch('/auth/logout-all', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ keep_current: false }),
            })
          : await fetch('/auth/logout', {
              method: 'POST',
              credentials: 'same-origin',
            })

        const result = (await response.json().catch(() => ({}))) as {
          logged_out?: boolean
          signed_out_current?: boolean
          detail?: string
        }
        if (!response.ok) {
          throw new Error(result.detail || `Logout failed (${response.status}).`)
        }
        const serverConfirmed = revokeAll
          ? result.signed_out_current === true
          : result.logged_out === true
        if (!serverConfirmed) {
          throw new Error('The server did not confirm that this session was signed out.')
        }
      } catch (logoutError) {
        // A lost response can happen after the server has already cleared the session.
        // Only leave the workspace when the session endpoint confirms it is no longer valid.
        let serverConfirmsSignedOut = false
        try {
          const sessionResponse = await fetch('/auth/session', { credentials: 'same-origin' })
          if (sessionResponse.ok) {
            const session = (await sessionResponse.json()) as { authenticated?: boolean }
            serverConfirmsSignedOut = session.authenticated === false
          }
        } catch {
          // Keep the current workspace visible when the server cannot be reached.
        }

        if (!serverConfirmsSignedOut) {
          setError(
            logoutError instanceof Error
              ? logoutError.message
              : 'Orbit could not confirm sign out. Please try again.',
          )
          return
        }
      } finally {
        setLoggingOut(false)
        setLogoutConfirmMode(null)
      }
      clearWorkspaceState()
      setActiveThreadId(null)
      setCurrentUser(null)
      setHasUsers(true)
      setLastSignedOutUser(signingOutProfile)
      setRevokedAllDevices(revokeAll)
      setAuthMessage(notice || '')
      setAuthView(targetView)
      setAuthScreenNonce((n) => n + 1)
      window.history.pushState({}, '', authPathFromView(targetView))
    },
    [clearWorkspaceState, currentUser],
  )

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    Promise.all([
      getJson<ThreadPageResponse>('/threads/page?limit=30&offset=0'),
      getJson<Settings>('/settings'),
    ])
      .then(([threadData, settingData]) => {
        if (!active) return
        setThreads(threadData.items)
        setHasMoreThreads(threadData.has_more)
        setSettings(settingData)
      })
      .catch((loadError: unknown) => {
        if (active && !(loadError instanceof UnauthorizedError)) {
          setError(
            loadError instanceof Error ? loadError.message : 'Unable to connect to Orbit agent server.',
          )
        }
      })

    getJson<UserPreferences>('/settings/preferences')
      .then((prefData) => {
        if (!active) return
        setUserPreferences(prefData)
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [currentUserId])

  useEffect(() => {
    const syncRoute = () => {
      const route = readRoute()
      if (route.threadId !== activeThreadId) {
        setPendingRoutineExecution(null)
        setMessages([])
        setHasOlderMessages(false)
        setLoadingOlderMessages(false)
        setActiveCanvas(null)
      }
      setActiveThreadId(route.threadId)
      setSettingsPage(route.settings)
      setSettingsSection(route.settingsSection)
      setMarketplacePage(route.marketplace)
      setError('')
      if (!route.threadId) {
        setMessages([])
        setHasOlderMessages(false)
        setAttachments([])
        setLoadingThread(false)
      }
    }
    window.addEventListener('popstate', syncRoute)
    window.addEventListener('hashchange', syncRoute)
    return () => {
      window.removeEventListener('popstate', syncRoute)
      window.removeEventListener('hashchange', syncRoute)
    }
  }, [activeThreadId])

  const navigateHome = useCallback(() => {
    if (sending && abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    window.history.pushState({}, '', '/')
    setActiveThreadId(null)
    setPendingRoutineExecution(null)
    setSettingsPage(false)
    setMarketplacePage(false)
    setMessages([])
    setHasOlderMessages(false)
    setLoadingOlderMessages(false)
    setLoadingThread(false)
    setError('')
    window.setTimeout(() => inputRef.current?.focus(), 40)
  }, [sending])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        navigateHome()
      }
      if (event.key === 'Escape' && marketplacePage && !settingsPage) {
        const path = window.location.pathname
        window.history.pushState({}, '', path === '/' ? '/' : path)
        setMarketplacePage(false)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [navigateHome, settingsPage, marketplacePage])

  useEffect(() => {
    if (!threadMenuId) return
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.thread-actions')) {
        setThreadMenuId(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setThreadMenuId(null)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [threadMenuId])

  useEffect(() => {
    if (messageMenuId === null) return
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.assistant-actions')) {
        setMessageMenuId(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMessageMenuId(null)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [messageMenuId])

  useEffect(() => {
    if (!deletingThread) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeletingThread(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [deletingThread])

  useEffect(() => {
    if (!currentUser || !activeThreadId) return
    if (skipLoadThreadRef.current === activeThreadId) {
      skipLoadThreadRef.current = null
      return
    }
    let active = true
    setLoadingThread(true)
    setHasOlderMessages(false)
    getJson<ThreadHistoryResponse>(
      `/threads/${encodeURIComponent(activeThreadId)}?limit=20&include_extras=false`,
    )
      .then((data) => {
        if (!active) return
        setMessages(data.messages)
        setHasOlderMessages(data.has_more_messages)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        if (!(loadError instanceof UnauthorizedError)) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load session history.')
        }
        setMessages([])
        setHasOlderMessages(false)
        setAttachments([])
      })
      .finally(() => {
        if (active) setLoadingThread(false)
      })
    return () => {
      active = false
    }
  }, [activeThreadId, currentUser])

  const sendingRef = useRef(sending)
  useEffect(() => {
    sendingRef.current = sending
  }, [sending])

  const loadOlderMessages = useCallback(async () => {
    if (!activeThreadId || !hasOlderMessages || loadingOlderMessages || !messages.length) return
    const beforeId = Number(messages[0].id)
    if (!Number.isFinite(beforeId) || beforeId <= 0) return

    setLoadingOlderMessages(true)
    const scrollElement = scrollRef.current
    const previousScroll = scrollElement
      ? { height: scrollElement.scrollHeight, top: scrollElement.scrollTop }
      : null

    try {
      const data = await getJson<ThreadHistoryResponse>(
        `/threads/${encodeURIComponent(activeThreadId)}?limit=50&before_id=${beforeId}&include_extras=false`,
      )
      if (data.messages.length && previousScroll) {
        preserveHistoryScrollRef.current = previousScroll
      }
      if (data.messages.length) {
        setMessages((current) => [...data.messages, ...current])
      }
      setHasOlderMessages(data.has_more_messages)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load older messages.')
    } finally {
      setLoadingOlderMessages(false)
    }
  }, [activeThreadId, hasOlderMessages, loadingOlderMessages, messages, scrollRef])

  useEffect(() => {
    const ids = messages
      .map((message) => Number(message.id))
      .filter((id) => Number.isFinite(id))
    latestMessageIdRef.current = ids.length ? Math.max(...ids) : 0
  }, [messages])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    if (!currentUser || !activeThreadId) return
    const pollInterval = window.setInterval(() => {
      if (sendingRef.current || document.visibilityState === 'hidden') return
      getJson<ThreadUpdatesResponse>(
        `/threads/${encodeURIComponent(activeThreadId)}/updates?after_id=${latestMessageIdRef.current}`,
      )
        .then((data) => {
          if (!data || !Array.isArray(data.messages) || !data.messages.length) return

          // Cross-tab sync returns persisted rows after the user's message ID.
          // The live SSE response already rendered the assistant message, but its
          // temporary client ID differs from the persisted database ID. Match the
          // completed response by role + content/parts before appending the row.
          const incomingIds = data.messages
            .map((message) => Number(message.id))
            .filter((id) => Number.isFinite(id))
          if (incomingIds.length) {
            latestMessageIdRef.current = Math.max(latestMessageIdRef.current, ...incomingIds)
          }

          setMessages((current) => {
            const knownIds = new Set(current.map((message) => String(message.id)))
            const newMessages = data.messages.filter((incoming) => {
              if (knownIds.has(String(incoming.id))) return false

              const incomingContent = String(incoming.content || '').replace(/\\s+/g, ' ').trim()
              const incomingParts = Array.isArray(incoming.parts) ? incoming.parts : []
              const incomingTools = Array.isArray(incoming.tools) ? incoming.tools : []

              const alreadyRendered = current.some((existing) => {
                if (existing.role !== incoming.role) return false
                const existingContent = String(existing.content || '').replace(/\\s+/g, ' ').trim()

                // Non-empty completed assistant/user content is the stable
                // cross-path identity when the server and optimistic IDs differ.
                if (incomingContent && existingContent === incomingContent) return true

                // Tool-only/empty-content messages can be matched by their
                // persisted structured parts instead.
                if (!incomingContent && !existingContent) {
                  const existingParts = Array.isArray(existing.parts) ? existing.parts : []
                  const existingTools = Array.isArray(existing.tools) ? existing.tools : []
                  if (
                    (incomingParts.length && JSON.stringify(existingParts) === JSON.stringify(incomingParts)) ||
                    (incomingTools.length && JSON.stringify(existingTools) === JSON.stringify(incomingTools))
                  ) return true
                }
                return false
              })

              return !alreadyRendered
            })
            return newMessages.length ? [...current, ...newMessages] : current
          })
        })
        .catch(() => undefined)
    }, 30000)

    return () => window.clearInterval(pollInterval)
  }, [activeThreadId, currentUser])

  useEffect(() => {
    if (!scrollRef.current) return
    const preservedScroll = preserveHistoryScrollRef.current
    if (preservedScroll) {
      preserveHistoryScrollRef.current = null
      scrollRef.current.scrollTop =
        preservedScroll.top + (scrollRef.current.scrollHeight - preservedScroll.height)
      return
    }
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sending, hitlRequest])

  useEffect(() => {
    if (
      currentUser &&
      !activeThreadId &&
      !settingsPage &&
      !marketplacePage &&
      !messages.length &&
      !loadingThread
    ) {
      inputRef.current?.focus()
    }
  }, [activeThreadId, loadingThread, messages.length, settingsPage, marketplacePage, currentUser])

  function navigateThread(threadId: string) {
    if (threadId === activeThreadId && !settingsPage && !marketplacePage) return
    if (sending && abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (threadId !== activeThreadId) {
      setPendingRoutineExecution(null)
      setMessages([])
      setHasOlderMessages(false)
      setLoadingOlderMessages(false)
    }
    window.history.pushState({}, '', `/c/${encodeURIComponent(threadId)}`)
    setActiveThreadId(threadId)
    setSettingsPage(false)
    setMarketplacePage(false)
    setError('')
  }


  const openRoutineExecutionPreview = useCallback((execution: RoutineExecutionPreview) => {
    if (sending && abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    window.history.pushState({}, '', '/')
    setActiveThreadId(null)
    setPendingRoutineExecution(execution)
    setSettingsPage(false)
    setMarketplacePage(false)
    setMessages(routineExecutionToChatMessages(execution))
    setHasOlderMessages(false)
    setLoadingOlderMessages(false)
    setLoadingThread(false)
    setInput('')
    setAttachments([])
    setActiveCanvas(null)
    setHitlRequest(null)
    setError('')
    setRoutinesModalOpen(false)
  }, [sending])


  useEffect(() => {
    const preview = pendingRoutineExecution
    if (!preview || activeThreadId || sending) return
    const status = String(preview.run.status || '').toLowerCase()
    if (['completed', 'failed', 'cancelled', 'skipped'].includes(status)) return

    let active = true
    let requestInFlight = false
    const refreshExecution = async () => {
      if (!active || requestInFlight || document.visibilityState !== 'visible') return
      requestInFlight = true
      try {
        const data = await getJson<{
          run: RoutineExecutionPreview['run']
          messages: RoutineExecutionPreview['messages']
        }>(
          '/api/routines/' + encodeURIComponent(preview.routine.id) +
          '/runs/' + encodeURIComponent(preview.run.id),
        )
        if (!active) return
        const updated: RoutineExecutionPreview = {
          routine: preview.routine,
          run: data.run,
          messages: data.messages || [],
        }
        setPendingRoutineExecution(updated)
        setMessages(routineExecutionToChatMessages(updated))
      } catch {
        // A transient refresh failure should not remove the last visible execution.
      } finally {
        requestInFlight = false
      }
    }

    const timer = window.setInterval(() => void refreshExecution(), 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [pendingRoutineExecution, activeThreadId, sending])

  function navigateSettings(section?: SettingsSection) {
    if (settingsPage && (!section || section === settingsSection)) {
      const path = window.location.pathname
      window.history.pushState({}, '', path === '/' ? '/' : path)
      setSettingsPage(false)
      return
    }
    const targetSection: SettingsSection = section ?? 'general'
    const hash = targetSection === 'general' ? '#settings' : `#${targetSection}`
    window.history.pushState({}, '', `${window.location.pathname}${hash}`)
    setSettingsSection(targetSection)
    setSettingsPage(true)
    setMarketplacePage(false)
    setError('')
  }

  function navigateMarketplace(connectorId?: string) {
    if (!connectorId) setMarketplaceInitialConnectorId(null)
    if (connectorId) {
      setMarketplaceInitialConnectorId(connectorId)
      setMarketplaceInitialTab('connectors')
      setMarketplacePage(true)
      setSettingsPage(false)
      setError('')
      window.history.pushState({}, '', `${window.location.pathname}#marketplace`)
      return
    }
    if (marketplacePage) {
      const path = window.location.pathname
      window.history.pushState({}, '', path === '/' ? '/' : path)
      setMarketplacePage(false)
      return
    }
    window.history.pushState({}, '', `${window.location.pathname}#marketplace`)
    setMarketplacePage(true)
    setSettingsPage(false)
    setError('')
  }

  async function removeThread(threadId: string) {
    try {
      const response = await fetch(`/threads/${encodeURIComponent(threadId)}`, {
        method: 'DELETE',
      })
      if (!response.ok) return apiError('Conversation could not be deleted.', response)
      setThreads((current) => current.filter((thread) => thread.thread_id !== threadId))
      if (activeThreadId === threadId) navigateHome()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Conversation could not be deleted.')
    }
  }

  async function renameThread(threadId: string, title: string) {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    try {
      const renamed = await putJson<{ thread_id: string; title: string }>(
        `/threads/${encodeURIComponent(threadId)}`,
        { title: trimmedTitle },
      )
      setThreads((current) =>
        current.map((thread) =>
          thread.thread_id === threadId ? { ...thread, title: renamed.title } : thread,
        ),
      )
      setRenamingThreadId(null)
      setRenameValue('')
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Conversation could not be renamed.')
    }
  }

  function insertPrompt(prompt: string) {
    setInput(prompt)
    inputRef.current?.focus()
  }

  function confirmDeleteThread() {
    if (!deletingThread) return
    const threadId = deletingThread.thread_id
    setDeletingThread(null)
    void removeThread(threadId)
  }

  function stopResponse() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  function addAttachments(fileList: FileList | null) {
    if (!fileList?.length) return
    const incoming = Array.from(fileList)
    if (attachments.length + incoming.length > 10) {
      setError('Attach up to 10 files per message.')
      return
    }
    if (incoming.some((file) => file.size > 25 * 1024 * 1024)) {
      setError('Each file must be 25 MB or smaller.')
      return
    }
    if (attachments.reduce((total, file) => total + file.size, 0) +
      incoming.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) {
      setError('Files in one message must total 50 MB or less.')
      return
    }
    setError('')
    setAttachments((current) => [...current, ...incoming])
  }

  function removeAttachment(key: string) {
    setAttachments((current) =>
      current.filter((file) => `${file.name}-${file.size}-${file.lastModified}` !== key),
    )
  }

  async function handleA2UIAction(actionId: string, payload?: Record<string, unknown>) {
    if (!activeThreadId) return
    const prompt = `[A2UI Action Triggered] action_id: "${actionId}" payload: ${JSON.stringify(payload || {})}`
    await sendMessage(undefined, prompt)
  }

  const sendMessage = useCallback(
    async (event?: FormEvent, contentOverride?: string) => {
      event?.preventDefault()
      const content = (contentOverride ?? input).trim()
      const filesToSend = attachments
      if (!content && !filesToSend.length) return

      // Handle in-flight interrupt resume via direct composer input
      if (hitlRequest) {
        const text = content || 'Approved'
        setInput('')
        const curReq = hitlRequest
        setHitlRequest(null)
        const isApproval = Boolean(curReq.is_approval)
        const lower = text.toLowerCase()
        const isApprove = /approve|allow|yes|proceed|ok|sure|yep/i.test(lower)
        const action = isApproval ? (isApprove ? 'approve' : 'decline') : 'answer'
        const composerResumePayload = {
          action,
          always_allow: lower.includes('always'),
          selected_titles: [text],
          custom_text: text,
          connector_id: curReq.connector_id,
          tool_name: curReq.tool_name,
        }
        try {
          await fetch('/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              thread_id: activeThreadId,
              message: '',
              interrupt_id: curReq.id,
              resume: composerResumePayload,
            }),
          })
        } catch {
          await fetch(`/chat/interrupt/${encodeURIComponent(curReq.id)}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(composerResumePayload),
          }).catch(() => undefined)
        }
        return
      }

      if (sending || sendInFlightRef.current) return
      sendInFlightRef.current = true
      const messageContent = content || 'Please review the attached files.'

      const optimisticAttachments: MessageAttachment[] = filesToSend.map((file) => ({
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }))

      setError('')
      setSending(true)
      setInput('')
      setAttachments([])
      let currentMessages = messages
      let threadId = activeThreadId
      let messageAdded = false
      const optimisticMessageId = `user-${Date.now()}`
      const assistantId = `assistant-${Date.now()}`

      // Show the user's message and attachments immediately while thread/uploads run.
      if (!pendingRoutineExecution) {
        setMessages((current) => [
          ...current,
          {
            id: optimisticMessageId,
            role: 'user',
            content: messageContent,
            attachments: optimisticAttachments,
          },
          { id: assistantId, role: 'assistant', content: '', pending: true, tools: [], parts: [] },
        ])
        messageAdded = true
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        if (!threadId) {
          if (pendingRoutineExecution) {
            const promotionResponse = await fetch(
              `/api/routines/${encodeURIComponent(pendingRoutineExecution.routine.id)}/runs/${encodeURIComponent(pendingRoutineExecution.run.id)}/continue`,
              { method: 'POST', credentials: 'same-origin' },
            )
            if (!promotionResponse.ok) {
              await apiError('The routine execution could not be continued in chat.', promotionResponse)
            }
            const promotionData = (await promotionResponse.json()) as { thread?: Thread }
            const promotedThread = promotionData.thread
            if (!promotedThread?.thread_id) {
              throw new Error('Orbit did not create the routine conversation.')
            }

            threadId = promotedThread.thread_id
            setPendingRoutineExecution(null)
            setThreads((current) => [
              promotedThread,
              ...current.filter((item) => item.thread_id !== promotedThread.thread_id),
            ])
            skipLoadThreadRef.current = threadId
            window.history.pushState({}, '', `/c/${encodeURIComponent(threadId)}`)
            setActiveThreadId(threadId)
            setSettingsPage(false)
            setMarketplacePage(false)

            // Reload the server-seeded instruction, event and tool timeline so
            // this becomes a durable normal chat before the user's first reply.
            try {
              const seedHistory = await getJson<ThreadHistoryResponse>(
                `/threads/${encodeURIComponent(threadId)}?limit=20&include_extras=false`,
              )
              currentMessages = seedHistory.messages
              setMessages(seedHistory.messages)
              setHasOlderMessages(seedHistory.has_more_messages)
            } catch {
              // Keep the already-visible execution preview if history reload fails.
            }
          } else {
            const thread = await fetch('/threads', { method: 'POST' }).then(async (response) => {
              if (!response.ok) return apiError('A new conversation could not be created.', response)
              return (await response.json()) as Thread
            })
            threadId = thread.thread_id
            skipLoadThreadRef.current = threadId
            setThreads((current) => [thread, ...current])
            window.history.pushState({}, '', `/c/${encodeURIComponent(threadId)}`)
            setActiveThreadId(threadId)
            setSettingsPage(false)
          }
        }

        const uploadedAttachments: MessageAttachment[] = []
        for (const file of filesToSend) {
          const query = new URLSearchParams({ filename: file.name })
          const uploadResponse = await fetch(
            `/threads/${encodeURIComponent(threadId)}/attachments?${query}`,
            {
              method: 'POST',
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
              body: file,
              signal: controller.signal,
            },
          )
          if (!uploadResponse.ok) {
            await apiError(`Could not upload ${file.name}.`, uploadResponse)
          }
          const uploaded = (await uploadResponse.json()) as MessageAttachment
          const previewUrl = optimisticAttachments[uploadedAttachments.length]?.preview_url
          uploadedAttachments.push(previewUrl ? { ...uploaded, preview_url: previewUrl } : uploaded)
        }

        if (messageAdded) {
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticMessageId
                ? { ...message, attachments: uploadedAttachments }
                : message,
            ),
          )
        } else {
          const userMessage: Message = {
            id: optimisticMessageId,
            role: 'user',
            content: messageContent,
            attachments: uploadedAttachments,
          }
          setMessages([
            ...currentMessages,
            userMessage,
            { id: assistantId, role: 'assistant', content: '', pending: true, tools: [], parts: [] },
          ])
          messageAdded = true
        }

        const response = await fetch('/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content,
            thread_id: threadId,
            model: settings.model,
            provider_index: settings.provider_index,
            attachment_ids: uploadedAttachments
              .map((attachment) => attachment.attachment_id)
              .filter((id): id is string => Boolean(id)),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          await apiError(`Agent request failed (${response.status})`, response)
        }
        setAttachments([])

        const reader = response.body?.getReader()
        if (!reader) throw new Error('Streaming response body is unavailable.')

        const decoder = new TextDecoder()
        let buffer = ''

        let receivedTerminalEvent = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // SSE streams may end without a trailing newline. Flush the decoder and
            // process the final data line instead of silently dropping the final event.
            buffer += decoder.decode()
            if (buffer.trim()) buffer += '\n'
            else break
          } else {
            buffer += decoder.decode(value, { stream: true })
          }
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const jsonText = trimmed.slice(5).trim()
            if (!jsonText) continue

            try {
              const eventData = JSON.parse(jsonText) as {
                type: string
                data?: Record<string, unknown>
              }
              const eventType = eventData.type
              const data = eventData.data || {}

              if (eventType === 'token') {
                const token = String(data.token || '')
                if (!token) continue
                setMessages((current) =>
                  current.map((msg) => {
                    if (msg.id !== assistantId) return msg

                    // Some stream adapters emit cumulative snapshots instead of deltas.
                    // Appending those snapshots repeats the entire answer on every event.
                    // Detect that shape and replace the streamed text with the newer snapshot.
                    const streamedText = msg.content || ''
                    const isCumulativeSnapshot =
                      streamedText.length > 0 && token.length > streamedText.length &&
                      token.startsWith(streamedText)
                    const currentParts = msg.parts ? [...msg.parts] : []
                    const lastTextIndex = currentParts.reduce(
                      (lastIndex, part, index) => (part.type === 'text' ? index : lastIndex),
                      -1,
                    )

                    if (isCumulativeSnapshot) {
                      if (lastTextIndex >= 0) {
                        const lastPart = currentParts[lastTextIndex]
                        if (lastPart.type === 'text') {
                          currentParts[lastTextIndex] = { ...lastPart, text: token }
                        }
                      } else {
                        currentParts.push({ type: 'text', text: token })
                      }
                      return {
                        ...msg,
                        content: token,
                        parts: currentParts,
                        pending: true,
                      }
                    }

                    const lastPart = currentParts[currentParts.length - 1]
                    if (lastPart && lastPart.type === 'text') {
                      currentParts[currentParts.length - 1] = {
                        ...lastPart,
                        text: lastPart.text + token,
                      }
                    } else {
                      currentParts.push({ type: 'text', text: token })
                    }
                    return {
                      ...msg,
                      content: streamedText + token,
                      parts: currentParts,
                      pending: true,
                    }
                  }),
                )
              } else if (eventType === 'tool_start') {
                const toolId = String(data.tool_call_id || crypto.randomUUID())
                const tool: ToolEvent = {
                  id: toolId,
                  name: String(data.tool || 'tool'),
                  args: isRecord(data.args) ? data.args : {},
                  status: 'running',
                }
                setMessages((current) =>
                  current.map((msg) => {
                    if (msg.id !== assistantId) return msg
                    const currentParts = msg.parts ? [...msg.parts] : []
                    currentParts.push({ type: 'tool', tool })
                    return {
                      ...msg,
                      tools: [...(msg.tools || []), tool],
                      parts: currentParts,
                      pending: true,
                    }
                  }),
                )
              } else if (eventType === 'tool_end') {
                const toolId = String(data.tool_call_id || '')
                const output = String(data.output || '')
                setMessages((current) =>
                  current.map((msg) => {
                    if (msg.id !== assistantId) return msg
                    const updatedTools = (msg.tools || []).map((t) =>
                      t.id === toolId ? { ...t, output, status: 'done' as const } : t,
                    )
                    const updatedParts = (msg.parts || []).map((p) => {
                      if (p.type === 'tool' && p.tool.id === toolId) {
                        return {
                          ...p,
                          tool: { ...p.tool, output, status: 'done' as const },
                        }
                      }
                      return p
                    })
                    return {
                      ...msg,
                      tools: updatedTools,
                      parts: updatedParts,
                      pending: true,
                    }
                  }),
                )
              } else if (eventType === 'done') {
                receivedTerminalEvent = true
                const finalContent = collapseRepeatedResponse(String(data.content || ''))
                const turnId =
                  typeof data.turn_id === 'number' || typeof data.turn_id === 'string'
                    ? data.turn_id
                    : undefined
                const variant: MessageVariant = {
                  version: 1,
                  user_content: messageContent,
                  assistant_content: finalContent,
                }
                setMessages((current) =>
                  current.map((msg) => {
                    if (msg.id === assistantId) {
                      const currentParts = deduplicateMessageParts(msg.parts ? [...msg.parts] : [])
                      const remaining = extractRemainingMessageText(finalContent, currentParts)
                      if (remaining) {
                        currentParts.push({ type: 'text', text: remaining })
                      }
                      return {
                        ...msg,
                        content: finalContent || msg.content,
                        parts: currentParts,
                        turn_id: turnId,
                        variants: turnId === undefined ? msg.variants : [variant],
                        selected_version: 1,
                        version_count: 1,
                        pending: false,
                      }
                    }
                    if (msg.id === optimisticMessageId) {
                      return {
                        ...msg,
                        id: turnId ?? msg.id,
                        turn_id: turnId,
                        variants: turnId === undefined ? msg.variants : [variant],
                        selected_version: 1,
                        version_count: 1,
                      }
                    }
                    return msg
                  }),
                )
              } else if (eventType === 'ask_question' || eventType === 'interrupt') {
                const qData = (data || {}) as Record<string, unknown>
                const rawQuestions = Array.isArray(qData.questions) ? qData.questions : []
                if (rawQuestions.length > 0) {
                  setHitlRequest({
                    id: String(qData.interrupt_id || qData.request_id || qData.tool_call_id || crypto.randomUUID()),
                    questions: rawQuestions as HITLQuestionItem[],
                    is_approval: Boolean(qData.is_approval),
                    risk_level: typeof qData.risk_level === 'string' ? qData.risk_level : undefined,
                    policy_rule: typeof qData.policy_rule === 'string' ? qData.policy_rule : undefined,
                    action_summary: typeof qData.action_summary === 'string' ? qData.action_summary : undefined,
                    reason: typeof qData.reason === 'string' ? qData.reason : undefined,
                    connector_id: typeof qData.connector_id === 'string' ? qData.connector_id : undefined,
                    connector_name: typeof qData.connector_name === 'string' ? qData.connector_name : undefined,
                    tool_name: typeof qData.tool_name === 'string' ? qData.tool_name : undefined,
                    args:
                      typeof qData.args === 'object' && qData.args
                        ? (qData.args as Record<string, unknown>)
                        : undefined,
                  })
                }
              } else if (eventType === 'a2ui_canvas') {
                const cData = isRecord(data) ? data : {}
                setActiveCanvas({
                  type: 'a2ui',
                  title: String(cData.title || 'A2UI Canvas'),
                  spec: cData.spec || cData,
                })
              } else if (eventType === 'generative_ui') {
                const gData = isRecord(data) ? data : {}
                setActiveCanvas({
                  type: 'generative_ui',
                  title: String(gData.title || 'Interactive Widget'),
                  html: String(gData.html || ''),
                })
              } else if (eventType === 'artifact') {
                const aData = isRecord(data) ? data : {}
                setActiveCanvas({
                  type: 'artifact',
                  title: String(aData.title || 'Artifact'),
                  artifactType: String(aData.artifact_type || 'code'),
                  content: String(aData.content || ''),
                  language: String(aData.language || 'markdown'),
                })
              } else if (eventType === 'error') {
                receivedTerminalEvent = true
                const errorMsg = String(data.error || 'The agent could not complete this request.')
                setError(errorMsg)
                setMessages((current) =>
                  current.map((msg) =>
                    msg.id === assistantId
                      ? {
                          ...msg,
                          content: msg.content || errorMsg,
                          pending: false,
                          failed: true,
                        }
                      : msg,
                  ),
                )
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
          if (done) break
        }

        if (!receivedTerminalEvent && !controller.signal.aborted) {
          throw new Error('The connection ended before Orbit finished the response. Your message was not automatically resent.')
        }
        void refreshThreads()
      } catch (sendError) {
        if (controller.signal.aborted) {
          if (!messageAdded) setInput(content)
          setMessages((current) =>
            current.map((msg) => (msg.pending ? { ...msg, pending: false } : msg)),
          )
        } else {
          if (!messageAdded) setInput(content)
          setError(
            sendError instanceof Error ? sendError.message : 'The message could not be sent.',
          )
          setMessages((current) =>
            current.map((msg) =>
              msg.pending
                ? {
                    ...msg,
                    content: msg.content || 'The connection ended before a response arrived.',
                    pending: false,
                    failed: true,
                  }
                : msg,
            ),
          )
        }
        if (threadId) {
          try {
            void refreshThreads()
          } catch {
            // ignore
          }
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        sendInFlightRef.current = false
        setSending(false)
      }
    },
    [activeThreadId, attachments, input, messages, refreshThreads, sending, settings.model, settings.provider_index, hitlRequest, pendingRoutineExecution],
  )

  const handleHITLSubmit = useCallback(
    async (submission: HITLSubmission) => {
      // Clear HITL card immediately so user sees instant UI update
      setHitlRequest(null)

      let action = 'answer'
      if (submission.isApproval) {
        const isDecline = submission.selectedTitles.some(
          (t) => /decline|reject|block|deny|cancel|stop/i.test(t),
        )
        const isApprove = submission.selectedTitles.some(
          (t) => /approve|allow|yes|proceed|every time|once|continue/i.test(t),
        )
        action = isDecline ? 'decline' : (isApprove ? 'approve' : 'decline')
      }

      // Resume interrupt natively via /chat/stream just like talos_v6
      const resumePayload = {
        action,
        always_allow: Boolean(submission.alwaysAllow),
        selected_titles: submission.selectedTitles,
        custom_text: submission.customText,
        connector_id: submission.connectorId,
        tool_name: submission.toolName,
        answers: submission.answers,
      }

      try {
        await fetch('/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            thread_id: activeThreadId,
            message: '',
            interrupt_id: submission.requestId,
            resume: resumePayload,
          }),
        })
      } catch {
        // Fallback to legacy interrupt route if needed
        await fetch(`/chat/interrupt/${encodeURIComponent(submission.requestId)}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(resumePayload),
        }).catch(() => undefined)
      }

    },
    [activeThreadId],
  )

  const handleHITLSkip = useCallback(async () => {
    if (!hitlRequest) return
    const reqId = hitlRequest.id
    setHitlRequest(null)
    const skipPayload = {
      action: 'skip',
      selected_titles: [],
      custom_text: 'Skipped',
    }
    try {
      await fetch('/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          thread_id: activeThreadId,
          message: '',
          interrupt_id: reqId,
          resume: skipPayload,
        }),
      })
    } catch {
      await fetch(`/chat/interrupt/${encodeURIComponent(reqId)}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(skipPayload),
      }).catch(() => undefined)
    }
  }, [hitlRequest, activeThreadId])

  const handleHITLDismiss = useCallback(async () => {
    if (!hitlRequest) return
    const reqId = hitlRequest.id
    setHitlRequest(null)
    const declinePayload = {
      action: 'decline',
      selected_titles: [],
      custom_text: 'Dismissed',
    }
    try {
      await fetch('/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          thread_id: activeThreadId,
          message: '',
          interrupt_id: reqId,
          resume: declinePayload,
        }),
      })
    } catch {
      await fetch(`/chat/interrupt/${encodeURIComponent(reqId)}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(declinePayload),
      }).catch(() => undefined)
    }
  }, [hitlRequest, activeThreadId])

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => setCopiedMessageId(null), 1400)
    } catch {
      setError('Clipboard access is unavailable in this browser.')
    }
  }

  function beginEdit(message: Message) {
    setEditingMessageId(message.id)
    setEditDraft(message.content)
  }

  async function selectTurnVersion(message: Message, version: number) {
    if (!activeThreadId || message.turn_id === undefined || sending) return
    try {
      const response = await fetch(
        `/threads/${encodeURIComponent(activeThreadId)}/turns/${encodeURIComponent(String(message.turn_id))}/version`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_message_id: Number(message.turn_id), version }),
        },
      )
      if (!response.ok) await apiError('That response version could not be selected.', response)
      const data = (await response.json()) as { messages: Message[] }
      setMessages(data.messages)
      setMessageMenuId(null)
    } catch (versionError) {
      setError(
        versionError instanceof Error
          ? versionError.message
          : 'That response version could not be selected.',
      )
    }
  }

  async function branchFromMessage(message: Message) {
    if (!activeThreadId || message.turn_id === undefined || sending) return
    try {
      const response = await fetch(
        `/threads/${encodeURIComponent(activeThreadId)}/branch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_message_id: Number(message.turn_id),
            version: message.selected_version ?? 1,
          }),
        },
      )
      if (!response.ok) await apiError('A branch could not be created.', response)
      const data = (await response.json()) as { thread: Thread; messages: Message[] }
      skipLoadThreadRef.current = data.thread.thread_id
      setActiveThreadId(data.thread.thread_id)
      setMessages(data.messages)
      setMessageMenuId(null)
      window.history.pushState({}, '', `/c/${encodeURIComponent(data.thread.thread_id)}`)
      await refreshThreads()
    } catch (branchError) {
      setError(
        branchError instanceof Error ? branchError.message : 'A branch could not be created.',
      )
    }
  }

  async function regenerateResponse(userMessage: Message, editedContent?: string) {
    if (!activeThreadId || sending || userMessage.turn_id === undefined) return
    const userMessageId = Number(userMessage.turn_id)
    const assistantMessage = messages.find(
      (message) =>
        message.role === 'assistant' && Number(message.turn_id) === userMessageId,
    )
    if (!Number.isInteger(userMessageId) || !assistantMessage) {
      setError('This response cannot be edited or regenerated.')
      return
    }
    const prompt = (editedContent ?? userMessage.content).trim()
    if (!prompt) {
      setError('A message cannot be empty.')
      return
    }

    setError('')
    setSending(true)
    setMessageMenuId(null)
    setEditingMessageId(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setMessages((current) =>
      current.map((message) => {
        if (message.id === userMessage.id && editedContent !== undefined) {
          return { ...message, content: prompt }
        }
        if (message.id === assistantMessage.id) {
          return { ...message, content: '', parts: [], pending: true, failed: false, tools: [] }
        }
        return message
      }),
    )

    let bufferedTokens = ''
    let tokenFrameId: number | null = null

    const flushTokenBuffer = () => {
      if (!bufferedTokens) return
      const chunk = bufferedTokens
      bufferedTokens = ''
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantMessage.id) return message
          const currentParts = message.parts ? [...message.parts] : []
          const lastPart = currentParts[currentParts.length - 1]
          if (lastPart && lastPart.type === 'text') {
            currentParts[currentParts.length - 1] = {
              ...lastPart,
              text: lastPart.text + chunk,
            }
          } else {
            currentParts.push({ type: 'text', text: chunk })
          }
          return {
            ...message,
            content: message.content + chunk,
            parts: currentParts,
            pending: true,
          }
        }),
      )
    }

    try {
      const response = await fetch('/chat/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: activeThreadId,
          user_message_id: userMessageId,
          message: prompt,
          model: settings.model,
          provider_index: settings.provider_index,
        }),
        signal: controller.signal,
      })
      if (!response.ok) await apiError('The response could not be regenerated.', response)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Streaming response body is unavailable.')

      const decoder = new TextDecoder()
      let buffer = ''
      let completed = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const jsonText = trimmed.slice(5).trim()
          if (!jsonText) continue
          let eventData: { type: string; data?: Record<string, unknown> }
          try {
            eventData = JSON.parse(jsonText)
          } catch {
            continue
          }
          const data = eventData.data || {}
          if (eventData.type === 'token') {
            bufferedTokens += String(data.token || '')
            if (tokenFrameId === null) {
              tokenFrameId = requestAnimationFrame(() => {
                tokenFrameId = null
                flushTokenBuffer()
              })
            }
            continue
          }

          if (tokenFrameId !== null) {
            cancelAnimationFrame(tokenFrameId)
            tokenFrameId = null
          }
          flushTokenBuffer()

          if (eventData.type === 'turn_version_start') {
            const version = Number(data.version)
            const versionCount = Number(data.version_count)
            const previousVariants =
              userMessage.variants?.length
                ? userMessage.variants
                : [
                    {
                      version: userMessage.selected_version ?? 1,
                      user_content: userMessage.content,
                      assistant_content: assistantMessage.content,
                    },
                  ]
            const pendingVariant: MessageVariant = {
              version,
              user_content: prompt,
              assistant_content: '',
            }
            const variants = [
              ...previousVariants.filter((item) => item.version !== version),
              pendingVariant,
            ].sort((a, b) => a.version - b.version)
            setMessages((current) =>
              current.map((message) => {
                if (Number(message.id) === userMessageId) {
                  return {
                    ...message,
                    content: prompt,
                    turn_id: userMessageId,
                    variants,
                    selected_version: version,
                    version_count: versionCount,
                  }
                }
                if (message.id === assistantMessage.id) {
                  return {
                    ...message,
                    content: '',
                    tools: [],
                    parts: [],
                    turn_id: userMessageId,
                    variants,
                    selected_version: version,
                    version_count: versionCount,
                    pending: true,
                    failed: false,
                  }
                }
                return message
              }),
            )
          } else if (eventData.type === 'tool_start') {
            const tool: ToolEvent = {
              id: String(data.tool_call_id || crypto.randomUUID()),
              name: String(data.tool || 'tool'),
              args: isRecord(data.args) ? data.args : {},
              status: 'running',
            }
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantMessage.id) return message
                const currentParts = message.parts ? [...message.parts] : []
                currentParts.push({ type: 'tool', tool })
                return {
                  ...message,
                  tools: [...(message.tools || []), tool],
                  parts: currentParts,
                  pending: true,
                }
              }),
            )
          } else if (eventData.type === 'tool_end') {
            const toolId = String(data.tool_call_id || '')
            const output = String(data.output || '')
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantMessage.id) return message
                const updatedTools = (message.tools || []).map((tool) =>
                  tool.id === toolId ? { ...tool, output, status: 'done' as const } : tool,
                )
                const updatedParts = (message.parts || []).map((p) => {
                  if (p.type === 'tool' && p.tool.id === toolId) {
                    return {
                      ...p,
                      tool: { ...p.tool, output, status: 'done' as const },
                    }
                  }
                  return p
                })
                return {
                  ...message,
                  tools: updatedTools,
                  parts: updatedParts,
                  pending: true,
                }
              }),
            )
          } else if (eventData.type === 'done') {
            const finalContent = String(data.content || '')
            const version = Number(data.version) || (userMessage.variants?.length ?? 1) + 1
            const previousVariants =
              userMessage.variants?.length
                ? userMessage.variants
                : [
                    {
                      version: userMessage.selected_version ?? 1,
                      user_content: userMessage.content,
                      assistant_content: assistantMessage.content,
                    },
                  ]
            const newVariant: MessageVariant = {
              version,
              user_content: prompt,
              assistant_content: finalContent,
            }
            const variants = [
              ...previousVariants.filter((item) => item.version !== version),
              newVariant,
            ].sort((a, b) => a.version - b.version)
            setMessages((current) =>
              current.map((message) => {
                if (message.id === assistantMessage.id) {
                  const currentParts = deduplicateMessageParts(message.parts ? [...message.parts] : [])
                  const remaining = extractRemainingMessageText(finalContent, currentParts)
                  if (remaining) {
                    currentParts.push({ type: 'text', text: remaining })
                  }
                  return {
                    ...message,
                    content: finalContent || message.content,
                    parts: currentParts,
                    turn_id: userMessageId,
                    variants,
                    selected_version: version,
                    version_count: variants.length,
                    pending: false,
                    failed: false,
                  }
                }
                if (Number(message.id) === userMessageId) {
                  return {
                    ...message,
                    content: prompt,
                    turn_id: userMessageId,
                    variants,
                    selected_version: version,
                    version_count: variants.length,
                  }
                }
                return message
              }),
            )
            completed = true
          } else if (eventData.type === 'ask_question' || eventData.type === 'interrupt') {
            const qData = (data || {}) as Record<string, unknown>
            const rawQuestions = Array.isArray(qData.questions) ? qData.questions : []
            if (rawQuestions.length > 0) {
              setHitlRequest({
                id: String(qData.interrupt_id || qData.request_id || qData.tool_call_id || crypto.randomUUID()),
                questions: rawQuestions as HITLQuestionItem[],
                is_approval: Boolean(qData.is_approval),
                connector_id: typeof qData.connector_id === 'string' ? qData.connector_id : undefined,
                connector_name: typeof qData.connector_name === 'string' ? qData.connector_name : undefined,
                tool_name: typeof qData.tool_name === 'string' ? qData.tool_name : undefined,
                args:
                  typeof qData.args === 'object' && qData.args
                    ? (qData.args as Record<string, unknown>)
                    : undefined,
              })
            }
          } else if (eventData.type === 'a2ui_canvas') {
            const cData = isRecord(data) ? data : {}
            setActiveCanvas({
              type: 'a2ui',
              title: String(cData.title || 'A2UI Canvas'),
              spec: cData.spec || cData,
            })
          } else if (eventData.type === 'generative_ui') {
            const gData = isRecord(data) ? data : {}
            setActiveCanvas({
              type: 'generative_ui',
              title: String(gData.title || 'Interactive Widget'),
              html: String(gData.html || ''),
            })
          } else if (eventData.type === 'artifact') {
            const aData = isRecord(data) ? data : {}
            setActiveCanvas({
              type: 'artifact',
              title: String(aData.title || 'Artifact'),
              artifactType: String(aData.artifact_type || 'code'),
              content: String(aData.content || ''),
              language: String(aData.language || 'markdown'),
            })
          } else if (eventData.type === 'error') {
            throw new Error(String(data.error || 'The response could not be regenerated.'))
          }
        }
      }
      if (!completed) throw new Error('The response stream ended before it was complete.')
      await refreshThreads()
    } catch (regenerateError) {
      if (!controller.signal.aborted) {
        setError(
          regenerateError instanceof Error
            ? regenerateError.message
            : 'The response could not be regenerated.',
        )
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, pending: false, failed: true }
              : message,
          ),
        )
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, pending: false }
              : message,
          ),
        )
      }
    } finally {
      if (tokenFrameId !== null) {
        cancelAnimationFrame(tokenFrameId)
      }
      flushTokenBuffer()
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      setSending(false)
    }
  }

  const currentThread = threads.find((thread) => thread.thread_id === activeThreadId)
  const sidebarExpanded = sidebarOpen

  if (authLoading) {
    return (
      <div className="orbit-auth-loading" role="status" aria-live="polite">
        <span className="orbit-auth-loading-spinner" aria-hidden="true" />
        <span>{backendBootMessage}</span>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <AuthScreen
        key={authScreenNonce}
        hasUsers={hasUsers}
        emailOtpEnabled={emailOtpEnabled}
        initialView={authView}
        initialNotice={authMessage}
        lastSignedOutUser={lastSignedOutUser}
        revokedAllDevices={revokedAllDevices}
        onViewChange={(nextView) => {
          setAuthView(nextView)
          const nextPath = authPathFromView(nextView)
          if (window.location.pathname !== nextPath) {
            window.history.pushState({}, '', nextPath)
          }
        }}
        onAuthenticated={handleAuthenticated}
      />
    )
  }

  return (
    <div
      className={`app-shell ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'} ${!isLargeScreen ? 'mobile-layout' : ''}`}
      data-appearance={userPreferences.appearance}
    >
      <input
        ref={attachmentInputRef}
        className="attachment-file-input"
        type="file"
        multiple
        onChange={(event) => {
          addAttachments(event.target.files)
          event.target.value = ''
        }}
        aria-label="Choose files to attach"
      />
      {(isLargeScreen || sidebarOpen) && (
      <ThreadSidebar
        user={currentUser}
        sidebarExpanded={sidebarExpanded}
        navigateHome={() => {
          navigateHome()
          if (!isLargeScreen) setSidebarOpen(false)
        }}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        setSidebarOpen={setSidebarOpen}
        searchInputRef={searchInputRef}
        search={search}
        setSearch={setSearch}
        visibleThreads={visibleThreads}
        hasMoreThreads={hasMoreThreads}
        loadingMoreThreads={loadingMoreThreads}
        onLoadMoreThreads={loadMoreThreads}
        activeThreadId={activeThreadId}
        renamingThreadId={renamingThreadId}
        setRenamingThreadId={setRenamingThreadId}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        renameThread={renameThread}
        threadMenuId={threadMenuId}
        setThreadMenuId={setThreadMenuId}
        navigateThread={(threadId) => {
          navigateThread(threadId)
          if (!isLargeScreen) setSidebarOpen(false)
        }}
        setDeletingThread={setDeletingThread}
        navigateSettings={(section) => {
          navigateSettings(section)
          if (!isLargeScreen) setSidebarOpen(false)
        }}
        navigateMarketplace={() => {
          navigateMarketplace()
          if (!isLargeScreen) setSidebarOpen(false)
        }}
        onOpenRoutines={() => {
          setRoutinesModalOpen(true)
          if (!isLargeScreen) setSidebarOpen(false)
        }}
        unreadRoutinesCount={unreadNotifCount}
        onRequestLogout={() => {
          if (sending) {
            setLogoutConfirmMode('logout-active')
          } else {
            void logout(undefined, { targetView: 'logged-out' })
          }
        }}
        onRequestLogoutAll={() => setLogoutConfirmMode('logout-all')}
        onRequestSwitchAccount={() => {
          if (sending) {
            setLogoutConfirmMode('switch-active')
          } else {
            void logout('Choose a saved account or sign in with another email.', {
              targetView: 'login',
            })
          }
        }}
        onPreloadSettings={preloadSettings}
        onPreloadMarketplace={preloadMarketplace}
        onPreloadRoutines={preloadRoutines}
      />
      )}

      {!isLargeScreen && sidebarOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* -------------------- MAIN PANEL -------------------- */}
      <main className="main-panel">
        {!isLargeScreen && (
          <header className="mobile-app-header">
            <button
              type="button"
              className="mobile-header-action"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
            >
              <Icon name="panel" size={19} />
            </button>
            <div className="mobile-header-title" title={currentThread?.title || ''}>
              {currentThread?.title || (settingsPage ? 'Settings' : marketplacePage ? 'Marketplace' : 'Orbit')}
            </div>
            <button
              type="button"
              className="mobile-header-action"
              onClick={navigateHome}
              aria-label="New chat"
            >
              <Icon name="newchat" size={19} />
            </button>
          </header>
        )}
        {error && (
          <div className="error-toast" role="alert">
            <span className="error-text">{error}</span>
            <button className="icon-btn" onClick={() => setError('')} aria-label="Dismiss error">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        <ModernDialog
          isOpen={Boolean(deletingThread)}
          onClose={() => setDeletingThread(null)}
          ariaLabelledBy="thread-delete-title"
          className="thread-delete-dialog"
        >
          {deletingThread && (
            <>
              <h2 id="thread-delete-title">Delete conversation?</h2>
              <p>
                This will permanently delete “{deletingThread.title}” and its conversation history.
              </p>
              <div className="thread-delete-actions">
                <button type="button" autoFocus onClick={() => setDeletingThread(null)}>Cancel</button>
                <button type="button" className="confirm-delete-btn" onClick={confirmDeleteThread}>
                  Delete
                </button>
              </div>
            </>
          )}
        </ModernDialog>

        <ModernDialog
          isOpen={Boolean(logoutConfirmMode)}
          onClose={() => !loggingOut && setLogoutConfirmMode(null)}
          ariaLabelledBy="logout-confirm-title"
          className="thread-delete-dialog"
        >
          {logoutConfirmMode && (
            <>
              <h2 id="logout-confirm-title">
                {logoutConfirmMode === 'logout-all'
                  ? 'Log out of all devices?'
                  : logoutConfirmMode === 'switch-active'
                  ? 'Stop active response and switch account?'
                  : 'Stop active response and log out?'}
              </h2>
              <p>
                {logoutConfirmMode === 'logout-all'
                  ? `This will immediately revoke every active Orbit Studio session for ${currentUser.email} across all browsers and devices.`
                  : `An agent response is currently streaming. Continuing will cancel the active response and sign out of ${currentUser.email}.`}
              </p>
              <div className="thread-delete-actions">
                <button
                  type="button"
                  autoFocus
                  disabled={loggingOut}
                  onClick={() => setLogoutConfirmMode(null)}
                >
                  Cancel
                </button>
                {logoutConfirmMode === 'switch-active' ? (
                  <button
                    type="button"
                    className="confirm-primary-btn"
                    disabled={loggingOut}
                    onClick={() =>
                      void logout('Choose a saved account or sign in with another email.', {
                        targetView: 'login',
                      })
                    }
                  >
                    {loggingOut ? 'Switching...' : 'Switch account'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="confirm-delete-btn"
                    disabled={loggingOut}
                    onClick={() =>
                      void logout(
                        logoutConfirmMode === 'logout-all'
                          ? 'Every active session for this account has been revoked.'
                          : undefined,
                        {
                          revokeAll: logoutConfirmMode === 'logout-all',
                          targetView: 'logged-out',
                        },
                      )
                    }
                  >
                    {loggingOut
                      ? 'Logging out...'
                      : logoutConfirmMode === 'logout-all'
                      ? 'Log out all devices'
                      : 'Log out'}
                  </button>
                )}
              </div>
            </>
          )}
        </ModernDialog>

        {marketplacePage ? (
          <MarketplaceErrorBoundary>
            <Suspense fallback={<div className="panel-lazy-loading"><span className="spinner" /></div>}>
              <MarketplaceView
                onClose={navigateMarketplace}
                onOpenCapabilities={() => navigateSettings('capabilities')}
                initialTab={marketplaceInitialTab}
                initialConnectorId={marketplaceInitialConnectorId}
              />
            </Suspense>
          </MarketplaceErrorBoundary>
        ) : settingsPage ? (
          <Suspense fallback={<div className="panel-lazy-loading"><span className="spinner" /></div>}>
            <SettingsPanel
              key={settingsSection}
              user={currentUser}
              unusedRecoveryCodes={unusedRecoveryCodes}
              preferences={userPreferences}
              onPreferencesUpdated={setUserPreferences}
              initialSection={settingsSection}
              initialCapabilitiesTab={capabilitiesInitialTab}
              onClose={() => navigateSettings()}
              onUserUpdated={(updatedUser) => {
                rememberRecentAccount(updatedUser)
                setCurrentUser(updatedUser)
              }}
              onRecoveryCodesCountUpdated={(count) => setUnusedRecoveryCodes(count)}
              onLoggedOut={(notice, opts) =>
                void logout(notice, {
                  targetView: opts?.forgetUser ? 'login' : 'logged-out',
                  revokeAll: opts?.revokeAll,
                  forgetUser: opts?.forgetUser,
                })
              }
              onUnauthorized={handleUnauthorized}
              onNavigateMarketplace={navigateMarketplace}
            />
          </Suspense>
        ) : (
          <div className={`workspace-split-container ${activeCanvas ? 'canvas-open' : ''}`}>
            <div className="workspace-chat-pane">
              <ChatWorkspace
                loadingThread={loadingThread}
                messages={messages}
                hasOlderMessages={hasOlderMessages}
                loadingOlderMessages={loadingOlderMessages}
                loadOlderMessages={loadOlderMessages}
                scrollRef={scrollRef}
                editingMessageId={editingMessageId}
                setEditingMessageId={setEditingMessageId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                sending={sending}
                beginEdit={beginEdit}
                regenerateResponse={regenerateResponse}
                selectTurnVersion={selectTurnVersion}
                copiedMessageId={copiedMessageId}
                copyMessage={copyMessage}
                messageMenuId={messageMenuId}
                setMessageMenuId={setMessageMenuId}
                branchFromMessage={branchFromMessage}
                navigateThread={navigateThread}
                currentThread={currentThread}
                attachments={attachments}
                removeAttachment={removeAttachment}
                inputRef={inputRef}
                attachmentInputRef={attachmentInputRef}
                input={input}
                setInput={setInput}
                sendMessage={sendMessage}
                stopResponse={stopResponse}
                insertPrompt={insertPrompt}
                onA2UIAction={handleA2UIAction}
                onOpenCanvas={(item) => setActiveCanvas(item)}
                sendShortcut={userPreferences.send_shortcut}
                hitlRequest={hitlRequest}
                onHITLSubmit={handleHITLSubmit}
                onHITLSkip={handleHITLSkip}
                onHITLDismiss={handleHITLDismiss}
                onOpenRoutinesModal={() => setRoutinesModalOpen(true)}
                onOpenConnectors={() => {
                  setCapabilitiesInitialTab('connectors')
                  navigateSettings('capabilities')
                }}
                onBrowseConnectors={() => {
                  setMarketplaceInitialTab('connectors')
                  navigateMarketplace()
                }}
                onOpenSkills={() => {
                  setCapabilitiesInitialTab('skills')
                  navigateSettings('capabilities')
                }}
                onBrowseSkills={() => {
                  setMarketplaceInitialTab('skills')
                  navigateMarketplace()
                }}
              />
            </div>

            {activeCanvas && (
              <div className="workspace-canvas-pane">
                <Suspense fallback={<div className="panel-lazy-loading"><span className="spinner" /></div>}>
                  <UniversalCanvas
                    key={`${activeCanvas.filePath || activeCanvas.title || 'canvas'}:${workspaceChangeVersion}`}
                    item={activeCanvas}
                    threadId={activeThreadId || 'default'}
                    onClose={() => setActiveCanvas(null)}
                    insertPrompt={insertPrompt}
                    onA2UIAction={handleA2UIAction}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}
      </main>

      {inAppToast && (
        <div className="proactive-toast-alert" role="alert">
          <div className="proactive-toast-header">
            <div className="proactive-toast-title">
              <Icon name="clock" size={16} />
              <span>{inAppToast.title}</span>
            </div>
            <button
              className="icon-btn"
              onClick={() => setInAppToast(null)}
              aria-label="Close alert"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="proactive-toast-body">
            {inAppToast.message
              .replace(/Reminder \/ Routine '[^']+' triggered successfully\./g, '')
              .replace(/\*Executed in \d+ms at [^*]+\*/g, '')
              .trim() || inAppToast.title}
          </div>
          <div className="proactive-toast-footer">
            {inAppToast.routine_id && (
              <button
                className="toast-action-btn"
                onClick={async () => {
                  try {
                    await fetch(`/api/routines/${encodeURIComponent(inAppToast.routine_id!)}/snooze`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ minutes: 10 }),
                    })
                  } catch { /* Browser APIs may be unavailable. */ }
                  setInAppToast(null)
                }}
              >
                <Icon name="clock" size={12} />
                <span>Snooze 10m</span>
              </button>
            )}
            <button
              className="toast-action-btn secondary"
              onClick={() => {
                setInAppToast(null)
                setRoutinesModalOpen(true)
              }}
            >
              <span>View Routines</span>
            </button>
          </div>
        </div>
      )}

      {routinesModalOpen && (
        <Suspense fallback={null}>
          <ProactiveRoutinesModal
            isOpen={routinesModalOpen}
            onClose={() => setRoutinesModalOpen(false)}
            unreadCount={unreadNotifCount}
            onClearUnread={() => setUnreadNotifCount(0)}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            onOpenExecution={openRoutineExecutionPreview}
          />
        </Suspense>
      )}
    </div>
  )
}

export default App
