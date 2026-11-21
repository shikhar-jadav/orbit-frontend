import { useState } from 'react'
import './A2UICanvas.css'

export type A2UIComponent =
  | { type: 'card'; title: string; description?: string; badge?: string; content?: string; raw?: string }
  | { type: 'metric'; label: string; value: string | number; delta?: string; status?: 'positive' | 'negative' | 'neutral'; icon?: string }
  | { type: 'chart' | 'barchart'; title?: string; data: Array<{ label: string; value: number; color?: string }> }
  | { type: 'table'; headers: string[]; rows: Array<Array<string | number>> }
  | { type: 'button'; label: string; action_id: string; variant?: 'primary' | 'secondary' | 'outline' | 'destructive'; payload?: Record<string, unknown> }
  | { type: 'alert'; variant?: 'info' | 'warning' | 'success' | 'error'; title?: string; message: string }
  | { type: 'form'; title?: string; fields: Array<{ name: string; label: string; type?: string; placeholder?: string }>; submit_label?: string; action_id: string }
  | { type: 'progress'; label: string; value: number; max?: number; color?: string }
  | { type: 'tags' | 'badge_list'; title?: string; tags: string[] }
  | { type: 'divider' }

export type A2UICanvasData = {
  canvas_id: string
  thread_id?: string
  title: string
  spec:
    | {
        components?: A2UIComponent[]
        [key: string]: unknown
      }
    | A2UIComponent[]
    | Record<string, unknown>
  created_at?: string
}

interface A2UICanvasProps {
  canvas: A2UICanvasData
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void
  onClose?: () => void
}

export function A2UICanvas({ canvas, onAction, onClose }: A2UICanvasProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Extract components list from spec
  const components: A2UIComponent[] = Array.isArray(canvas.spec)
    ? (canvas.spec as A2UIComponent[])
    : Array.isArray((canvas.spec as { components?: A2UIComponent[] })?.components)
    ? ((canvas.spec as { components?: A2UIComponent[] }).components as A2UIComponent[])
    : canvas.spec && typeof canvas.spec === 'object' && 'type' in canvas.spec
    ? [canvas.spec as A2UIComponent]
    : [
        {
          type: 'card',
          title: canvas.title,
          description: 'A2UI Catalog Canvas Spec',
          content: JSON.stringify(canvas.spec, null, 2),
        },
      ]

  function handleButtonClick(actionId: string, payload?: Record<string, unknown>) {
    setActiveAction(actionId)
    onAction?.(actionId, payload)
    window.setTimeout(() => setActiveAction(null), 1200)
  }

  function handleFormSubmit(actionId: string, e: React.FormEvent) {
    e.preventDefault()
    setActiveAction(actionId)
    onAction?.(actionId, formValues)
    window.setTimeout(() => setActiveAction(null), 1200)
  }

  return (
    <div className="a2ui-canvas-container">
      <div className="a2ui-canvas-header">
        <div className="a2ui-header-left">
          <span className="a2ui-tag">A2UI 1.0</span>
          <h3 className="a2ui-title">{canvas.title}</h3>
        </div>
        <div className="a2ui-header-actions">
          <button
            className="icon-btn a2ui-copy-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(canvas.spec, null, 2))
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              } catch {
                // Ignore clipboard failures
              }
            }}
            title={copied ? 'Copied spec to clipboard' : 'Copy A2UI JSON spec'}
          >
            {copied ? (
              <span style={{ fontSize: '11px', color: 'var(--success)' }}>Copied!</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
          </button>
          {onClose && (
            <button className="icon-btn a2ui-close-btn" onClick={onClose} title="Close Canvas">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="a2ui-canvas-body">
        {components.map((comp, idx) => {
          switch (comp.type) {
            case 'metric': {
              const isPos = comp.status === 'positive' || (comp.delta && comp.delta.startsWith('+'))
              const isNeg = comp.status === 'negative' || (comp.delta && comp.delta.startsWith('-'))
              return (
                <div key={idx} className="a2ui-metric-card">
                  <span className="a2ui-metric-label">{comp.label}</span>
                  <div className="a2ui-metric-value-row">
                    <span className="a2ui-metric-value">{comp.value}</span>
                    {comp.delta && (
                      <span className={`a2ui-delta-badge ${isPos ? 'pos' : isNeg ? 'neg' : 'neutral'}`}>
                        {comp.delta}
                      </span>
                    )}
                  </div>
                </div>
              )
            }
            case 'card': {
              return (
                <div key={idx} className="a2ui-card">
                  <div className="a2ui-card-top">
                    <h4 className="a2ui-card-title">{comp.title}</h4>
                    {comp.badge && <span className="a2ui-card-badge">{comp.badge}</span>}
                  </div>
                  {comp.description && <p className="a2ui-card-desc">{comp.description}</p>}
                  {comp.content && <div className="a2ui-card-content">{comp.content}</div>}
                  {comp.raw && <pre className="a2ui-card-pre">{comp.raw}</pre>}
                </div>
              )
            }
            case 'chart':
            case 'barchart': {
              const maxVal = Math.max(...(comp.data?.map((d) => d.value) || [1]), 1)
              return (
                <div key={idx} className="a2ui-chart-card">
                  {comp.title && <h4 className="a2ui-card-title">{comp.title}</h4>}
                  <div className="a2ui-bar-list">
                    {comp.data?.map((item, dIdx) => {
                      const pct = Math.round((item.value / maxVal) * 100)
                      return (
                        <div key={dIdx} className="a2ui-bar-item">
                          <div className="a2ui-bar-labels">
                            <span className="a2ui-bar-label">{item.label}</span>
                            <span className="a2ui-bar-val">{item.value}</span>
                          </div>
                          <div className="a2ui-bar-track">
                            <div
                              className="a2ui-bar-fill"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: item.color || 'var(--accent-glow)',
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }
            case 'table': {
              return (
                <div key={idx} className="a2ui-table-container">
                  <table className="a2ui-table">
                    <thead>
                      <tr>
                        {comp.headers.map((h, hIdx) => (
                          <th key={hIdx}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comp.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
            case 'button': {
              return (
                <div key={idx} className="a2ui-action-row">
                  <button
                    className={`a2ui-btn a2ui-btn-${comp.variant || 'primary'} ${
                      activeAction === comp.action_id ? 'loading' : ''
                    }`}
                    onClick={() => handleButtonClick(comp.action_id, comp.payload)}
                  >
                    <span>{comp.label}</span>
                    {activeAction === comp.action_id && <span className="a2ui-btn-spinner" />}
                  </button>
                </div>
              )
            }
            case 'alert': {
              return (
                <div key={idx} className={`a2ui-alert a2ui-alert-${comp.variant || 'info'}`}>
                  {comp.title && <strong className="a2ui-alert-title">{comp.title}</strong>}
                  <span className="a2ui-alert-message">{comp.message}</span>
                </div>
              )
            }
            case 'form': {
              return (
                <form key={idx} className="a2ui-form" onSubmit={(e) => handleFormSubmit(comp.action_id, e)}>
                  {comp.title && <h4 className="a2ui-card-title">{comp.title}</h4>}
                  {comp.fields?.map((f, fIdx) => (
                    <div key={fIdx} className="a2ui-form-field">
                      <label className="a2ui-field-label">{f.label}</label>
                      <input
                        className="a2ui-field-input"
                        type={f.type || 'text'}
                        placeholder={f.placeholder || ''}
                        value={formValues[f.name] || ''}
                        onChange={(e) =>
                          setFormValues((prev) => ({ ...prev, [f.name]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                  <button type="submit" className="a2ui-btn a2ui-btn-primary">
                    <span>{comp.submit_label || 'Submit'}</span>
                  </button>
                </form>
              )
            }
            case 'progress': {
              const max = comp.max || 100
              const pct = Math.min(Math.max(Math.round((comp.value / max) * 100), 0), 100)
              return (
                <div key={idx} className="a2ui-chart-card">
                  <div className="a2ui-bar-labels">
                    <span className="a2ui-bar-label">{comp.label}</span>
                    <span className="a2ui-bar-val">
                      {comp.value} / {max} ({pct}%)
                    </span>
                  </div>
                  <div className="a2ui-bar-track">
                    <div
                      className="a2ui-bar-fill"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: comp.color || 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              )
            }
            case 'tags':
            case 'badge_list': {
              return (
                <div key={idx} className="a2ui-card">
                  {comp.title && <h4 className="a2ui-card-title">{comp.title}</h4>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {comp.tags?.map((tag, tIdx) => (
                      <span key={tIdx} className="a2ui-card-badge">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )
            }
            case 'divider': {
              return (
                <hr
                  key={idx}
                  style={{
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    margin: '8px 0',
                    opacity: 0.6,
                  }}
                />
              )
            }
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
