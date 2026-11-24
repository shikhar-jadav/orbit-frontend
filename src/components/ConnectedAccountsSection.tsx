import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import './ConnectedAccountsSection.css'

type Provider = 'github' | 'slack' | 'gmail'

type ConnectedAccount = {
  provider: Provider
  provider_account_id: string
  account_name: string
  scopes: string[]
  updated_at?: string
}

type ProviderStatus = {
  configured: boolean
  accounts: ConnectedAccount[]
  events_ready?: boolean
  signing_configured?: boolean
  pubsub_configured?: boolean
  pubsub_limits_configured?: boolean
}

type IntegrationStatus = {
  public_url?: string | null
  public_url_configured: boolean
  webhook_payload_limit_configured: boolean
  token_storage_configured: boolean
  github: ProviderStatus
  slack: ProviderStatus
  gmail: ProviderStatus
}

type Props = {
  onUnauthorized: () => void
}

const PROVIDERS: Array<{
  id: Provider
  name: string
  description: string
  mark: string
}> = [
  { id: 'github', name: 'GitHub', description: 'Repositories, issues and pull requests', mark: 'GH' },
  { id: 'slack', name: 'Slack', description: 'Workspaces, channels, messages and mentions', mark: 'S' },
  { id: 'gmail', name: 'Gmail', description: 'Incoming mail and mailbox events', mark: 'G' },
]

async function responseDetail(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json()
    if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail
  } catch {
    // Some gateway responses are not JSON.
  }
  return fallback
}

export function ConnectedAccountsSection({ onUnauthorized }: Props) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<Provider | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const popupRef = useRef<Window | null>(null)
  const popupProviderRef = useRef<Provider | null>(null)
  const popupPollRef = useRef<number | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/status', { credentials: 'same-origin' })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) throw new Error(await responseDetail(response, 'Could not load connected accounts.'))
      setStatus((await response.json()) as IntegrationStatus)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load connected accounts.')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const handleIntegrationUpdate = () => {
      setLoading(true)
      void loadStatus()
    }
    window.addEventListener('orbit:integrations-updated', handleIntegrationUpdate)
    return () => window.removeEventListener('orbit:integrations-updated', handleIntegrationUpdate)
  }, [loadStatus])


  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const popup = popupRef.current
      const provider = popupProviderRef.current
      const apiUrl = status?.public_url
      if (!popup || !provider || event.source !== popup || !apiUrl) return
      let expectedOrigin = ''
      try {
        expectedOrigin = new URL(apiUrl).origin
      } catch {
        return
      }
      if (event.origin !== expectedOrigin || event.data?.provider !== provider) return
      if (event.data?.type === 'orbit_integration_connected') {
        if (popupPollRef.current !== null) window.clearInterval(popupPollRef.current)
        popupPollRef.current = null
        popupRef.current = null
        popupProviderRef.current = null
        setConnecting(null)
        setError('')
        setNotice(`${PROVIDERS.find((item) => item.id === provider)?.name || provider} connected successfully.`)
        window.dispatchEvent(new Event('orbit:integrations-updated'))
        void loadStatus()
      } else if (event.data?.type === 'orbit_integration_error') {
        if (popupPollRef.current !== null) window.clearInterval(popupPollRef.current)
        popupPollRef.current = null
        popupRef.current = null
        popupProviderRef.current = null
        setConnecting(null)
        setError(String(event.data.message || 'The account could not be connected.'))
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [loadStatus, status?.public_url])

  useEffect(() => () => {
    if (popupPollRef.current !== null) window.clearInterval(popupPollRef.current)
  }, [])

  const connect = async (provider: Provider) => {
    setError('')
    setNotice('')
    // Reserve the popup synchronously during the click event. Opening it after
    // the OAuth-start request can be blocked by browser popup protection.
    const popup = window.open('about:blank', 'orbit-connected-account', 'popup,width=620,height=760')
    if (!popup) {
      setError('Allow pop-ups for Orbit to connect this account.')
      return
    }
    popupRef.current = popup
    popupProviderRef.current = provider
    setConnecting(provider)
    try {
      const response = await fetch(`/api/integrations/${provider}/oauth/start`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (response.status === 401) {
        popup.close()
        popupRef.current = null
        popupProviderRef.current = null
        onUnauthorized()
        return
      }
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || `Could not connect ${provider}.`)
      if (typeof data.auth_url !== 'string') throw new Error('The provider did not return an authorization URL.')
      popup.location.href = data.auth_url
      popup.focus()
      popupPollRef.current = window.setInterval(() => {
        if (!popup.closed) return
        if (popupPollRef.current !== null) window.clearInterval(popupPollRef.current)
        popupPollRef.current = null
        if (popupRef.current !== popup) return
        popupRef.current = null
        popupProviderRef.current = null
        setConnecting(null)
        void loadStatus()
      }, 700)
    } catch (connectError) {
      popup.close()
      popupRef.current = null
      popupProviderRef.current = null
      setConnecting(null)
      setError(connectError instanceof Error ? connectError.message : `Could not connect ${provider}.`)
    }
  }

  const disconnect = async (account: ConnectedAccount) => {
    const key = `${account.provider}:${account.provider_account_id}`
    setError('')
    setNotice('')
    setDisconnecting(key)
    try {
      const query = new URLSearchParams({ account_id: account.provider_account_id })
      const response = await fetch(`/api/integrations/${account.provider}?${query.toString()}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) throw new Error(await responseDetail(response, `Could not disconnect ${account.account_name}.`))
      setNotice(`${account.account_name} disconnected.`)
      await loadStatus()
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Could not disconnect this account.')
    } finally {
      setDisconnecting(null)
    }
  }

  const platformStatus = (provider: Provider) => {
    if (!status) return { ready: false, detail: 'Checking Orbit event delivery…' }
    if (provider === 'github') {
      const ready =
        status.public_url_configured &&
        status.webhook_payload_limit_configured &&
        status.token_storage_configured
      return {
        ready,
        detail: ready
          ? 'Orbit can register repository webhooks when you create a GitHub event trigger.'
          : 'Orbit needs its public webhook URL, secure token storage and webhook size limit configured.',
      }
    }
    if (provider === 'slack') {
      const ready = Boolean(status.slack.events_ready)
      return {
        ready,
        detail: ready
          ? 'Orbit’s Slack Events API endpoint is configured and ready for connected workspaces.'
          : 'Orbit’s administrator must finish the one-time Slack app Events API setup. You do not need to configure a separate Slack app.',
      }
    }
    const ready = Boolean(status.gmail.events_ready)
    return {
      ready,
      detail: ready
        ? 'Orbit’s Google Pub/Sub delivery is configured. Connected mailboxes can receive event notifications.'
        : 'Orbit’s administrator must configure Google Pub/Sub once for Orbit. You do not need to create a cloud project.',
    }
  }

  if (loading && !status) {
    return (
      <div className="ca-loading">
        <span className="spinner" />
        <span>Loading connected accounts…</span>
      </div>
    )
  }

  return (
    <div className="ca-page">
      <p className="ca-intro">
        Connect work accounts once and reuse them in event-triggered routines. Orbit stores provider
        tokens encrypted and only exposes account names and permissions in this list.
      </p>

      {error && <div className="ca-message error" role="alert">{error}</div>}
      {notice && <div className="ca-message success" role="status">{notice}</div>}

      <div className="ca-provider-list">
        {PROVIDERS.map((provider) => {
          const providerStatus = status?.[provider.id]
          const accounts = providerStatus?.accounts || []
          const canConnect = Boolean(
            providerStatus?.configured &&
            status?.token_storage_configured &&
            status?.public_url_configured,
          )
          const delivery = platformStatus(provider.id)

          return (
            <section className="ca-provider-card" key={provider.id}>
              <header className="ca-provider-header">
                <div className="ca-provider-brand">
                  <span className={`ca-provider-mark ${provider.id}`}>{provider.mark}</span>
                  <div>
                    <h3>{provider.name}</h3>
                    <p>{provider.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="ca-connect-button"
                  disabled={!canConnect || connecting !== null}
                  onClick={() => void connect(provider.id)}
                >
                  {connecting === provider.id ? 'Opening…' : accounts.length ? 'Connect another' : `Connect ${provider.name}`}
                  <Icon name="plus" size={14} />
                </button>
              </header>

              {accounts.length ? (
                <div className="ca-accounts">
                  {accounts.map((account) => {
                    const key = `${account.provider}:${account.provider_account_id}`
                    return (
                      <div className="ca-account-row" key={key}>
                        <div className="ca-account-avatar">{account.account_name.slice(0, 1).toUpperCase()}</div>
                        <div className="ca-account-copy">
                          <strong>{account.account_name}</strong>
                          <span>{account.scopes.length ? account.scopes.join(' · ') : 'Account connected'}</span>
                        </div>
                        <span className="ca-connected-pill"><Icon name="checkCircle" size={12} /> Connected</span>
                        <button
                          type="button"
                          className="ca-disconnect-button"
                          disabled={disconnecting !== null}
                          onClick={() => void disconnect(account)}
                        >
                          {disconnecting === key ? 'Disconnecting…' : 'Disconnect'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="ca-empty-account">
                  <span>No {provider.name} accounts connected yet.</span>
                </div>
              )}

              <div className={`ca-delivery-status ${delivery.ready ? 'ready' : 'setup'}`}>
                <span className="ca-status-dot" />
                <div>
                  <strong>{delivery.ready ? 'Event delivery ready' : 'Orbit setup required'}</strong>
                  <p>{delivery.detail}</p>
                </div>
              </div>

              {!canConnect && (
                <div className="ca-setup-note">
                  {!providerStatus?.configured && <span>Provider OAuth credentials are not configured on the Orbit server.</span>}
                  {!status?.token_storage_configured && <span>Secure token storage is not configured on the Orbit server.</span>}
                  {!status?.public_url_configured && <span>Orbit’s public HTTPS callback URL is not configured.</span>}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="ca-security-note">
        <Icon name="shield" size={16} />
        <span>Tokens are encrypted before they are stored. Disconnecting an account removes its saved credentials; routines that depend on that account may be paused or require reconnection.</span>
      </div>
    </div>
  )
}
