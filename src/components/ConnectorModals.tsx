import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { ModernDialog } from './ModernDialog'
import type {
  McpProbeResult,
  McpToolDefinition,
  PersonalConnector,
  ToolPermissionLevel,
} from './types'

type HeaderInputRow = { key: string; value: string; maskedHint?: string }

type AddCustomConnectorModalProps = {
  editingConnector?: PersonalConnector | null
  onClose: () => void
  onSaved: (connector: PersonalConnector, isEdit: boolean) => void
  onOpenBrowseMarketplace?: () => void
}

export function AddCustomConnectorModal({
  editingConnector,
  onClose,
  onSaved,
  onOpenBrowseMarketplace,
}: AddCustomConnectorModalProps) {
  const isEdit = Boolean(editingConnector)
  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1)
  const [name, setName] = useState(editingConnector?.name ?? '')
  const [mcpUrl, setMcpUrl] = useState(editingConnector?.mcp_url ?? '')
  const [checking, setChecking] = useState(false)
  const [probe, setProbe] = useState<McpProbeResult | null>(null)
  const [authMode, setAuthMode] = useState<'now' | 'later' | 'none'>(
    editingConnector?.auth_mode ?? 'none',
  )
  const [headers, setHeaders] = useState<HeaderInputRow[]>(() =>
    editingConnector?.headers?.length
      ? editingConnector.headers.map((h) => ({
          key: h.key,
          value: '',
          maskedHint: h.masked_value || '••••••',
        }))
      : [],
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [oauthClientId, setOauthClientId] = useState(
    String(editingConnector?.advanced?.oauth_client_id ?? ''),
  )
  const [notes, setNotes] = useState(String(editingConnector?.advanced?.notes ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function runServerCheck() {
    if (!name.trim() || !mcpUrl.trim()) {
      setError('Connector name and MCP server URL are required.')
      return
    }
    setError('')
    setChecking(true)
    setProbe(null)
    try {
      const res = await fetch('/settings/personal-connectors/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcp_url: mcpUrl.trim(),
          headers: headers.filter((h) => h.key.trim() && h.value),
        }),
      })
      const data = (await res.json()) as McpProbeResult & { detail?: string }
      if (!res.ok) {
        throw new Error(data.detail || 'Could not validate MCP server URL.')
      }
      setProbe(data)
      if (data.detected_auth) {
        setAuthMode(data.detected_auth)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check server.')
    } finally {
      setChecking(false)
    }
  }

  function addHeaderRow() {
    if (headers.length >= 4) return
    setHeaders((prev) => [...prev, { key: '', value: '' }])
  }

  function updateHeaderRow(idx: number, field: 'key' | 'value', nextVal: string) {
    setHeaders((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: nextVal } : row)),
    )
  }

  function removeHeaderRow(idx: number) {
    setHeaders((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSaveConnector() {
    if (!name.trim() || !mcpUrl.trim()) {
      setError('Connector name and MCP server URL are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const cleanHeaders = headers
        .filter((h) => h.key.trim())
        .slice(0, 4)
        .map((h) => ({ key: h.key.trim(), value: h.value }))

      const advancedPayload = {
        oauth_client_id: oauthClientId.trim() || undefined,
        notes: notes.trim() || undefined,
        oauth_metadata: probe?.oauth_metadata || undefined,
      }

      if (editingConnector) {
        const res = await fetch(
          `/settings/personal-connectors/${encodeURIComponent(editingConnector.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              mcp_url: mcpUrl.trim(),
              auth_mode: authMode,
              headers: cleanHeaders,
              advanced: advancedPayload,
            }),
          },
        )
        const data = (await res.json()) as PersonalConnector & { detail?: string }
        if (!res.ok) throw new Error(data.detail || 'Could not update connector.')

        const connectionChanged =
          mcpUrl.trim() !== editingConnector.mcp_url ||
          cleanHeaders.some((h) => h.value.length > 0) ||
          editingConnector.is_connected

        if (connectionChanged && (authMode !== 'now' || cleanHeaders.length > 0)) {
          const connRes = await fetch(
            `/settings/personal-connectors/${encodeURIComponent(editingConnector.id)}/connect`,
            { method: 'POST' },
          )
          if (connRes.ok) {
            const refreshed = (await connRes.json()) as PersonalConnector
            onSaved(refreshed, true)
            onClose()
            return
          }
          const errPayload = (await connRes.json().catch(() => ({}))) as { detail?: string }
          onSaved(
            {
              ...data,
              is_connected: false,
              connect_error: errPayload.detail || 'Reconnect failed with updated settings.',
            },
            true,
          )
          onClose()
          return
        }

        onSaved(data, true)
        onClose()
        return
      }

      const hasCredentialHeader = cleanHeaders.some((h) => h.value.length > 0)
      const shouldConnectNow = authMode !== 'now' || hasCredentialHeader

      const res = await fetch('/settings/personal-connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          mcp_url: mcpUrl.trim(),
          connector_type: 'Web',
          auth_mode: authMode,
          headers: cleanHeaders,
          advanced: advancedPayload,
          tools: probe?.tools ?? [],
          connect_now: shouldConnectNow,
          last_status_code: probe?.status_code ?? null,
        }),
      })
      const data = (await res.json()) as PersonalConnector & { detail?: string }
      if (!res.ok) throw new Error(data.detail || 'Could not add custom connector.')
      onSaved(data, false)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save connector.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModernDialog
      isOpen={true}
      onClose={onClose}
      ariaLabelledBy="custom-connector-title"
      className="sp-modal sp-modal-lg"
    >
        <div className="sp-modal-header">
          <h3 id="custom-connector-title">
            {isEdit ? 'Edit custom connector' : 'Add custom connector'}
          </h3>
          <button
            type="button"
            className="sp-modal-close icon-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="sp-modal-body">
          <p className="sp-conn-lead">
            Connect Orbit to your data and tools using a personal MCP server.
            {onOpenBrowseMarketplace && (
              <>
                {' '}
                Or explore{' '}
                <button
                  type="button"
                  className="sp-inline-link"
                  onClick={() => {
                    onClose()
                    onOpenBrowseMarketplace()
                  }}
                >
                  pre-built ones
                </button>
                .
              </>
            )}
          </p>

          {step === 1 ? (
            <>
              <div className="sp-field">
                <label className="sp-sr-only" htmlFor="conn-name-input">
                  Name
                </label>
                <input
                  id="conn-name-input"
                  className="sp-input"
                  placeholder="Name"
                  maxLength={120}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setError('')
                  }}
                />
                <span className="sp-field-help">Shown in your personal connectors list.</span>
              </div>

              <div className="sp-field">
                <label className="sp-sr-only" htmlFor="conn-url-input">
                  MCP server URL
                </label>
                <input
                  id="conn-url-input"
                  className="sp-input"
                  placeholder="MCP server URL"
                  value={mcpUrl}
                  onChange={(e) => {
                    setMcpUrl(e.target.value)
                    setProbe(null)
                    setError('')
                  }}
                />
                <span className="sp-field-help">
                  The HTTPS address where the server accepts MCP requests, for example{' '}
                  <code>https://mcp.example.com/mcp</code>.
                </span>
              </div>

              {(checking || probe) && (
                <div className="sp-probe-block">
                  <div className="sp-probe-heading">Checking the server...</div>

                  <div className="sp-probe-step">
                    <span className="sp-probe-step-icon">
                      {checking ? (
                        <span className="sp-check-spinner" />
                      ) : probe?.connect_status === 'done' ? (
                        <span className="sp-probe-icon-ok">
                          <Icon name="checkCircle" size={16} />
                        </span>
                      ) : (
                        <span className="sp-probe-icon-err">
                          <Icon name="close" size={14} />
                        </span>
                      )}
                    </span>
                    <div className="sp-probe-step-copy">
                      <span className="sp-probe-step-label">Connecting to the server</span>
                      <span className="sp-probe-step-sub">
                        {checking ? 'Sending MCP initialize check…' : probe?.connect_detail}
                      </span>
                    </div>
                    {!checking && probe?.status_code !== null && probe?.status_code !== undefined && (
                      <span
                        className={`sp-http-badge ${
                          probe.reachable ? 'sp-http-ok' : 'sp-http-warn'
                        }`}
                      >
                        {probe.status_code}
                      </span>
                    )}
                  </div>

                  <div className="sp-probe-step">
                    <span className="sp-probe-step-icon">
                      {checking ? (
                        <span className="sp-check-spinner" />
                      ) : probe?.signin_settings_status === 'Detected' ? (
                        <span className="sp-probe-icon-ok">
                          <Icon name="checkCircle" size={16} />
                        </span>
                      ) : (
                        <span className="sp-probe-dash">—</span>
                      )}
                    </span>
                    <div className="sp-probe-step-copy">
                      <span className="sp-probe-step-label">Looking up sign-in settings</span>
                      <span className="sp-probe-step-sub">
                        {checking ? 'Pending' : probe?.signin_settings_status}
                      </span>
                    </div>
                  </div>

                  <div className="sp-probe-step">
                    <span className="sp-probe-step-icon">
                      {checking ? (
                        <span className="sp-check-spinner" />
                      ) : probe?.signin_provider_status &&
                        probe.signin_provider_status !== 'Skipped' &&
                        probe.signin_provider_status !== 'Pending' ? (
                        <span className="sp-probe-icon-ok">
                          <Icon name="checkCircle" size={16} />
                        </span>
                      ) : (
                        <span className="sp-probe-dash">—</span>
                      )}
                    </span>
                    <div className="sp-probe-step-copy">
                      <span className="sp-probe-step-label">Checking the sign-in provider</span>
                      <span className="sp-probe-step-sub">
                        {checking ? 'Pending' : probe?.signin_provider_status}
                      </span>
                    </div>
                  </div>

                  {!checking && probe && probe.reachable && (
                    <div className="sp-probe-banner sp-probe-banner-info">
                      <Icon name="checkCircle" size={16} />
                      <div>
                        <strong>Server found</strong>
                        {probe.tools.length > 0 && (
                          <p>
                            Discovered {probe.tools.length} MCP tool
                            {probe.tools.length === 1 ? '' : 's'} ready to connect.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {!checking && probe && !probe.reachable && (
                    <div className="sp-probe-banner sp-probe-banner-warn">
                      <Icon name="alertTriangle" size={16} />
                      <div>
                        <strong>Couldn&apos;t check the server</strong>
                        <p>
                          Couldn&apos;t determine how this server signs in.{' '}
                          {probe.error ? `${probe.error} ` : ''}You can continue and configure it
                          manually.
                        </p>
                        <p>Select Continue anyway to configure the connector manually.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!checking && !probe && (
                <p className="sp-trust-note">
                  Only use connectors from developers you trust. This connector is added only for
                  your personal account and does not verify or modify third-party endpoints.
                </p>
              )}

              {error && <p className="sp-error">{error}</p>}
            </>
          ) : (
            <>
              <div className="sp-conn-summary-card">
                <strong>{name}</strong>
                <code>{mcpUrl}</code>
              </div>

              <div className="sp-field">
                <div className="sp-auth-label-row">
                  <span className="sp-label">Authentication</span>
                </div>

                <div className="sp-auth-options">
                  <label className="sp-auth-radio-card">
                    <input
                      type="radio"
                      name="mcp-auth-mode"
                      checked={authMode === 'now'}
                      onChange={() => setAuthMode('now')}
                    />
                    <div>
                      <div className="sp-auth-title-row">
                        <strong>Sign in now</strong>
                        {probe?.detected_auth === 'now' && (
                          <span className="sp-detected-pill">Detected</span>
                        )}
                      </div>
                      <p>
                        Require signing in or supplying bearer credentials before tools can be
                        used.
                      </p>
                    </div>
                  </label>

                  <label className="sp-auth-radio-card">
                    <input
                      type="radio"
                      name="mcp-auth-mode"
                      checked={authMode === 'later'}
                      onChange={() => setAuthMode('later')}
                    />
                    <div>
                      <div className="sp-auth-title-row">
                        <strong>Sign in when needed</strong>
                        {probe?.detected_auth === 'later' && (
                          <span className="sp-detected-pill">Detected</span>
                        )}
                      </div>
                      <p>
                        Connect without credentials first and prompt only when the server asks.
                        Pick this for servers that offer public tools alongside signed-in tools.
                      </p>
                    </div>
                  </label>

                  <label className="sp-auth-radio-card">
                    <input
                      type="radio"
                      name="mcp-auth-mode"
                      checked={authMode === 'none'}
                      onChange={() => setAuthMode('none')}
                    />
                    <div>
                      <div className="sp-auth-title-row">
                        <strong>No sign-in</strong>
                        {probe?.detected_auth === 'none' && (
                          <span className="sp-detected-pill">Detected</span>
                        )}
                      </div>
                      <p>
                        Pick this for servers with open access, or for servers that use an API key
                        instead of OAuth.
                      </p>
                    </div>
                  </label>
                </div>

                {authMode === 'none' && (
                  <div className="sp-probe-banner sp-probe-banner-warn">
                    <Icon name="alertTriangle" size={16} />
                    <div>
                      Without sign-in, anyone with the server URL can use this connector. If the
                      server uses an API key instead of OAuth, add it under Request headers below.
                    </div>
                  </div>
                )}
              </div>

              <div className="sp-field">
                <span className="sp-label">Request headers</span>
                <span className="sp-field-help">
                  Sent with every request as this connector&apos;s credentials, such as an API key.
                  Values are stored securely and never shown again. You can add up to four.
                </span>

                {headers.map((h, i) => (
                  <div key={i} className="sp-header-row">
                    <input
                      className="sp-input sp-header-input"
                      placeholder="Header name (e.g. Authorization)"
                      value={h.key}
                      onChange={(e) => updateHeaderRow(i, 'key', e.target.value)}
                    />
                    <input
                      className="sp-input sp-header-input"
                      type="password"
                      placeholder={h.maskedHint ? `Saved (${h.maskedHint}) — blank to keep` : 'Header value'}
                      value={h.value}
                      onChange={(e) => updateHeaderRow(i, 'value', e.target.value)}
                    />
                    <button
                      type="button"
                      className="sp-remove-header icon-btn"
                      onClick={() => removeHeaderRow(i)}
                      aria-label="Remove header"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}

                <div>
                  <button
                    type="button"
                    className="sp-btn-subtle"
                    disabled={headers.length >= 4}
                    onClick={addHeaderRow}
                  >
                    + Add header
                  </button>
                </div>
              </div>

              <div className="sp-advanced-box">
                <button
                  type="button"
                  className="sp-advanced-toggle"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                >
                  <Icon name={advancedOpen ? 'chevron' : 'chevronRight'} size={14} />
                  <span>Advanced</span>
                </button>
                {advancedOpen && (
                  <div className="sp-advanced-fields">
                    <div className="sp-field">
                      <label className="sp-label" htmlFor="conn-client-id">
                        OAuth Client ID (optional)
                      </label>
                      <input
                        id="conn-client-id"
                        className="sp-input"
                        placeholder="Optional custom OAuth client ID"
                        value={oauthClientId}
                        onChange={(e) => setOauthClientId(e.target.value)}
                      />
                    </div>
                    <div className="sp-field">
                      <label className="sp-label" htmlFor="conn-notes">
                        Notes (optional)
                      </label>
                      <input
                        id="conn-notes"
                        className="sp-input"
                        placeholder="Private notes about this connector"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <p className="sp-trust-note">
                Only use connectors from developers you trust. Orbit does not control third-party
                MCP servers and cannot guarantee how they handle requests.
              </p>

              {error && <p className="sp-error">{error}</p>}
            </>
          )}
        </div>

        <div className="sp-modal-footer">
          {step === 1 ? (
            <>
              <button type="button" className="sp-btn-ghost" onClick={onClose} disabled={checking}>
                Cancel
              </button>
              {probe ? (
                <button
                  type="button"
                  className="sp-btn-white"
                  onClick={() => setStep(2)}
                >
                  {probe.reachable ? 'Continue' : 'Continue anyway'}
                </button>
              ) : (
                <button
                  type="button"
                  className="sp-btn-white"
                  disabled={checking || !name.trim() || !mcpUrl.trim()}
                  onClick={() => void runServerCheck()}
                >
                  {checking ? 'Checking…' : 'Continue'}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="sp-btn-ghost"
                onClick={() => (isEdit ? onClose() : setStep(1))}
                disabled={saving}
              >
                {isEdit ? 'Cancel' : 'Back'}
              </button>
              <button
                type="button"
                className="sp-btn-white"
                disabled={saving}
                onClick={() => void handleSaveConnector()}
              >
                {saving ? 'Saving…' : isEdit ? 'Save' : 'Add'}
              </button>
            </>
          )}
        </div>
    </ModernDialog>
  )
}

type ToolGroupProps = {
  title: string
  tools: McpToolDefinition[]
  permissions: Record<string, ToolPermissionLevel>
  onSetToolPermission: (toolName: string, level: ToolPermissionLevel) => void
  onSetBulkPermission: (toolNames: string[], level: ToolPermissionLevel) => void
}

function humanizeToolName(raw: string): string {
  return raw
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

function getSchemaInputCount(schema: Record<string, unknown>): number {
  const props = schema.properties
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    return Object.keys(props).length
  }
  return 0
}

function ToolPermissionGroup({
  title,
  tools,
  permissions,
  onSetToolPermission,
  onSetBulkPermission,
}: ToolGroupProps) {
  const [expanded, setExpanded] = useState(true)
  const [expandedDescs, setExpandedDescs] = useState<Record<string, boolean>>({})
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({})

  if (tools.length === 0) return null

  const currentLevels = tools.map(
    (t) => permissions[t.name] ?? (t.readOnlyHint ? 'allow' : 'approval'),
  )
  const uniformLevel: ToolPermissionLevel | 'mixed' = currentLevels.every(
    (lvl) => lvl === currentLevels[0],
  )
    ? currentLevels[0]
    : 'mixed'

  return (
    <div className="sp-tool-group">
      <div className="sp-tool-group-header">
        <button
          type="button"
          className="sp-tool-group-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon name={expanded ? 'chevron' : 'chevronRight'} size={15} />
          <span>{title}</span>
          <span className="sp-tool-count-pill">{tools.length}</span>
        </button>

        <select
          aria-label={`Bulk permission for ${title}`}
          className="sp-bulk-perm-select"
          value={uniformLevel}
          onChange={(e) => {
            const val = e.target.value
            if (val === 'allow' || val === 'approval' || val === 'block') {
              onSetBulkPermission(
                tools.map((t) => t.name),
                val,
              )
            }
          }}
        >
          {uniformLevel === 'mixed' && <option value="mixed">Mixed</option>}
          <option value="allow">Allow always</option>
          <option value="approval">Needs approval</option>
          <option value="block">Blocked</option>
        </select>
      </div>

      {expanded && (
        <div className="sp-tool-list">
          {tools.map((tool) => {
            const perm = permissions[tool.name] ?? (tool.readOnlyHint ? 'allow' : 'approval')
            const descLong = tool.description.length > 150
            const showFullDesc = Boolean(expandedDescs[tool.name])
            const showSchema = Boolean(expandedSchemas[tool.name])
            const inputCount = getSchemaInputCount(tool.inputSchema)

            return (
              <div key={tool.name} className="sp-tool-row">
                <div className="sp-tool-row-main">
                  <div className="sp-tool-title-line">
                    <strong>{humanizeToolName(tool.name)}</strong>
                    <code className="sp-tool-raw-name">{tool.name}</code>
                  </div>

                  {tool.description && (
                    <div className="sp-tool-desc-wrap">
                      <p className={showFullDesc ? 'sp-tool-desc full' : 'sp-tool-desc'}>
                        {tool.description}
                      </p>
                      {descLong && (
                        <button
                          type="button"
                          className="sp-show-more-btn"
                          onClick={() =>
                            setExpandedDescs((prev) => ({
                              ...prev,
                              [tool.name]: !prev[tool.name],
                            }))
                          }
                        >
                          {showFullDesc ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="sp-tool-meta-actions">
                    <span className="sp-tool-inputs-count">
                      Takes {inputCount} input{inputCount === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      className="sp-schema-toggle-btn"
                      onClick={() =>
                        setExpandedSchemas((prev) => ({
                          ...prev,
                          [tool.name]: !prev[tool.name],
                        }))
                      }
                    >
                      <Icon name={showSchema ? 'chevron' : 'chevronRight'} size={12} />
                      <span>The whole schema</span>
                    </button>
                  </div>

                  {showSchema && (
                    <pre className="sp-tool-schema-pre">
                      {JSON.stringify(tool.inputSchema, null, 2)}
                    </pre>
                  )}
                </div>

                <div
                  className="sp-perm-segmented"
                  role="group"
                  aria-label={`Permission for ${tool.name}`}
                >
                  <button
                    type="button"
                    className={`sp-perm-btn${perm === 'allow' ? ' active allow' : ''}`}
                    title="Allow always"
                    aria-label="Allow always"
                    onClick={() => onSetToolPermission(tool.name, 'allow')}
                  >
                    <Icon name="check" size={14} />
                  </button>
                  <button
                    type="button"
                    className={`sp-perm-btn${perm === 'approval' ? ' active approval' : ''}`}
                    title="Needs approval"
                    aria-label="Needs approval"
                    onClick={() => onSetToolPermission(tool.name, 'approval')}
                  >
                    <Icon name="hand" size={14} />
                  </button>
                  <button
                    type="button"
                    className={`sp-perm-btn${perm === 'block' ? ' active block' : ''}`}
                    title="Block tool"
                    aria-label="Block tool"
                    onClick={() => onSetToolPermission(tool.name, 'block')}
                  >
                    <Icon name="ban" size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type ConnectorDetailViewProps = {
  connector: PersonalConnector
  onBack: () => void
  onUpdated: (connector: PersonalConnector) => void
  onDeleted: (connectorId: string) => void
  onEditRequested: (connector: PersonalConnector) => void
  onNotify: (msg: string) => void
}

export function ConnectorDetailView({
  connector,
  onBack,
  onUpdated,
  onDeleted,
  onEditRequested,
  onNotify,
}: ConnectorDetailViewProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [connectingOauth, setConnectingOauth] = useState(false)
  const [startedConnection, setStartedConnection] = useState(false)
  const [tokenInputOpen, setTokenInputOpen] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [tokenSubmitting, setTokenSubmitting] = useState(false)

  const isNotion =
    connector.name.toLowerCase().includes('notion') ||
    connector.mcp_url.toLowerCase().includes('notion.com')

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'mcp_oauth_success') {
        setConnectingOauth(false)
        setStartedConnection(false)
        void fetch('/settings/personal-connectors')
          .then((r) => r.json())
          .then((list) => {
            if (Array.isArray(list)) {
              const updated = list.find((c: PersonalConnector) => c.id === connector.id)
              if (updated) {
                onUpdated(updated)
                onNotify(`Connected to ${connector.name}.`)
              }
            }
          })
          .catch(() => {})
      } else if (e.data?.type === 'mcp_oauth_cancelled') {
        setConnectingOauth(false)
        if (e.data.error) {
          setError(String(e.data.error))
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [connector.id, connector.name, onNotify, onUpdated])

  async function handleConnect() {
    setBusy(true)
    setError('')
    try {
      // 1. Try initiating OAuth first if server supports it
      const startRes = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(connector.id)}/oauth/start`,
        { method: 'POST' },
      )
      const startData = (await startRes.json().catch(() => ({}))) as {
        needs_oauth?: boolean
        auth_url?: string
        error?: string
      }

      if (startRes.ok && startData.needs_oauth && startData.auth_url) {
        setStartedConnection(true)
        setConnectingOauth(true)
        const popup = window.open(
          startData.auth_url,
          'orbit_mcp_oauth',
          'width=600,height=740,status=yes,scrollbars=yes',
        )

        const timer = window.setInterval(() => {
          if (popup && popup.closed) {
            window.clearInterval(timer)
            void fetch('/settings/personal-connectors')
              .then((r) => r.json())
              .then((list) => {
                if (Array.isArray(list)) {
                  const found = list.find((c: PersonalConnector) => c.id === connector.id)
                  if (found && found.is_connected) {
                    setConnectingOauth(false)
                    setStartedConnection(false)
                    onUpdated(found)
                    onNotify(`Connected to ${connector.name}.`)
                    return
                  }
                }
                setConnectingOauth(false)
              })
              .catch(() => setConnectingOauth(false))
          }
        }, 1000)
        return
      }

      if (startData.error) {
        throw new Error(startData.error)
      }

      // 2. Direct connect fallback
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(connector.id)}/connect`,
        { method: 'POST' },
      )
      const data = (await res.json()) as PersonalConnector & { detail?: string }
      if (!res.ok) throw new Error(data.detail || 'Could not connect to MCP server.')
      setStartedConnection(false)
      onUpdated(data)
      onNotify(`Connected to ${connector.name}.`)
    } catch (err) {
      setStartedConnection(true)
      setError(err instanceof Error ? err.message : 'Connection failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleConnectWithToken() {
    if (!manualToken.trim()) return
    setTokenSubmitting(true)
    setError('')
    try {
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(connector.id)}/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: manualToken.trim() }),
        },
      )
      const data = (await res.json()) as PersonalConnector & { detail?: string }
      if (!res.ok) throw new Error(data.detail || 'Could not authenticate with this token.')
      setStartedConnection(false)
      onUpdated(data)
      onNotify(`Connected to ${connector.name}.`)
      setTokenInputOpen(false)
      setManualToken('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect with token.')
    } finally {
      setTokenSubmitting(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(connector.id)}/disconnect`,
        { method: 'POST' },
      )
      const data = (await res.json()) as PersonalConnector & { detail?: string }
      if (!res.ok) throw new Error(data.detail || 'Could not disconnect.')
      onUpdated(data)
      onNotify(`Disconnected ${connector.name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(connector.id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('Could not remove connector.')
      onNotify(`Removed ${connector.name}.`)
      onDeleted(connector.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
      setBusy(false)
    }
  }

  async function saveToolPermissions(patch: Record<string, ToolPermissionLevel>) {
    try {
      const res = await fetch(
        `/settings/personal-connectors/${encodeURIComponent(connector.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool_permissions: patch }),
        },
      )
      const data = (await res.json()) as PersonalConnector & { detail?: string }
      if (!res.ok) throw new Error(data.detail || 'Failed to update permissions.')
      onUpdated(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tool permissions.')
    }
  }

  const readOnlyTools = connector.tools.filter((t) => t.readOnlyHint)
  const writeTools = connector.tools.filter((t) => !t.readOnlyHint)

  return (
    <div className="sp-conn-detail">
      <div className="sp-conn-detail-topbar">
        <button type="button" className="sp-subback-btn" onClick={onBack}>
          <Icon name="chevronLeft" size={15} />
          <span>Your connectors</span>
        </button>

        <div className="sp-conn-detail-actions">
          {connector.is_connected && (
            <button
              type="button"
              className="sp-btn-subtle"
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
          <div className="sp-connector-menu-wrap">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setMenuOpen((v) => !v)}
              title="Connector options"
              aria-label="Connector options"
            >
              <Icon name="more" size={16} />
            </button>
            {menuOpen && (
              <div className="sp-connector-menu">
                <button
                  type="button"
                  className="sp-skill-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    onEditRequested(connector)
                  }}
                >
                  <Icon name="edit" size={13} />
                  <span>Edit configuration</span>
                </button>
                <button
                  type="button"
                  className="sp-skill-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    void handleConnect()
                  }}
                >
                  <Icon name="refresh" size={13} />
                  <span>Refresh tools</span>
                </button>
                <button
                  type="button"
                  className="sp-skill-menu-item sp-skill-menu-delete"
                  onClick={() => {
                    setMenuOpen(false)
                    void handleDelete()
                  }}
                >
                  <Icon name="trash" size={13} />
                  <span>Delete connector</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="sp-inline-alert sp-inline-alert-error" role="alert">
          <Icon name="alertTriangle" size={15} />
          <span>{error}</span>
        </div>
      )}

      {!connector.is_connected ? (
        <div className="sp-conn-disconnected-card">
          <div className={isNotion ? 'sp-notion-icon-square' : 'sp-conn-hero-icon'}>
            <Icon name={isNotion ? 'notion' : 'link'} size={isNotion ? 24 : 22} />
          </div>

          {!startedConnection && !connectingOauth && (
            <div className="sp-conn-url-copy">
              <span>{connector.mcp_url}</span>
              <button
                type="button"
                className="icon-btn"
                title="Copy URL"
                onClick={() => {
                  void navigator.clipboard.writeText(connector.mcp_url).catch(() => {})
                  setCopiedUrl(true)
                  window.setTimeout(() => setCopiedUrl(false), 1400)
                }}
              >
                <Icon name={copiedUrl ? 'check' : 'copy'} size={13} />
              </button>
            </div>
          )}

          <p
            className={`sp-conn-not-connected-text ${
              startedConnection || connectingOauth ? 'sp-conn-unfinished-text' : ''
            }`}
          >
            {startedConnection || connectingOauth
              ? `You started connecting to ${connector.name} but didn't finish.`
              : `You're not connected to ${connector.name} yet.`}
          </p>

          <button
            type="button"
            className="sp-btn-white"
            disabled={busy || connectingOauth}
            onClick={() => void handleConnect()}
          >
            {connectingOauth ? (
              <span className="sp-connecting-spinner-row">
                <span className="sp-check-spinner" />
                <span>Connecting…</span>
              </span>
            ) : busy ? (
              'Connecting…'
            ) : (
              'Connect'
            )}
          </button>

          <div className="sp-conn-token-fallback">
            <button
              type="button"
              className="sp-token-toggle-btn"
              onClick={() => setTokenInputOpen((v) => !v)}
            >
              {tokenInputOpen ? 'Hide token option' : 'Or connect with an integration token'}
            </button>
            {tokenInputOpen && (
              <div className="sp-token-input-box">
                <input
                  type="password"
                  className="sp-input"
                  placeholder="Paste token (ntn_... or secret_...)"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                />
                <button
                  type="button"
                  className="sp-btn-subtle"
                  disabled={tokenSubmitting || !manualToken.trim()}
                  onClick={() => void handleConnectWithToken()}
                >
                  {tokenSubmitting ? 'Saving…' : 'Submit'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="sp-conn-hero-row">
            <div className={isNotion ? 'sp-notion-icon-square' : 'sp-conn-hero-badge'}>
              <Icon name={isNotion ? 'notion' : 'link'} size={isNotion ? 24 : 18} />
            </div>
            <div>
              <div className="sp-conn-title-row">
                <h3 className="sp-conn-detail-title">{connector.name}</h3>
                <span className="sp-conn-interactive-badge">
                  {writeTools.length > 0 ? 'Interactive' : 'Web'}
                </span>
              </div>
              <div className="sp-conn-url-copy">
                <span>{connector.mcp_url}</span>
                <button
                  type="button"
                  className="icon-btn"
                  title="Copy URL"
                  onClick={() => {
                    void navigator.clipboard.writeText(connector.mcp_url).catch(() => {})
                    setCopiedUrl(true)
                    window.setTimeout(() => setCopiedUrl(false), 1400)
                  }}
                >
                  <Icon name={copiedUrl ? 'check' : 'copy'} size={13} />
                </button>
              </div>
            </div>
          </div>

          {isNotion && (
            <div className="sp-conn-about-block">
              <p className="sp-conn-desc-main">
                Connect Notion to your agent so it works from the same context as your team and other
                agents. Search your workspace, create and update pages, and save your work back to
                Notion.
              </p>
              <p className="sp-conn-key-features">
                <strong>Key features</strong> • <strong>Find answers in your workspace:</strong>{' '}
                Search your pages and databases for answers grounded in your team&apos;s knowledge. •{' '}
                <strong>Turn chats into docs:</strong> Save research, plans, specs, and notes as
                pages your team can review and edit. • <strong>Keep projects moving:</strong> Create
                tasks, update statuses, and add notes to your databases directly from chat. •{' '}
                <strong>Share one brain across agents:</strong> Store memories and skills in Notion
                so your agents follow your preferences and ways of working.
              </p>
              <div className="sp-prompt-suggestions-wrap">
                <h5>Prompt suggestions</h5>
                <div className="sp-prompt-suggestions-pills">
                  <button
                    type="button"
                    className="sp-prompt-pill"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText('Build my project hub in Notion')
                        .catch(() => {})
                      onNotify('Copied suggestion to clipboard')
                    }}
                  >
                    <span>Build my project hub</span>
                    <span className="sp-arrow-diag">↗</span>
                  </button>
                  <button
                    type="button"
                    className="sp-prompt-pill"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText('Find Notion pages to merge')
                        .catch(() => {})
                      onNotify('Copied suggestion to clipboard')
                    }}
                  >
                    <span>Find pages to merge</span>
                    <span className="sp-arrow-diag">↗</span>
                  </button>
                  <button
                    type="button"
                    className="sp-prompt-pill"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText("Show what's on my plate from Notion")
                        .catch(() => {})
                      onNotify('Copied suggestion to clipboard')
                    }}
                  >
                    <span>Show what&apos;s on my plate</span>
                    <span className="sp-arrow-diag">↗</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="sp-conn-perms-section">
            <div className="sp-conn-perms-heading">
              <h4>Tool permissions</h4>
              <p>Choose when Orbit is allowed to use these tools.</p>
            </div>

            {connector.tools.length === 0 ? (
              <div className="sp-conn-no-tools">
                <p>
                  Connected to {connector.name}, but this server did not advertise any MCP tools
                  yet.
                </p>
                <button
                  type="button"
                  className="sp-btn-subtle"
                  disabled={busy}
                  onClick={() => void handleConnect()}
                >
                  <Icon name="refresh" size={13} />
                  <span>Refresh tool list</span>
                </button>
              </div>
            ) : (
              <>
                {writeTools.length > 0 && (
                  <ToolPermissionGroup
                    title={`Interactive tools (${writeTools.length})`}
                    tools={writeTools}
                    permissions={connector.tool_permissions}
                    onSetToolPermission={(tname, level) =>
                      void saveToolPermissions({ [tname]: level })
                    }
                    onSetBulkPermission={(names, level) => {
                      const patch: Record<string, ToolPermissionLevel> = {}
                      for (const n of names) patch[n] = level
                      void saveToolPermissions(patch)
                    }}
                  />
                )}

                <ToolPermissionGroup
                  title={`Read-only tools (${readOnlyTools.length})`}
                  tools={readOnlyTools}
                  permissions={connector.tool_permissions}
                  onSetToolPermission={(tname, level) =>
                    void saveToolPermissions({ [tname]: level })
                  }
                  onSetBulkPermission={(names, level) => {
                    const patch: Record<string, ToolPermissionLevel> = {}
                    for (const n of names) patch[n] = level
                    void saveToolPermissions(patch)
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
