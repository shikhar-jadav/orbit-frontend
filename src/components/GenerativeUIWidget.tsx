import { useState, useRef, useEffect } from 'react'
import './GenerativeUIWidget.css'

interface GenerativeUIWidgetProps {
  title: string
  html: string
  description?: string
  inline?: boolean
}

export function GenerativeUIWidget({
  title,
  html,
  description,
  inline = true,
}: GenerativeUIWidgetProps) {
  const [fullscreen, setFullscreen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isDiagram = /<svg\b/i.test(html)

  // Construct self-contained HTML document with Tailwind and Theme CSS
  const fullDocument = `<!DOCTYPE html>
<html class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --background: #090b10;
      --foreground: #f1f5f9;
      --card: #131722;
      --card-foreground: #f1f5f9;
      --border: #22293a;
      --primary: #6366f1;
      --primary-foreground: #ffffff;
      --secondary: #1e2433;
      --secondary-foreground: #cbd5e1;
      --muted: #1e2433;
      --muted-foreground: #94a3b8;
      --accent: #06b6d4;
    }
    body {
      background-color: transparent;
      color: var(--foreground);
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
    }
    svg {
      display: block;
      width: min(100%, 720px);
      max-height: 480px;
      height: auto;
    }
    svg text:not([fill]) {
      fill: #e5e7eb;
    }
  </style>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased">
  ${html}
</body>
</html>`

  useEffect(() => {
    // Notify iframe height adjustments if available
    const handleMessage = (e: MessageEvent) => {
      if (e.data && typeof e.data.frameHeight === 'number' && iframeRef.current) {
        iframeRef.current.style.height = `${Math.min(e.data.frameHeight + 20, 520)}px`
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div
      className={`generative-ui-container ${inline ? 'is-inline' : 'is-standalone'} ${isDiagram ? 'is-diagram' : ''} ${fullscreen ? 'fullscreen-overlay' : ''}`}
    >
      <div className="generative-ui-card">
        <div className="generative-ui-header">
          <div className="gen-ui-header-left">
            <span className="gen-ui-badge">Generative UI</span>
            <span className="gen-ui-title">{title}</span>
          </div>
          <div className="gen-ui-actions">
            <button
              className={`gen-ui-btn ${showCode ? 'active' : ''}`}
              onClick={() => setShowCode((s) => !s)}
              title={showCode ? 'View Component' : 'View HTML Code'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
            <button
              className="gen-ui-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(html)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1400)
                } catch {
                  // Ignore clipboard failure
                }
              }}
              title={copied ? 'Copied HTML!' : 'Copy HTML'}
            >
              {copied ? (
                <span style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 600 }}>Copied!</span>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>
            <button
              className="gen-ui-btn"
              onClick={() => setReloadKey((k) => k + 1)}
              title="Reset widget"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </button>
            <button
              className="gen-ui-btn"
              onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? 'Exit modal' : 'Open modal view'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {fullscreen ? (
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                ) : (
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {description && <div className="gen-ui-desc">{description}</div>}

        {showCode ? (
          <div className="generative-ui-code-preview" style={{ padding: '12px', background: '#0a0d14', borderRadius: '8px', border: '1px solid var(--border)', overflowX: 'auto' }}>
            <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
              <code>{html}</code>
            </pre>
          </div>
        ) : (
          <div className="generative-ui-frame-wrapper">
            <iframe
              key={reloadKey}
              ref={iframeRef}
              className="generative-ui-iframe"
              srcDoc={fullDocument}
              sandbox="allow-scripts allow-modals"
              title={title}
            />
          </div>
        )}
      </div>
    </div>
  )
}
