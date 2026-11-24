import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { AddCustomConnectorModal, ConnectorDetailView } from './ConnectorModals'
import { SkillEditorModal, UploadSkillView } from './SkillModals'
import type {
  MarketplaceCatalog,
  MarketplaceConnector,
  MarketplaceSkill,
  PersonalConnector,
  PersonalSkill,
} from './types'

const capabilitiesDataCache: Partial<Record<'skills' | 'connectors' | 'marketplace', { data: unknown; fetchedAt: number }>> = {}
const CAPABILITIES_CACHE_TTL_MS = 5 * 60_000

type CapabilitiesTab = 'skills' | 'connectors'
type CapabilitiesView = 'yours' | 'discover'
type SkillFilter = 'all' | 'active' | 'drafts'
type SortOrder = 'newest' | 'name'

type CapabilitiesSectionProps = {
  onNavigateMarketplace?: (connectorId?: string) => void
  onCloseSettings: () => void
  onModalOpenChange?: (open: boolean) => void
  initialTab?: CapabilitiesTab
}

function formatShortDate(iso: string): string {
  try {
    const dt = new Date(iso)
    if (Number.isNaN(dt.getTime())) return iso.slice(0, 10)
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

export function CapabilitiesSection({
  onNavigateMarketplace,
  onCloseSettings,
  onModalOpenChange,
  initialTab = 'skills',
}: CapabilitiesSectionProps) {
  const [tab, setTab] = useState<CapabilitiesTab>(initialTab)
  const [view, setView] = useState<CapabilitiesView>('yours')
  const [search, setSearch] = useState('')
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [showFilterMenu, setShowFilterMenu] = useState(false)

  const [personalSkills, setPersonalSkills] = useState<PersonalSkill[]>([])
  const [personalConnectors, setPersonalConnectors] = useState<PersonalConnector[]>([])
  const [marketplaceSkills, setMarketplaceSkills] = useState<MarketplaceSkill[]>([])
  const [marketplaceConnectors, setMarketplaceConnectors] = useState<MarketplaceConnector[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadNonce, setReloadNonce] = useState(0)

  const [addDropdownOpen, setAddDropdownOpen] = useState(false)
  const [uploadViewOpen, setUploadViewOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<PersonalSkill | null>(null)
  const [createSkillModalOpen, setCreateSkillModalOpen] = useState(false)

  const [connectorModalOpen, setConnectorModalOpen] = useState(false)
  const [editingConnector, setEditingConnector] = useState<PersonalConnector | null>(null)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)

  const [skillMenuId, setSkillMenuId] = useState<string | null>(null)
  const [connectorMenuId, setConnectorMenuId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current))
    }, 3500)
  }

  useEffect(() => {
    const anyModal = createSkillModalOpen || Boolean(editingSkill) || connectorModalOpen
    onModalOpenChange?.(anyModal)
  }, [createSkillModalOpen, editingSkill, connectorModalOpen, onModalOpenChange])

  const loadedData = useRef({
    skills: false,
    connectors: false,
    marketplace: false,
  })
  const lastReloadNonce = useRef(reloadNonce)

  useEffect(() => {
    let active = true
    const sectionKey =
      view === 'discover' ? 'marketplace' : tab === 'skills' ? 'skills' : 'connectors'
    const forceReload = lastReloadNonce.current !== reloadNonce
    lastReloadNonce.current = reloadNonce

    if (loadedData.current[sectionKey] && !forceReload) {
      setLoading(false)
      return () => {
        active = false
      }
    }

    const cached = capabilitiesDataCache[sectionKey]
    if (cached) {
      if (sectionKey === 'marketplace') {
        const catalog = cached.data as MarketplaceCatalog
        setMarketplaceSkills(catalog.skills ?? [])
        setMarketplaceConnectors(catalog.connectors ?? [])
      } else if (sectionKey === 'skills') {
        setPersonalSkills(cached.data as PersonalSkill[])
      } else {
        setPersonalConnectors(cached.data as PersonalConnector[])
        const marketplaceCached = capabilitiesDataCache.marketplace
        if (marketplaceCached) {
          const catalog = marketplaceCached.data as MarketplaceCatalog
          setMarketplaceConnectors(catalog.connectors ?? [])
        }
      }
      setLoading(false)
      if (!forceReload && Date.now() - cached.fetchedAt < CAPABILITIES_CACHE_TTL_MS) {
        loadedData.current[sectionKey] = true
        return () => {
          active = false
        }
      }
    }

    setLoading(!cached)
    ;(async () => {
      try {
        if (sectionKey === 'marketplace') {
          const response = await fetch('/marketplace')
          if (!response.ok) return
          const catalog = (await response.json()) as MarketplaceCatalog
          if (!active) return
          setMarketplaceSkills(catalog.skills ?? [])
          setMarketplaceConnectors(catalog.connectors ?? [])
          capabilitiesDataCache.marketplace = { data: catalog, fetchedAt: Date.now() }
        } else if (sectionKey === 'skills') {
          const response = await fetch('/settings/personal-skills')
          if (!response.ok) return
          const skills = (await response.json()) as PersonalSkill[]
          if (!active) return
          setPersonalSkills(skills)
          capabilitiesDataCache.skills = { data: skills, fetchedAt: Date.now() }
        } else {
          const [connectorsResponse, marketplaceResponse] = await Promise.all([
            fetch('/settings/personal-connectors'),
            fetch('/marketplace'),
          ])
          if (!connectorsResponse.ok) return
          const connectors = (await connectorsResponse.json()) as PersonalConnector[]
          if (!active) return
          setPersonalConnectors(connectors)
          capabilitiesDataCache.connectors = { data: connectors, fetchedAt: Date.now() }
          if (marketplaceResponse.ok) {
            const catalog = (await marketplaceResponse.json()) as MarketplaceCatalog
            if (!active) return
            setMarketplaceConnectors(catalog.connectors ?? [])
            capabilitiesDataCache.marketplace = { data: catalog, fetchedAt: Date.now() }
          }
        }

        loadedData.current[sectionKey] = true
      } catch {
        // Keep the current data available and allow a later retry.
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [reloadNonce, tab, view])

  useEffect(() => {
    const refreshMarketplace = () => {
      loadedData.current.marketplace = false
      loadedData.current.connectors = false
      delete capabilitiesDataCache.marketplace
      if (view === 'discover' || tab === 'connectors') {
        setReloadNonce((value) => value + 1)
      }
    }
    window.addEventListener('orbit:marketplace-updated', refreshMarketplace)
    return () => window.removeEventListener('orbit:marketplace-updated', refreshMarketplace)
  }, [view])

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (!target.closest('.sp-skill-menu-wrap')) setSkillMenuId(null)
      if (!target.closest('.sp-connector-menu-wrap')) setConnectorMenuId(null)
      if (!target.closest('.sp-add-btn-wrap')) setAddDropdownOpen(false)
      if (!target.closest('.sp-filter-wrap')) setShowFilterMenu(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  async function togglePersonalSkillEnabled(skill: PersonalSkill) {
    const nextEnabled = !skill.is_enabled
    try {
      const res = await fetch(`/settings/personal-skills/${encodeURIComponent(skill.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: nextEnabled, is_draft: false }),
      })
      if (!res.ok) return
      const updated = (await res.json()) as PersonalSkill
      setPersonalSkills((prev) => prev.map((s) => (s.id === skill.id ? updated : s)))
      showToast(nextEnabled ? `Enabled ${skill.name}` : `Disabled ${skill.name}`)
    } catch {
      // ignore
    }
  }

  async function deletePersonalSkill(skill: PersonalSkill) {
    setSkillMenuId(null)
    try {
      const res = await fetch(`/settings/personal-skills/${encodeURIComponent(skill.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) return
      setPersonalSkills((prev) => prev.filter((s) => s.id !== skill.id))
      showToast(`Deleted ${skill.name}`)
    } catch {
      // ignore
    }
  }

  async function toggleMarketplaceSkill(skill: MarketplaceSkill) {
    const nextState = !skill.is_installed
    try {
      const res = await fetch(`/marketplace/skills/${encodeURIComponent(skill.id)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ install: nextState }),
      })
      if (!res.ok) return
      setMarketplaceSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, is_installed: nextState } : s)),
      )
      showToast(nextState ? `Installed ${skill.name}` : `Removed ${skill.name}`)
    } catch {
      // ignore
    }
  }

  async function quickConnectConnector(conn: PersonalConnector) {
    setConnectingId(conn.id)
    try {
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(conn.id)}/connect`,
        { method: 'POST' },
      )
      const data = (await res.json()) as PersonalConnector & { detail?: string }
      if (!res.ok) {
        showToast(data.detail || `Could not connect to ${conn.name}`)
        setSelectedConnectorId(conn.id)
        return
      }
      setPersonalConnectors((prev) => prev.map((c) => (c.id === conn.id ? data : c)))
      showToast(`Connected to ${conn.name}.`)
    } catch {
      showToast(`Could not connect to ${conn.name}`)
    } finally {
      setConnectingId(null)
    }
  }

  async function quickDisconnectConnector(conn: PersonalConnector) {
    setConnectorMenuId(null)
    try {
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(conn.id)}/disconnect`,
        { method: 'POST' },
      )
      if (!res.ok) return
      const data = (await res.json()) as PersonalConnector
      setPersonalConnectors((prev) => prev.map((c) => (c.id === conn.id ? data : c)))
      showToast(`Disconnected ${conn.name}.`)
    } catch {
      // ignore
    }
  }

  async function deletePersonalConnector(conn: PersonalConnector) {
    setConnectorMenuId(null)
    try {
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(conn.id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) return
      setPersonalConnectors((prev) => prev.filter((c) => c.id !== conn.id))
      if (selectedConnectorId === conn.id) setSelectedConnectorId(null)
      showToast(`Removed ${conn.name}.`)
    } catch {
      // ignore
    }
  }

  const filteredPersonalSkills = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = personalSkills.filter((s) => {
      if (skillFilter === 'active' && (s.is_draft || !s.is_enabled)) return false
      if (skillFilter === 'drafts' && !s.is_draft) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    })
    if (sortOrder === 'name') {
      return list.toSorted((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [personalSkills, search, skillFilter, sortOrder])

  const filteredInstalledSkills = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = marketplaceSkills.filter((s) => {
      if (!s.is_installed) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    })
    if (sortOrder === 'name') {
      return list.toSorted((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [marketplaceSkills, search, sortOrder])

  const filteredPersonalConnectors = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = personalConnectors.filter((c) => {
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.mcp_url.toLowerCase().includes(q)
    })
    if (sortOrder === 'name') {
      return list.toSorted((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [personalConnectors, search, sortOrder])

  const filteredEnabledMarketplaceConnectors = useMemo(() => {
    const q = search.trim().toLowerCase()
    return marketplaceConnectors.filter((c) => {
      if (!c.is_enabled) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    })
  }, [marketplaceConnectors, search])

  const selectedConnector = selectedConnectorId
    ? personalConnectors.find((c) => c.id === selectedConnectorId) ?? null
    : null

  function handleOpenMarketplace(connectorId?: string) {
    if (onNavigateMarketplace) {
      onCloseSettings()
      onNavigateMarketplace(connectorId)
    }
  }

  // Sub-view: Upload a skill
  if (tab === 'skills' && uploadViewOpen) {
    return (
      <div className="sp-capabilities">
        <UploadSkillView
          onBack={() => setUploadViewOpen(false)}
          onUploaded={(created, scans) => {
            setPersonalSkills((prev) => [...created, ...prev])
            setUploadViewOpen(false)
            const firstVerdict = scans[0]
              ? ` · SkillSpector ${scans[0].recommendation} (${scans[0].score}/100)`
              : ''
            showToast(
              created.length === 1
                ? `Uploaded "${created[0].name}"${firstVerdict}.`
                : `Uploaded ${created.length} personal skills (SkillSpector verified).`,
            )
          }}
        />
        {toast && (
          <div className="sp-toast" role="status">
            <Icon name="checkCircle" size={15} />
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
              <Icon name="close" size={13} />
            </button>
          </div>
        )}
      </div>
    )
  }

  // Sub-view: Connector detail & tool permissions
  if (tab === 'connectors' && selectedConnector) {
    return (
      <div className="sp-capabilities">
        <ConnectorDetailView
          connector={selectedConnector}
          onBack={() => setSelectedConnectorId(null)}
          onUpdated={(updated) => {
            setPersonalConnectors((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c)),
            )
          }}
          onDeleted={(deletedId) => {
            setPersonalConnectors((prev) => prev.filter((c) => c.id !== deletedId))
            setSelectedConnectorId(null)
          }}
          onEditRequested={(conn) => {
            setEditingConnector(conn)
            setConnectorModalOpen(true)
          }}
          onNotify={showToast}
        />

        {connectorModalOpen && (
          <AddCustomConnectorModal
            editingConnector={editingConnector}
            onClose={() => {
              setConnectorModalOpen(false)
              setEditingConnector(null)
            }}
            onSaved={(saved, isEdit) => {
              setPersonalConnectors((prev) =>
                isEdit ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev],
              )
              showToast(isEdit ? `Updated ${saved.name}.` : `Added ${saved.name}.`)
            }}
            onOpenBrowseMarketplace={onNavigateMarketplace ? handleOpenMarketplace : undefined}
          />
        )}

        {toast && (
          <div className="sp-toast" role="status">
            <Icon name="checkCircle" size={15} />
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
              <Icon name="close" size={13} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="sp-capabilities">
      {/* Toolbar: Tabs + Yours/Discover + Search + Sort/Filter + + Add */}
      <div className="sp-cap-toolbar">
        <div className="sp-cap-toolbar-left">
          <div className="sp-cap-pills">
            <button
              type="button"
              className={`sp-cap-pill${tab === 'skills' ? ' active' : ''}`}
              onClick={() => {
                setTab('skills')
                setSelectedConnectorId(null)
              }}
            >
              Skills
            </button>
            <button
              type="button"
              className={`sp-cap-pill${tab === 'connectors' ? ' active' : ''}`}
              onClick={() => {
                setTab('connectors')
                setUploadViewOpen(false)
              }}
            >
              Connectors
            </button>
          </div>

          <span className="sp-toolbar-divider" aria-hidden="true" />

          <div className="sp-cap-view-toggle">
            <button
              type="button"
              className={`sp-view-btn${view === 'yours' ? ' active' : ''}`}
              onClick={() => setView('yours')}
            >
              Yours
            </button>
            <button
              type="button"
              className={`sp-view-btn${view === 'discover' ? ' active' : ''}`}
              onClick={() => setView('discover')}
            >
              Discover
            </button>
          </div>
        </div>

        <div className="sp-cap-toolbar-right">
          <div className="sp-search-wrap">
            <Icon name="search" size={13} />
            <input
              className="sp-search-input"
              placeholder="Search"
              aria-label="Search capabilities"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="sp-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>

          {view === 'yours' && tab === 'skills' && (
            <div className="sp-filter-wrap">
              <button
                type="button"
                className={`sp-tool-icon-btn${skillFilter !== 'all' ? ' active' : ''}`}
                title="Filter skills"
                aria-label="Filter skills"
                onClick={() => setShowFilterMenu((v) => !v)}
              >
                <Icon name="filter" size={14} />
              </button>
              {showFilterMenu && (
                <div className="sp-dropdown-menu sp-filter-menu">
                  {(['all', 'active', 'drafts'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`sp-add-dropdown-item${skillFilter === f ? ' selected' : ''}`}
                      onClick={() => {
                        setSkillFilter(f)
                        setShowFilterMenu(false)
                      }}
                    >
                      <span>
                        {f === 'all' ? 'All skills' : f === 'active' ? 'Enabled only' : 'Drafts'}
                      </span>
                      {skillFilter === f && <Icon name="check" size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="sp-tool-icon-btn"
            title={sortOrder === 'newest' ? 'Sorted by newest (click for A–Z)' : 'Sorted A–Z (click for newest)'}
            aria-label="Toggle sort order"
            onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'name' : 'newest'))}
          >
            <Icon name="refresh" size={14} />
          </button>

          <div className="sp-add-btn-wrap">
            <button
              type="button"
              className="sp-add-btn-white"
              onClick={() => setAddDropdownOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={addDropdownOpen}
            >
              <Icon name="plus" size={14} />
              <span>Add</span>
              <Icon name="chevron" size={12} />
            </button>

            {addDropdownOpen && (
              <div className="sp-dropdown-menu sp-add-dropdown" role="menu">
                {tab === 'skills' ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="sp-add-dropdown-item"
                      onClick={() => {
                        setAddDropdownOpen(false)
                        setView('yours')
                        setUploadViewOpen(true)
                      }}
                    >
                      <Icon name="upload" size={14} />
                      <span>Upload skill</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sp-add-dropdown-item"
                      onClick={() => {
                        setAddDropdownOpen(false)
                        setView('yours')
                        setEditingSkill(null)
                        setCreateSkillModalOpen(true)
                      }}
                    >
                      <Icon name="edit" size={14} />
                      <span>Create a skill</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="sp-add-dropdown-item"
                    onClick={() => {
                      setAddDropdownOpen(false)
                      setView('yours')
                      setEditingConnector(null)
                      setConnectorModalOpen(true)
                    }}
                  >
                    <Icon name="plus" size={14} />
                    <span>Add custom connector</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="sp-loading">Loading your capabilities…</div>
      ) : view === 'discover' ? (
        <div className="sp-discover-view">
          {tab === 'skills' ? (
            marketplaceSkills.length > 0 ? (
              <div className="sp-items-list">
                {marketplaceSkills
                  .filter(
                    (s) =>
                      !search ||
                      s.name.toLowerCase().includes(search.toLowerCase()) ||
                      s.description.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((skill) => (
                    <div key={skill.id} className="sp-skill-row">
                      <div className="sp-item-icon">
                        <Icon name="fileText" size={16} />
                      </div>
                      <div className="sp-item-info">
                        <div className="sp-item-title-line">
                          <span className="sp-item-name">{skill.name}</span>
                          <span className="sp-item-tag">{skill.category}</span>
                        </div>
                        <span className="sp-item-desc">{skill.description}</span>
                      </div>
                      <button
                        type="button"
                        className={skill.is_installed ? 'sp-btn-subtle' : 'sp-btn-white'}
                        onClick={() => void toggleMarketplaceSkill(skill)}
                      >
                        {skill.is_installed ? 'Installed' : 'Install'}
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="sp-discover-cta">
                <Icon name="store" size={34} />
                <h3>Discover skills from Marketplace</h3>
                <p>
                  The global Marketplace is clean. Skills you upload or create with{' '}
                  <strong>+ Add</strong> stay private to your own account.
                </p>
                <div className="sp-empty-actions">
                  <button
                    type="button"
                    className="sp-btn-white"
                    onClick={() => {
                      setView('yours')
                      setEditingSkill(null)
                      setCreateSkillModalOpen(true)
                    }}
                  >
                    Create personal skill
                  </button>
                  {onNavigateMarketplace && (
                    <button type="button" className="sp-btn-ghost" onClick={() => handleOpenMarketplace()}>
                      Open Marketplace
                    </button>
                  )}
                </div>
              </div>
            )
          ) : marketplaceConnectors.length > 0 ? (
            <div className="sp-items-list">
              {marketplaceConnectors
                .filter(
                  (c) =>
                    !search ||
                    c.name.toLowerCase().includes(search.toLowerCase()) ||
                    c.description.toLowerCase().includes(search.toLowerCase()),
                )
                .map((conn) => (
                  <div key={conn.id} className="sp-skill-row">
                    <div className="sp-item-icon">
                      <Icon name="cloud" size={16} />
                    </div>
                    <div className="sp-item-info">
                      <div className="sp-item-title-line">
                        <span className="sp-item-name">{conn.name}</span>
                        <span className="sp-item-tag">{conn.category}</span>
                      </div>
                      <span className="sp-item-desc">{conn.description}</span>
                    </div>
                    <button
                      type="button"
                      className={conn.is_enabled && conn.is_authenticated !== false ? 'sp-btn-subtle' : 'sp-btn-white'}
                      onClick={() => handleOpenMarketplace(conn.id)}
                    >
                      {conn.is_enabled && conn.is_configured && conn.is_authenticated !== false ? 'Connected' : 'Connect'}
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <div className="sp-discover-cta">
              <Icon name="store" size={34} />
              <h3>Discover connectors from Marketplace</h3>
              <p>
                The global Marketplace is clean. Custom MCP connectors you add stay private to your
                own account.
              </p>
              <div className="sp-empty-actions">
                <button
                  type="button"
                  className="sp-btn-white"
                  onClick={() => {
                    setView('yours')
                    setEditingConnector(null)
                    setConnectorModalOpen(true)
                  }}
                >
                  Add custom connector
                </button>
                {onNavigateMarketplace && (
                  <button type="button" className="sp-btn-ghost" onClick={() => handleOpenMarketplace()}>
                    Open Marketplace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : tab === 'skills' ? (
        <div className="sp-skills-yours">
          {personalSkills.length === 0 && (
            <div className="sp-promo-banner">
              <div className="sp-promo-copy">
                <h4>Add your first skills</h4>
                <p>
                  Skills teach Orbit how you work. Upload SKILL.md packages or create private
                  skills just for your workspace.
                </p>
                <div className="sp-promo-actions">
                  <button
                    type="button"
                    className="sp-btn-white"
                    onClick={() => {
                      setEditingSkill(null)
                      setCreateSkillModalOpen(true)
                    }}
                  >
                    Create a skill
                  </button>
                  <button
                    type="button"
                    className="sp-btn-ghost"
                    onClick={() => setUploadViewOpen(true)}
                  >
                    Upload skill
                  </button>
                </div>
              </div>
              <div className="sp-promo-art" aria-hidden="true">
                <Icon name="paperPlane" size={52} />
              </div>
            </div>
          )}

          {filteredPersonalSkills.length > 0 && (
            <div className="sp-cap-group">
              <div className="sp-cap-group-header">
                <span>Added by you</span>
                <span className="sp-cap-count-badge">{filteredPersonalSkills.length}</span>
              </div>
              <div className="sp-items-list">
                {filteredPersonalSkills.map((skill) => (
                  <div key={skill.id} className="sp-skill-row">
                    <div className="sp-item-icon sp-item-icon-personal">
                      <Icon name="fileText" size={16} />
                    </div>
                    <div className="sp-item-info">
                      <div className="sp-item-title-line">
                        <span className="sp-item-name">{skill.name}</span>
                        {skill.is_draft && <span className="sp-draft-pill">Draft</span>}
                        {skill.security_scan && (
                          <span
                            className={`sp-scan-pill sp-scan-pill-${
                              skill.security_scan.recommendation === 'CAUTION' ? 'caution' : 'safe'
                            }`}
                            title={`${skill.security_scan.scanner}${
                              skill.security_scan.version ? ` v${skill.security_scan.version}` : ''
                            }: ${skill.security_scan.recommendation} (${skill.security_scan.score}/100)`}
                          >
                            <Icon name="shield" size={11} />
                            <span>
                              {skill.security_scan.recommendation} · {skill.security_scan.score}/100
                            </span>
                          </span>
                        )}
                        {skill.files.length > 0 && (
                          <span className="sp-item-tag">
                            {skill.files.length} file{skill.files.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <span className="sp-item-desc">
                        {skill.source === 'upload' ? 'Uploaded skill' : 'Personal skill'}
                        {skill.description ? ` · ${skill.description}` : ''}
                      </span>
                    </div>
                    <span className="sp-item-date">{formatShortDate(skill.created_at)}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={skill.is_enabled}
                      aria-label={`Toggle ${skill.name}`}
                      className={`sp-switch${skill.is_enabled ? ' on' : ''}`}
                      onClick={() => void togglePersonalSkillEnabled(skill)}
                      title={skill.is_enabled ? 'Active in your chats' : 'Paused'}
                    >
                      <span className="sp-switch-thumb" />
                    </button>
                    <div className="sp-skill-menu-wrap">
                      <button
                        type="button"
                        className="icon-btn sp-item-more"
                        onClick={() =>
                          setSkillMenuId((prev) => (prev === skill.id ? null : skill.id))
                        }
                        title="Skill options"
                        aria-label={`Options for ${skill.name}`}
                      >
                        <Icon name="more" size={16} />
                      </button>
                      {skillMenuId === skill.id && (
                        <div className="sp-dropdown-menu sp-skill-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            className="sp-skill-menu-item"
                            onClick={() => {
                              setSkillMenuId(null)
                              setEditingSkill(skill)
                              setCreateSkillModalOpen(true)
                            }}
                          >
                            <Icon name="edit" size={13} />
                            <span>Edit skill</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="sp-skill-menu-item sp-skill-menu-delete"
                            onClick={() => void deletePersonalSkill(skill)}
                          >
                            <Icon name="trash" size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredInstalledSkills.length > 0 && (
            <div className="sp-cap-group">
              <div className="sp-cap-group-header">
                <span>From Marketplace</span>
                <span className="sp-cap-count-badge">{filteredInstalledSkills.length}</span>
              </div>
              <div className="sp-items-list">
                {filteredInstalledSkills.map((skill) => (
                  <div key={skill.id} className="sp-skill-row">
                    <div className="sp-item-icon">
                      <Icon name="fileText" size={16} />
                    </div>
                    <div className="sp-item-info">
                      <div className="sp-item-title-line">
                        <span className="sp-item-name">{skill.name}</span>
                        <span className="sp-item-tag">{skill.category}</span>
                      </div>
                      <span className="sp-item-desc">
                        from {skill.author || 'Orbit'} · {skill.description}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="sp-btn-subtle"
                      onClick={() => void toggleMarketplaceSkill(skill)}
                    >
                      Uninstall
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {personalSkills.length > 0 &&
            filteredPersonalSkills.length === 0 &&
            filteredInstalledSkills.length === 0 && (
              <div className="sp-empty-state">
                <Icon name="search" size={28} />
                <h3>No matching skills</h3>
                <p>Try clearing filters or adjusting your search query.</p>
              </div>
            )}
        </div>
      ) : (
        /* Connectors > Yours */
        <div className="sp-connectors-yours">
          {filteredPersonalConnectors.length === 0 &&
          filteredEnabledMarketplaceConnectors.length === 0 ? (
            <div className="sp-empty-state">
              <Icon name="link" size={32} />
              <h3>
                {search ? 'No matching connectors' : 'No custom connectors yet'}
              </h3>
              <p>
                {search
                  ? 'Try adjusting your search query.'
                  : 'Connect your private MCP servers or tools using the Add custom connector button.'}
              </p>
              {!search && (
                <div className="sp-empty-actions">
                  <button
                    type="button"
                    className="sp-btn-white"
                    onClick={() => {
                      setEditingConnector(null)
                      setConnectorModalOpen(true)
                    }}
                  >
                    Add custom connector
                  </button>
                  <button
                    type="button"
                    className="sp-btn-ghost"
                    onClick={() => setView('discover')}
                  >
                    Discover connectors
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="sp-conn-table">
              <div className="sp-conn-table-head">
                <span>Connector</span>
                <span>Type</span>
                <span className="sp-conn-col-right" />
              </div>

              {filteredPersonalConnectors.map((conn) => (
                <div
                  key={conn.id}
                  className="sp-conn-table-row"
                  onClick={() => setSelectedConnectorId(conn.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelectedConnectorId(conn.id)
                  }}
                >
                  <div className="sp-conn-cell-name">
                    <div className="sp-conn-row-icon">
                      <Icon name="link" size={15} />
                    </div>
                    <div className="sp-conn-name-copy">
                      <span className="sp-item-name">{conn.name}</span>
                      <span className="sp-conn-url-sub">{conn.mcp_url}</span>
                    </div>
                  </div>

                  <span className="sp-conn-cell-type">{conn.connector_type}</span>

                  <div
                    className="sp-conn-cell-action"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {conn.is_connected ? (
                      <span className="sp-conn-connected-mark" title="Connected">
                        <Icon name="check" size={16} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="sp-btn-subtle"
                        disabled={connectingId === conn.id}
                        onClick={() => void quickConnectConnector(conn)}
                      >
                        {connectingId === conn.id ? 'Connecting…' : 'Connect'}
                      </button>
                    )}

                    <div className="sp-connector-menu-wrap">
                      <button
                        type="button"
                        className="icon-btn sp-item-more"
                        onClick={() =>
                          setConnectorMenuId((prev) => (prev === conn.id ? null : conn.id))
                        }
                        title="Options"
                        aria-label={`Options for ${conn.name}`}
                      >
                        <Icon name="more" size={16} />
                      </button>
                      {connectorMenuId === conn.id && (
                        <div className="sp-dropdown-menu sp-connector-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            className="sp-skill-menu-item"
                            onClick={() => {
                              setConnectorMenuId(null)
                              setSelectedConnectorId(conn.id)
                            }}
                          >
                            <Icon name="settings" size={13} />
                            <span>Configure tools</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="sp-skill-menu-item"
                            onClick={() => {
                              setConnectorMenuId(null)
                              setEditingConnector(conn)
                              setConnectorModalOpen(true)
                            }}
                          >
                            <Icon name="edit" size={13} />
                            <span>Edit connection</span>
                          </button>
                          {conn.is_connected && (
                            <button
                              type="button"
                              role="menuitem"
                              className="sp-skill-menu-item"
                              onClick={() => void quickDisconnectConnector(conn)}
                            >
                              <Icon name="close" size={13} />
                              <span>Disconnect</span>
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            className="sp-skill-menu-item sp-skill-menu-delete"
                            onClick={() => void deletePersonalConnector(conn)}
                          >
                            <Icon name="trash" size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {filteredEnabledMarketplaceConnectors.map((conn) => (
                <div
                  key={`mkt-${conn.id}`}
                  className="sp-conn-table-row"
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${conn.name} connector details`}
                  onClick={() => handleOpenMarketplace(conn.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleOpenMarketplace(conn.id)
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="sp-conn-cell-name">
                    <div className="sp-conn-row-icon">
                      <Icon name="cloud" size={15} />
                    </div>
                    <div className="sp-conn-name-copy">
                      <span className="sp-item-name">{conn.name}</span>
                      <span className="sp-conn-url-sub">Marketplace · {conn.category}</span>
                    </div>
                  </div>
                  <span className="sp-conn-cell-type">Marketplace</span>
                  <div className="sp-conn-cell-action">
                    <button
                      type="button"
                      className="sp-btn-subtle"
                      onClick={() => handleOpenMarketplace(conn.id)}
                    >
                      Connected
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {createSkillModalOpen && (
        <SkillEditorModal
          initialSkill={editingSkill}
          onClose={() => {
            setCreateSkillModalOpen(false)
            setEditingSkill(null)
          }}
          onSaved={(saved, isEdit) => {
            setPersonalSkills((prev) =>
              isEdit ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev],
            )
            const verdict = saved.security_scan
              ? ` · SkillSpector ${saved.security_scan.recommendation} (${saved.security_scan.score}/100)`
              : ''
            showToast(
              `${isEdit ? 'Updated' : 'Created'} "${saved.name}"${verdict}.`,
            )
          }}
        />
      )}

      {connectorModalOpen && (
        <AddCustomConnectorModal
          editingConnector={editingConnector}
          onClose={() => {
            setConnectorModalOpen(false)
            setEditingConnector(null)
          }}
          onSaved={(saved, isEdit) => {
            setPersonalConnectors((prev) =>
              isEdit ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev],
            )
            if (!isEdit) {
              setSelectedConnectorId(saved.id)
              setReloadNonce((n) => n + 1)
            }
            showToast(
              saved.connect_error
                ? `Saved ${saved.name} (${saved.connect_error})`
                : isEdit
                ? `Updated ${saved.name}.`
                : saved.is_connected
                ? `Connected to ${saved.name}.`
                : `Added ${saved.name}.`,
            )
          }}
          onOpenBrowseMarketplace={onNavigateMarketplace ? handleOpenMarketplace : undefined}
        />
      )}

      {toast && (
        <div className="sp-toast" role="status">
          <Icon name="checkCircle" size={15} />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
