import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from './Icon'
import type {
  ConnectorConfigValue,
  IconName,
  MarketplaceCatalog,
  MarketplaceConnector,
  MarketplaceSkill,
} from './types'
import './MarketplaceView.css'

type MarketplaceViewProps = {
  onClose: () => void
  onOpenCapabilities?: () => void
  initialTab?: 'all' | 'connectors' | 'skills'
  initialConnectorId?: string | null
}

async function fetchMarketplaceJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  const ct = res.headers.get('content-type') || ''
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100) || res.statusText}`)
  }
  if (!ct.includes('application/json')) {
    throw new Error('Received non-JSON HTML response (check API proxy)')
  }
  return (await res.json()) as T
}

let marketplaceCatalogCache: { data: MarketplaceCatalog; fetchedAt: number } | null = null
let marketplaceCatalogRequest: Promise<MarketplaceCatalog> | null = null

async function loadMarketplaceCatalog(force = false): Promise<MarketplaceCatalog> {
  if (!force && marketplaceCatalogCache && Date.now() - marketplaceCatalogCache.fetchedAt < 5 * 60_000) {
    return marketplaceCatalogCache.data
  }
  if (marketplaceCatalogRequest) return marketplaceCatalogRequest
  const request = fetchMarketplaceJson<MarketplaceCatalog>('/api/marketplace')
    .then((data) => {
      marketplaceCatalogCache = { data, fetchedAt: Date.now() }
      return data
    })
    .finally(() => {
      if (marketplaceCatalogRequest === request) marketplaceCatalogRequest = null
    })
  marketplaceCatalogRequest = request
  return request
}

function toFaviconDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'calendarmcp.googleapis.com') return 'calendar.google.com'
  if (host === 'drivemcp.googleapis.com') return 'drive.google.com'
  if (host === 'gmailmcp.googleapis.com') return 'mail.google.com'
  const parts = host.split('.').filter(Boolean)
  const twoPartTlds = new Set(['co.uk', 'org.uk', 'com.au', 'co.jp', 'com.br', 'co.in'])
  const apex =
    parts.length >= 3 && twoPartTlds.has(parts.slice(-2).join('.'))
      ? parts.slice(-3).join('.')
      : parts.length >= 2
      ? parts.slice(-2).join('.')
      : host
  const apexAliases: Record<string, string> = {
    'adobe.io': 'adobe.com',
    'googleapis.com': 'google.com',
    'githubapp.com': 'github.com',
  }
  return apexAliases[apex] || apex
}

function getConnectorFaviconUrl(connector: MarketplaceConnector): string | null {
  const rawUrl =
    connector.mcpUrl ||
    String(
      connector.configFields?.find((f) => f.key === 'server_url')?.default ||
        connector.configFields?.find((f) => f.key === 'server_url')?.placeholder ||
        '',
    )
  if (!rawUrl) return null
  try {
    const domain = toFaviconDomain(new URL(rawUrl).hostname)
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
  } catch {
    return null
  }
}

function ConnectorBadgeIcon({ connector, size }: { connector: MarketplaceConnector; size: number }) {
  const [failed, setFailed] = useState(false)
  const faviconUrl = getConnectorFaviconUrl(connector)
  useEffect(() => {
    setFailed(false)
  }, [faviconUrl])

  if (faviconUrl && !failed) {
    return (
      <img
        src={faviconUrl}
        alt=""
        width={size}
        height={size}
        className="connector-favicon-img"
        loading="lazy"
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth <= 16) setFailed(true)
        }}
        onError={() => setFailed(true)}
      />
    )
  }
  const fallbackName: IconName =
    connector.icon && connector.icon !== 'plug' ? (connector.icon as IconName) : 'link'
  return <Icon name={fallbackName || 'tool'} size={size} />
}

export function MarketplaceView({ onClose, onOpenCapabilities, initialTab = 'all', initialConnectorId }: MarketplaceViewProps) {
  const popupRef = useRef<Window | null>(null)
  const popupProviderRef = useRef<string | null>(null)
  const pendingConnectorIdRef = useRef<string | null>(null)
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(() => marketplaceCatalogCache?.data ?? null)
  const [loading, setLoading] = useState(() => marketplaceCatalogCache === null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'connectors' | 'skills'>(initialTab)
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [installedOnly, setInstalledOnly] = useState(false)

  // Modals state
  const [configuringConnector, setConfiguringConnector] = useState<MarketplaceConnector | null>(null)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(initialConnectorId ?? null)
  const selectedConnectorDetails = useMemo(
    () => catalog?.connectors.find((connector) => connector.id === selectedConnectorId) ?? null,
    [catalog, selectedConnectorId],
  )
  const [configFormValues, setConfigFormValues] = useState<Record<string, ConnectorConfigValue>>({})
  const [configEnabled, setConfigEnabled] = useState(true)
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({})
  const [savingConfig, setSavingConfig] = useState(false)

  const [activeReadmeSkill, setActiveReadmeSkill] = useState<MarketplaceSkill | null>(null)
  const [readmeContent, setReadmeContent] = useState<string>('')
  const [loadingReadme, setLoadingReadme] = useState(false)

  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  const showToast = (message: string) => {
    setActionFeedback(message)
    window.setTimeout(() => {
      setActionFeedback((curr) => (curr === message ? null : curr))
    }, 4000)
  }

  // OAuth popup listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const popup = popupRef.current
      const provider = popupProviderRef.current
      if (!popup || !provider || event.source !== popup) return
      if (event.data?.type === 'orbit_integration_connected') {
        popupRef.current = null
        popupProviderRef.current = null
        showToast(`${provider === 'gmail' ? 'Gmail' : provider} connected successfully!`)
        const connectorId = pendingConnectorIdRef.current
        pendingConnectorIdRef.current = null
        const refreshAfterConnect = async () => {
          if (connectorId) {
            try {
              await fetch(`/api/marketplace/connectors/${encodeURIComponent(connectorId)}/toggle`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin', body: JSON.stringify({ enabled: true }),
              })
            } catch {
              // The provider account is saved even if the connector setting needs a retry.
            }
          }
          window.dispatchEvent(new Event('orbit:integrations-updated'))
          window.dispatchEvent(new Event('orbit:marketplace-updated'))
        }
        void refreshAfterConnect()
      } else if (event.data?.type === 'orbit_integration_error') {
        popupRef.current = null
        popupProviderRef.current = null
        pendingConnectorIdRef.current = null
        showToast(String(event.data.message || 'The account could not be connected.'))
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const startOAuth = async (provider: string, connectorId?: string) => {
    // Open synchronously from the click event before waiting for the API.
    const popup = window.open('about:blank', 'orbit-oauth-popup', 'popup,width=620,height=760')
    if (!popup) {
      showToast('Please allow popups in your browser to connect this account.')
      return
    }
    popupRef.current = popup
    popupProviderRef.current = provider
    pendingConnectorIdRef.current = connectorId || null
    try {
      const response = await fetch(`/api/integrations/${provider}/oauth/start`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.detail || `Could not start ${provider} authorization. Check backend configuration.`)
      }
      if (typeof data.auth_url !== 'string') {
        throw new Error('No authorization URL returned from server.')
      }
      popup.location.href = data.auth_url
      popup.focus()
    } catch (err) {
      popupRef.current?.close()
      popupRef.current = null
      popupProviderRef.current = null
      pendingConnectorIdRef.current = null
      showToast(err instanceof Error ? err.message : 'Failed to launch sign-in window.')
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await loadMarketplaceCatalog(reloadNonce > 0)
        if (!active) return
        setCatalog(data)
        setError('')
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to connect to marketplace')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [reloadNonce])

  const triggerReload = useCallback(() => {
    // Keep the last catalog visible while refreshing in the background.
    if (!marketplaceCatalogCache) setLoading(true)
    setReloadNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let refreshTimer: number | undefined
    const refreshCatalog = () => {
      // OAuth completion emits both events; coalesce them into one catalog request.
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => triggerReload(), 120)
    }
    window.addEventListener('orbit:marketplace-updated', refreshCatalog)
    window.addEventListener('orbit:integrations-updated', refreshCatalog)
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      window.removeEventListener('orbit:marketplace-updated', refreshCatalog)
      window.removeEventListener('orbit:integrations-updated', refreshCatalog)
    }
  }, [triggerReload])



  // Toggle skill install
  const toggleSkill = async (skill: MarketplaceSkill) => {
    const nextState = !skill.is_installed
    try {
      await fetchMarketplaceJson(
        `/api/marketplace/skills/${encodeURIComponent(skill.id)}/toggle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ install: nextState }),
        },
      )
      setCatalog((current) => {
        if (!current) return current
        const updatedSkills = current.skills.map((s) =>
          s.id === skill.id ? { ...s, is_installed: nextState } : s,
        )
        const installedCount = updatedSkills.filter((s) => s.is_installed).length
        return {
          ...current,
          skills: updatedSkills,
          stats: {
            ...current.stats,
            installed_skills: installedCount,
          },
        }
      })
      window.dispatchEvent(new Event('orbit:marketplace-updated'))
      showToast(nextState ? `Installed ${skill.name}` : `Uninstalled ${skill.name}`)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Action failed'}`)
    }
  }

  const setConnectorEnabled = async (connector: MarketplaceConnector, enabled: boolean) => {
    try {
      await fetchMarketplaceJson(
        `/api/marketplace/connectors/${encodeURIComponent(connector.id)}/toggle`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ enabled }) },
      )
      setCatalog((current) => {
        if (!current) return current
        const updatedConnectors = current.connectors.map((item) => {
          if (item.id !== connector.id) return item
          const nextStatus: MarketplaceConnector['status'] = !enabled
            ? 'available'
            : item.is_authenticated === false
              ? 'needs_auth'
              : item.is_configured
                ? 'active'
                : 'needs_config'
          const disconnectedOAuth = !enabled && Boolean(item.oauthProvider)
          return {
            ...item,
            is_enabled: enabled,
            status: nextStatus,
            ...(disconnectedOAuth
              ? { is_authenticated: false, connected_account: null, reconnect_required: false, reconnect_message: null }
              : {}),
          }
        })
        return { ...current, connectors: updatedConnectors, stats: {
          ...current.stats,
          active_connectors: updatedConnectors.filter((item) => item.is_enabled && item.is_configured && item.is_authenticated !== false).length,
        } }
      })
      window.dispatchEvent(new Event('orbit:marketplace-updated'))
      if (!enabled && connector.oauthProvider) {
        window.dispatchEvent(new Event('orbit:integrations-updated'))
      }
      showToast(enabled ? `Connected ${connector.name}` : `Disconnected ${connector.name}`)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Action failed'}`)
    }
  }

  const openConnectorDetails = (connector: MarketplaceConnector) => {
    setSelectedConnectorId(connector.id)
  }

  const connectFromDetails = (connector: MarketplaceConnector) => {
    if (connector.oauthProvider) void startOAuth(connector.oauthProvider, connector.id)
    else if (!connector.is_enabled) void setConnectorEnabled(connector, true)
  }

  // Open Configure Modal
  const openConfigureModal = (connector: MarketplaceConnector) => {
    setConfiguringConnector(connector)
    setConfigFormValues(connector.config || {})
    setConfigEnabled(true)
    setShowPasswordMap({})
  }

  // Save Connector Configuration
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!configuringConnector) return
    try {
      setSavingConfig(true)
      await fetchMarketplaceJson(
        `/api/marketplace/connectors/${encodeURIComponent(configuringConnector.id)}/config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: configEnabled,
            config: configFormValues,
          }),
        },
      )
      triggerReload()
      window.dispatchEvent(new Event('orbit:marketplace-updated'))
      setConfiguringConnector(null)
      showToast(`Saved configuration for ${configuringConnector.name}`)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSavingConfig(false)
    }
  }

  // Open Skill Readme Modal
  const openSkillReadme = async (skill: MarketplaceSkill) => {
    setActiveReadmeSkill(skill)
    setLoadingReadme(true)
    setReadmeContent('')
    try {
      const data = await fetchMarketplaceJson<{ readme?: string }>(
        `/api/marketplace/skills/${encodeURIComponent(skill.id)}/readme`,
      )
      setReadmeContent(data.readme || '# No documentation provided.')
    } catch {
      setReadmeContent('# Documentation Not Found\nThis skill has no SKILL.md file.')
    } finally {
      setLoadingReadme(false)
    }
  }

  // Filtered Items
  const filteredConnectors = useMemo(() => {
    if (!catalog) return []
    if (activeTab === 'skills') return []
    const q = searchQuery.toLowerCase().trim()
    return catalog.connectors.filter((c) => {
      if (installedOnly && !c.is_enabled) return false
      if (selectedCategory !== 'All' && c.category !== selectedCategory) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.capabilities.some((cap) => cap.toLowerCase().includes(q))
      )
    })
  }, [catalog, activeTab, searchQuery, selectedCategory, installedOnly])

  const filteredSkills = useMemo(() => {
    if (!catalog) return []
    if (activeTab === 'connectors') return []
    const q = searchQuery.toLowerCase().trim()
    return catalog.skills.filter((s) => {
      if (installedOnly && !s.is_installed) return false
      if (selectedCategory !== 'All' && s.category !== selectedCategory) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      )
    })
  }, [catalog, activeTab, searchQuery, selectedCategory, installedOnly])

  const totalFilteredCount = filteredConnectors.length + filteredSkills.length
  const totalCatalogItems = catalog ? catalog.skills.length + catalog.connectors.length : 0

  return (
    <div className="marketplace-container">
      <div className="marketplace-content">
        {/* Header */}
        <div className="marketplace-header">
          <div className="marketplace-title-group">
            <h1>Marketplace</h1>
            <p className="marketplace-subtitle">
              Discover shared skills and integrations across Orbit Agent Studio. Personal skills and
              custom MCP servers live in Settings → Capabilities.
            </p>
          </div>
          <div className="marketplace-stats-bar">
            {onOpenCapabilities && (
              <button
                type="button"
                className="marketplace-header-cta"
                onClick={onOpenCapabilities}
              >
                <Icon name="puzzle" size={14} />
                <span>Personal Capabilities</span>
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              title="Close Marketplace"
              aria-label="Close Marketplace"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Sleek Inline Toolbar */}
        <div className="marketplace-toolbar">
          <div className="toolbar-primary-row">
            <div className="marketplace-tabs">
              <button
                type="button"
                className={`marketplace-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <span>All</span>
                {totalCatalogItems > 0 && <span className="tab-badge">{totalCatalogItems}</span>}
              </button>
              <button
                type="button"
                className={`marketplace-tab-btn ${activeTab === 'connectors' ? 'active' : ''}`}
                onClick={() => setActiveTab('connectors')}
              >
                <span>Connectors</span>
                {catalog && catalog.stats.total_connectors > 0 && (
                  <span className="tab-badge">{catalog.stats.total_connectors}</span>
                )}
              </button>
              <button
                type="button"
                className={`marketplace-tab-btn ${activeTab === 'skills' ? 'active' : ''}`}
                onClick={() => setActiveTab('skills')}
              >
                <span>Skills</span>
                {catalog && catalog.stats.total_skills > 0 && (
                  <span className="tab-badge">{catalog.stats.total_skills}</span>
                )}
              </button>
            </div>

            <div className="toolbar-right-controls">
              <div className="marketplace-search-wrapper">
                <Icon name="search" size={14} />
                <input
                  type="text"
                  className="marketplace-search-input"
                  placeholder="Search marketplace…"
                  aria-label="Search marketplace"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="marketplace-search-clear"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={installedOnly}
                className={`installed-filter-pill ${installedOnly ? 'active' : ''}`}
                onClick={() => setInstalledOnly((prev) => !prev)}
              >
                <span className="installed-pill-dot" />
                <span>Installed only</span>
              </button>
            </div>
          </div>

          {catalog && catalog.categories.length > 1 && (
            <div className="marketplace-categories-row">
              {catalog.categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Toast */}
        {actionFeedback && (
          <div className="marketplace-toast" role="status">
            <Icon name="checkCircle" size={15} />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Loading / Error */}
        {loading && catalog && <p className="config-help-text" role="status">Refreshing Marketplace…</p>}
        {error && catalog && <p className="config-help-text" role="status">Could not refresh Marketplace: {error}</p>}
        {loading && !catalog && (
          <div className="marketplace-state-box">
            <span className="spinner" />
            <p>Loading catalog…</p>
          </div>
        )}

        {!catalog && !loading && error && (
          <div className="marketplace-state-box marketplace-error-box">
            <Icon name="alertTriangle" size={26} />
            <p>{error}</p>
            <button type="button" className="card-action-btn btn-secondary" onClick={triggerReload}>
              Retry
            </button>
          </div>
        )}

        {/* Catalog Grid / Empty State */}
        {catalog && (
          totalCatalogItems === 0 ? (
            <div className="marketplace-empty-card">
              <div className="marketplace-empty-icon">
                <Icon name="store" size={26} />
              </div>
              <h3>No shared items in Marketplace yet</h3>
              <p>
                Official workspace extensions and community packages will show up here when
                published. To add private skills or connect custom MCP servers for your own
                account, open Settings → Capabilities.
              </p>
              <div className="marketplace-empty-actions">
                {onOpenCapabilities && (
                  <button
                    type="button"
                    className="marketplace-primary-cta"
                    onClick={onOpenCapabilities}
                  >
                    <Icon name="plus" size={14} />
                    <span>Add in Capabilities</span>
                  </button>
                )}
                <button
                  type="button"
                  className="card-action-btn btn-secondary"
                  onClick={triggerReload}
                >
                  <Icon name="refresh" size={13} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="marketplace-grid">
              {filteredConnectors.map((connector) => (
                <div
                  key={`connector-${connector.id}`}
                  className={`marketplace-card marketplace-connector-card ${connector.is_enabled ? 'active-card' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${connector.name}`}
                  onClick={(event) => { event.stopPropagation(); openConnectorDetails(connector) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openConnectorDetails(connector)
                    }
                  }}
                >
                  <div className="card-top">
                    <div className="card-icon-badge connector-icon-badge">
                      <ConnectorBadgeIcon connector={connector} size={20} />
                    </div>
                    <div className="card-title-block">
                      <div className="card-title-row">
                        <h3 className="card-title">{connector.name}</h3>
                        <span className="card-type-pill connector-pill">Connector</span>
                      </div>
                      <span className="card-category" title={connector.connected_account?.email ? `${connector.category} · Connected as ${connector.connected_account.email}` : undefined}>
                        {connector.category} · {connector.connected_account?.email ? connector.connected_account.email : connector.authType}
                      </span>
                    </div>
                  </div>

                  <div className="card-body">
                    <p className="card-description">{connector.description}</p>

                    {connector.capabilities && connector.capabilities.length > 0 && (
                      <div className="card-capabilities">
                        {connector.capabilities.slice(0, 3).map((cap, idx) => (
                          <span key={idx} className="capability-tag">
                            {cap}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card-footer">
                    <div
                      className="card-status-indicator"
                      title={connector.connected_account?.email ? `Connected as ${connector.connected_account.email}` : undefined}
                    >
                      <span
                        className={`status-dot ${
                          connector.is_enabled
                            ? !connector.is_authenticated && connector.oauthProvider
                              ? 'needs-config'
                              : connector.is_configured
                                ? 'active'
                                : 'needs-config'
                            : 'available'
                        }`}
                      />
                      <span>
                        {connector.is_enabled && connector.is_configured && connector.is_authenticated !== false ? 'Connected' : 'Not connected'}
                      </span>
                    </div>

                    <div className="card-actions">
                      {connector.configFields && connector.configFields.length > 0 && (
                        <button
                          type="button"
                          className="card-action-btn btn-secondary"
                          onClick={(event) => { event.stopPropagation(); openConfigureModal(connector) }}
                        >
                          <Icon name="settings" size={13} />
                          <span>Configure</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`card-action-btn ${connector.is_enabled && connector.is_configured && connector.is_authenticated !== false ? 'btn-installed' : 'btn-primary'}`}
                        onClick={() => openConnectorDetails(connector)}
                      >
                        {connector.is_enabled && connector.is_configured && connector.is_authenticated !== false ? 'Connected' : 'Connect'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredSkills.map((skill) => (
                <div
                  key={`skill-${skill.id}`}
                  className={`marketplace-card ${skill.is_installed ? 'active-card' : ''}`}
                >
                  <div className="card-top">
                    <div className="card-icon-badge skill-icon-badge">
                      <Icon name="puzzle" size={20} />
                    </div>
                    <div className="card-title-block">
                      <div className="card-title-row">
                        <h3 className="card-title">{skill.name}</h3>
                        <span className="card-type-pill skill-pill">Skill</span>
                      </div>
                      <span className="card-category">{skill.category}</span>
                    </div>
                  </div>

                  <div className="card-body">
                    <p className="card-description">{skill.description}</p>
                  </div>

                  <div className="card-footer">
                    <div className="card-status-indicator">
                      <span className={`status-dot ${skill.is_installed ? 'active' : 'available'}`} />
                      <span>{skill.is_installed ? 'Installed' : 'Available'}</span>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className="card-action-btn btn-secondary"
                        onClick={() => void openSkillReadme(skill)}
                      >
                        <Icon name="fileText" size={13} />
                        <span>Playbook</span>
                      </button>
                      <button
                        type="button"
                        className={`card-action-btn ${skill.is_installed ? 'btn-installed' : 'btn-primary'}`}
                        onClick={() => void toggleSkill(skill)}
                      >
                        {skill.is_installed ? (
                          <>
                            <Icon name="check" size={13} />
                            <span>Installed</span>
                          </>
                        ) : (
                          <span>Install</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {totalFilteredCount === 0 && (
                <div className="marketplace-empty-search">
                  <Icon name="search" size={28} />
                  <h3>No matching connectors or skills found</h3>
                  <p>Try clearing filters or adjusting your search keywords.</p>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Connector details */}
      {selectedConnectorDetails && (
        <div
          className="marketplace-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedConnectorId(null)
          }}
        >
          <section className="marketplace-modal-card connector-details-modal" role="dialog" aria-modal="true" aria-labelledby="connector-details-title">
            <div className="modal-header connector-details-header">
              <div className="modal-header-left">
                <div className="card-icon-badge connector-icon-badge connector-details-icon">
                  <ConnectorBadgeIcon connector={selectedConnectorDetails} size={26} />
                </div>
                <div className="connector-details-heading">
                  <div className="connector-details-title-row">
                    <h2 id="connector-details-title">{selectedConnectorDetails.name}</h2>
                    <span className="card-type-pill connector-pill">Connector</span>
                  </div>
                  <span className="card-category">{selectedConnectorDetails.category} · {selectedConnectorDetails.authType}</span>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setSelectedConnectorId(null)} aria-label="Close details"><Icon name="close" size={16} /></button>
            </div>

            <div className="modal-body connector-details-body">
              <p className="connector-details-description">{selectedConnectorDetails.description}</p>

              <div className="connector-details-status">
                <span className={`status-dot ${selectedConnectorDetails.is_enabled && selectedConnectorDetails.is_configured && selectedConnectorDetails.is_authenticated !== false ? 'active' : 'available'}`} />
                <strong>{selectedConnectorDetails.is_enabled && selectedConnectorDetails.is_configured && selectedConnectorDetails.is_authenticated !== false ? 'Connected' : selectedConnectorDetails.is_enabled ? 'Setup required' : 'Not connected'}</strong>
                {selectedConnectorDetails.connected_account?.email && <span>· {selectedConnectorDetails.connected_account.email}</span>}
                {selectedConnectorDetails.connected_account?.account_name && !selectedConnectorDetails.connected_account?.email && <span>· {selectedConnectorDetails.connected_account.account_name}</span>}
              </div>

              <section className="connector-detail-section">
                <h3>Overview</h3>
                <p>{selectedConnectorDetails.description}</p>
                <div className="connector-detail-meta">
                  <div><span>Category</span><strong>{selectedConnectorDetails.category}</strong></div>
                  <div><span>Authentication</span><strong>{selectedConnectorDetails.authType}</strong></div>
                  <div><span>Connection status</span><strong>{selectedConnectorDetails.is_enabled && selectedConnectorDetails.is_configured && selectedConnectorDetails.is_authenticated !== false ? 'Active' : 'Not connected'}</strong></div>
                </div>
              </section>

              <section className="connector-detail-section">
                <h3>What you can do</h3>
                {selectedConnectorDetails.capabilities?.length ? (
                  <ul className="connector-capability-list">
                    {selectedConnectorDetails.capabilities.map((capability) => (
                      <li key={capability}><Icon name="check" size={14} /><span>{capability}</span></li>
                    ))}
                  </ul>
                ) : <p>Capabilities will be shown here when provided by this connector.</p>}
              </section>

              <section className="connector-detail-section">
                <h3>Setup and permissions</h3>
                <p>{selectedConnectorDetails.oauthProvider
                  ? 'Orbit will ask you to authorize access with the provider. You can review and approve the requested access during sign-in.'
                  : selectedConnectorDetails.configFields?.length
                    ? 'This connector needs configuration before it can be used. Only enter credentials in the secure configuration form.'
                    : 'This connector uses Orbit’s built-in connection flow. Connect it to make its available actions accessible to your agent.'}</p>
                {selectedConnectorDetails.configFields?.length > 0 && (
                  <div className="connector-config-field-list">
                    <span className="connector-detail-label">Configuration fields</span>
                    {selectedConnectorDetails.configFields.map((field) => (
                      <div key={field.key}><span>{field.label}</span><span>{field.required ? 'Required' : 'Optional'}</span></div>
                    ))}
                  </div>
                )}
              </section>

              {selectedConnectorDetails.website && (
                <section className="connector-detail-section connector-docs-section">
                  <h3>Resources</h3>
                  <a href={selectedConnectorDetails.website} target="_blank" rel="noreferrer">
                    <Icon name="externalLink" size={14} /> Official website and documentation
                  </a>
                </section>
              )}
            </div>

            <div className="modal-footer connector-details-footer">
              <button type="button" className="card-action-btn btn-secondary" onClick={() => setSelectedConnectorId(null)}>Close</button>
              {selectedConnectorDetails.configFields?.length > 0 && (
                <button type="button" className="card-action-btn btn-secondary" onClick={() => {
                  setConfiguringConnector(selectedConnectorDetails)
                  setConfigFormValues(selectedConnectorDetails.config || {})
                  setConfigEnabled(true)
                  setSelectedConnectorId(null)
                }}>Configure</button>
              )}
              <button
                type="button"
                disabled={!selectedConnectorDetails.oauthProvider && selectedConnectorDetails.is_enabled && selectedConnectorDetails.is_configured}
                className={`card-action-btn ${selectedConnectorDetails.is_enabled && selectedConnectorDetails.is_authenticated !== false ? 'btn-installed' : 'btn-primary'}`}
                onClick={() => connectFromDetails(selectedConnectorDetails)}
                title={selectedConnectorDetails.oauthProvider && selectedConnectorDetails.is_authenticated ? 'Reconnect or choose an account' : 'Connect this service'}
              >
                {selectedConnectorDetails.is_authenticated && selectedConnectorDetails.is_enabled ? 'Connected' : 'Connect'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Configure Connector Modal */}
      {configuringConnector && (
        <div
          className="marketplace-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfiguringConnector(null)
          }}
        >
          <div className="marketplace-modal-card">
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="card-icon-badge connector-icon-badge">
                  <ConnectorBadgeIcon connector={configuringConnector} size={20} />
                </div>
                <div>
                  <h2>Configure {configuringConnector.name}</h2>
                  <span className="card-category">
                    {configuringConnector.category} · {configuringConnector.authType}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setConfiguringConnector(null)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSaveConfig}
              style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <div className="modal-body">
                <p className="modal-description">{configuringConnector.description}</p>

                {(!configuringConnector.configFields || configuringConnector.configFields.length === 0) && (
                  <p className="config-help-text" style={{ margin: '1rem 0', fontSize: '0.875rem' }}>
                    This connector is built-in and co-hosted with the backend. It automatically uses your authenticated credentials — no manual server URLs or secrets are required.
                  </p>
                )}

                {configuringConnector.configFields?.map((field) => {
                  const isPassword = field.type === 'password'
                  const showPlain = showPasswordMap[field.key]
                  const fieldType = isPassword ? (showPlain ? 'text' : 'password') : 'text'

                  if (field.type === 'boolean') {
                    return (
                      <label key={field.key} className="config-toggle-switch">
                        <input
                          type="checkbox"
                          checked={Boolean(configFormValues[field.key])}
                          onChange={(e) =>
                            setConfigFormValues({
                              ...configFormValues,
                              [field.key]: e.target.checked,
                            })
                          }
                        />
                        <div>
                          <strong>{field.label}</strong>
                          {field.helpText && <span>{field.helpText}</span>}
                        </div>
                      </label>
                    )
                  }

                  return (
                    <div key={field.key} className="config-form-group">
                      <label htmlFor={`cfg-${field.key}`}>
                        {field.label}
                        {field.required && <span className="required-mark">*</span>}
                      </label>
                      <div className="config-input-wrapper">
                        <input
                          id={`cfg-${field.key}`}
                          type={fieldType}
                          className="config-text-input"
                          placeholder={field.placeholder || ''}
                          value={String(configFormValues[field.key] ?? '')}
                          onChange={(e) =>
                            setConfigFormValues({ ...configFormValues, [field.key]: e.target.value })
                          }
                          required={field.required && configEnabled && !configFormValues[field.key]}
                        />
                        {isPassword && (
                          <button
                            type="button"
                            className="password-toggle-btn"
                            onClick={() =>
                              setShowPasswordMap({ ...showPasswordMap, [field.key]: !showPlain })
                            }
                            title={showPlain ? 'Hide secret' : 'Show secret'}
                          >
                            <Icon name={showPlain ? 'eyeOff' : 'eye'} size={15} />
                          </button>
                        )}
                      </div>
                      {field.helpText && <p className="config-help-text">{field.helpText}</p>}
                    </div>
                  )
                })}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="card-action-btn btn-secondary"
                  onClick={() => setConfiguringConnector(null)}
                  disabled={savingConfig}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="card-action-btn btn-primary"
                  disabled={savingConfig}
                >
                  {savingConfig ? 'Saving...' : 'Save & Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skill Readme Modal */}
      {activeReadmeSkill && (
        <div
          className="marketplace-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveReadmeSkill(null)
          }}
        >
          <div className="marketplace-modal-card readme-modal">
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="card-icon-badge skill-icon-badge">
                  <Icon name="puzzle" size={20} />
                </div>
                <div>
                  <h2>{activeReadmeSkill.name}</h2>
                  <span className="card-category">
                    {activeReadmeSkill.category} · Agent Skill Playbook
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  className={`card-action-btn ${activeReadmeSkill.is_installed ? 'btn-installed' : 'btn-primary'}`}
                  onClick={() => {
                    void toggleSkill(activeReadmeSkill)
                    setActiveReadmeSkill({
                      ...activeReadmeSkill,
                      is_installed: !activeReadmeSkill.is_installed,
                    })
                  }}
                >
                  {activeReadmeSkill.is_installed ? 'Installed' : 'Install Skill'}
                </button>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setActiveReadmeSkill(null)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh' }}>
              {loadingReadme ? (
                <div className="marketplace-state-box">
                  <span className="spinner" />
                  <p>Loading playbook markdown...</p>
                </div>
              ) : (
                <div className="readme-content-viewer">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeContent}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
