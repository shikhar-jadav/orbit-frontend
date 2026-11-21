import { useEffect, useMemo, useState } from 'react'
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
}

async function fetchMarketplaceJson<T>(
  primaryUrl: string,
  fallbackUrl?: string,
  options?: RequestInit,
): Promise<T> {
  const tryFetch = async (url: string) => {
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

  try {
    return await tryFetch(primaryUrl)
  } catch (primaryErr) {
    if (fallbackUrl) {
      try {
        return await tryFetch(fallbackUrl)
      } catch {
        throw primaryErr
      }
    }
    throw primaryErr
  }
}

export function MarketplaceView({ onClose, onOpenCapabilities }: MarketplaceViewProps) {
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'connectors' | 'skills'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [installedOnly, setInstalledOnly] = useState(false)

  // Modals state
  const [configuringConnector, setConfiguringConnector] = useState<MarketplaceConnector | null>(null)
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
    }, 3000)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await fetchMarketplaceJson<MarketplaceCatalog>(
          '/api/marketplace',
          '/marketplace',
        )
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

  const triggerReload = () => {
    setLoading(true)
    setReloadNonce((n) => n + 1)
  }

  // Toggle skill install
  const toggleSkill = async (skill: MarketplaceSkill) => {
    const nextState = !skill.is_installed
    try {
      await fetchMarketplaceJson(
        `/api/marketplace/skills/${encodeURIComponent(skill.id)}/toggle`,
        `/marketplace/skills/${encodeURIComponent(skill.id)}/toggle`,
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
      showToast(nextState ? `Installed ${skill.name}` : `Uninstalled ${skill.name}`)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Action failed'}`)
    }
  }

  // Toggle connector enabled
  const toggleConnector = async (connector: MarketplaceConnector) => {
    const nextState = !connector.is_enabled
    try {
      await fetchMarketplaceJson(
        `/api/marketplace/connectors/${encodeURIComponent(connector.id)}/toggle`,
        `/marketplace/connectors/${encodeURIComponent(connector.id)}/toggle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextState }),
        },
      )
      setCatalog((current) => {
        if (!current) return current
        const updatedConnectors = current.connectors.map((c) => {
          if (c.id === connector.id) {
            const nextStatus: MarketplaceConnector['status'] =
              nextState && c.is_configured
                ? 'active'
                : nextState
                ? 'needs_config'
                : 'available'
            return { ...c, is_enabled: nextState, status: nextStatus }
          }
          return c
        })
        const activeCount = updatedConnectors.filter((c) => c.is_enabled && c.is_configured).length
        return {
          ...current,
          connectors: updatedConnectors,
          stats: {
            ...current.stats,
            active_connectors: activeCount,
          },
        }
      })
      showToast(nextState ? `Enabled ${connector.name}` : `Disabled ${connector.name}`)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Action failed'}`)
    }
  }

  // Open Configure Modal
  const openConfigureModal = (connector: MarketplaceConnector) => {
    setConfiguringConnector(connector)
    setConfigFormValues(connector.config || {})
    setConfigEnabled(connector.is_enabled)
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
        `/marketplace/connectors/${encodeURIComponent(configuringConnector.id)}/config`,
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
        `/marketplace/skills/${encodeURIComponent(skill.id)}/readme`,
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
        {loading && (
          <div className="marketplace-state-box">
            <span className="spinner" />
            <p>Loading catalog…</p>
          </div>
        )}

        {!loading && error && (
          <div className="marketplace-state-box marketplace-error-box">
            <Icon name="alertTriangle" size={26} />
            <p>{error}</p>
            <button type="button" className="card-action-btn btn-secondary" onClick={triggerReload}>
              Retry
            </button>
          </div>
        )}

        {/* Catalog Grid / Empty State */}
        {!loading && !error && (
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
                  className={`marketplace-card ${connector.is_enabled ? 'active-card' : ''}`}
                >
                  <div className="card-top">
                    <div className="card-icon-badge connector-icon-badge">
                      <Icon name={(connector.icon as IconName) || 'tool'} size={20} />
                    </div>
                    <div className="card-title-block">
                      <div className="card-title-row">
                        <h3 className="card-title">{connector.name}</h3>
                        <span className="card-type-pill connector-pill">Connector</span>
                      </div>
                      <span className="card-category">
                        {connector.category} · {connector.authType}
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
                    <div className="card-status-indicator">
                      <span
                        className={`status-dot ${
                          connector.is_enabled
                            ? connector.is_configured
                              ? 'active'
                              : 'needs-config'
                            : 'available'
                        }`}
                      />
                      <span>
                        {connector.is_enabled
                          ? connector.is_configured
                            ? 'Active'
                            : 'Config required'
                          : 'Available'}
                      </span>
                    </div>

                    <div className="card-actions">
                      <button
                        type="button"
                        className="card-action-btn btn-secondary"
                        onClick={() => openConfigureModal(connector)}
                      >
                        <Icon name="settings" size={13} />
                        <span>Configure</span>
                      </button>
                      <button
                        type="button"
                        className={`card-action-btn ${connector.is_enabled ? 'btn-installed' : 'btn-primary'}`}
                        onClick={() => void toggleConnector(connector)}
                      >
                        {connector.is_enabled ? (
                          <>
                            <Icon name="check" size={13} />
                            <span>Enabled</span>
                          </>
                        ) : (
                          <span>Enable</span>
                        )}
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
                  <Icon name={(configuringConnector.icon as IconName) || 'tool'} size={20} />
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

                <label className="config-toggle-switch">
                  <input
                    type="checkbox"
                    checked={configEnabled}
                    onChange={(e) => setConfigEnabled(e.target.checked)}
                  />
                  <div>
                    <strong>Enable Connector</strong>
                    <span>Allow the agent to access this service in chats and execution.</span>
                  </div>
                </label>

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
