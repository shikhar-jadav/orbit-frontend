import { useState } from 'react'
import { Icon } from './Icon'

type ShowcaseTab = 'pipeline' | 'canvas' | 'isolation'

export function AuthShowcase({ emailOtpEnabled }: { emailOtpEnabled: boolean }) {
  const [tab, setTab] = useState<ShowcaseTab>('pipeline')

  return (
    <aside className="auth-showcase" aria-label="Orbit Studio workspace preview">
      <div className="auth-showcase-inner">
        <div className="auth-showcase-head">
          <h2 className="auth-showcase-heading">
            One local workspace for reasoning, files, and multi-format artifacts.
          </h2>
          <p className="auth-showcase-copy">
            Every account gets an isolated project directory, conversation history, and session boundary without sending local workspace files away.
          </p>
        </div>

        <div className="auth-showcase-tabs" role="tablist" aria-label="Preview studio capabilities">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pipeline'}
            className={`auth-showcase-tab ${tab === 'pipeline' ? 'active' : ''}`}
            onClick={() => setTab('pipeline')}
          >
            <Icon name="terminal" size={14} />
            <span>Agent loop</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'canvas'}
            className={`auth-showcase-tab ${tab === 'canvas' ? 'active' : ''}`}
            onClick={() => setTab('canvas')}
          >
            <Icon name="layers" size={14} />
            <span>Universal canvas</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'isolation'}
            className={`auth-showcase-tab ${tab === 'isolation' ? 'active' : ''}`}
            onClick={() => setTab('isolation')}
          >
            <Icon name="shield" size={14} />
            <span>Session boundary</span>
          </button>
        </div>

        <div className="auth-preview-frame">
          <div className="auth-preview-chrome">
            <span className="auth-preview-title">
              <Icon name="orbit" size={13} />
              <span>
                {tab === 'pipeline'
                  ? 'Thread: api-auth-refactor'
                  : tab === 'canvas'
                  ? 'Canvas: architecture-spec.md'
                  : 'Security: Local Workspace Guard'}
              </span>
            </span>
            <span className="auth-preview-pill">
              {emailOtpEnabled ? 'Password & SMTP OTP' : 'Local Password Auth'}
            </span>
          </div>

          {tab === 'pipeline' && (
            <div className="auth-preview-body" key="pipeline">
              <div className="preview-prompt-bubble">
                Build the quarterly metrics workbook and export a markdown summary.
              </div>
              <div className="preview-tool-strip">
                <span className="preview-tool-dot" />
                <span>workspace_write</span>
                <span className="preview-tool-meta">q4-summary.xlsx</span>
              </div>
              <div className="preview-tool-strip">
                <span className="preview-tool-dot" />
                <span>workspace_write</span>
                <span className="preview-tool-meta">executive-brief.md</span>
              </div>
              <div className="preview-artifact-card">
                <div className="preview-artifact-icon">
                  <Icon name="fileText" size={16} />
                </div>
                <div className="preview-artifact-text">
                  <div className="preview-artifact-title">Executive Brief</div>
                  <div className="preview-artifact-sub">Markdown deliverable</div>
                </div>
                <span className="preview-artifact-action">Open</span>
              </div>
            </div>
          )}

          {tab === 'canvas' && (
            <div className="auth-preview-body" key="canvas">
              <div className="preview-canvas-bar">
                <span className="preview-canvas-badge active">Rendered</span>
                <span className="preview-canvas-badge">Source</span>
                <span className="preview-canvas-badge">Download</span>
              </div>
              <div className="preview-doc-lines">
                <div className="preview-doc-h">Universal Artifact Preview</div>
                <p className="preview-doc-p">
                  Inspect Markdown, code, PDF documents, Word files, spreadsheets, presentations, and media streams directly beside your active thread.
                </p>
                <div className="preview-ext-row">
                  <span>MD</span>
                  <span>PDF</span>
                  <span>XLSX</span>
                  <span>DOCX</span>
                  <span>PPTX</span>
                  <span>MP4</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'isolation' && (
            <div className="auth-preview-body" key="isolation">
              <ul className="preview-spec-list">
                <li>
                  <Icon name="key" size={14} />
                  <div>
                    <strong>Per-user workspaces</strong>
                    <span>Threads, attachments, custom skills, and generated files stay isolated per account.</span>
                  </div>
                </li>
                <li>
                  <Icon name="shield" size={14} />
                  <div>
                    <strong>HttpOnly session cookies</strong>
                    <span>24-hour standard sessions or 30-day trusted devices with individual revocation.</span>
                  </div>
                </li>
                <li>
                  <Icon name="refresh" size={14} />
                  <div>
                    <strong>Offline &amp; email recovery</strong>
                    <span>
                      {emailOtpEnabled
                        ? 'Recover access with 6-digit SMTP verification codes or single-use ORBIT backup keys.'
                        : 'Recover access cleanly via single-use ORBIT backup codes or admin reset tokens.'}
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
