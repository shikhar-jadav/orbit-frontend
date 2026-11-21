import { useState } from 'react'
import './ExecutionWidget.css'

export interface ExecutionData {
  status: 'completed' | 'failed' | 'timeout' | 'error'
  exit_code: number
  duration_seconds: number
  stdout: string
  stderr: string
  truncated?: boolean
  error?: string
}

interface ExecutionWidgetProps {
  execution: ExecutionData
}

export function ExecutionWidget({ execution }: ExecutionWidgetProps) {
  const [copied, setCopied] = useState(false)
  const isSuccess = execution.status === 'completed' && execution.exit_code === 0
  const isTimeout = execution.status === 'timeout'

  const copyOutput = async () => {
    try {
      const allText = [execution.stdout, execution.stderr].filter(Boolean).join('\n')
      await navigator.clipboard.writeText(allText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className={`execution-widget-card ${isSuccess ? 'success' : isTimeout ? 'timeout' : 'failed'}`}>
      <div className="execution-header">
        <div className="execution-header-left">
          <div className={`status-indicator ${isSuccess ? 'success' : isTimeout ? 'timeout' : 'failed'}`} />
          <span className="execution-title">Terminal Execution</span>
          <span className={`status-badge ${isSuccess ? 'success' : isTimeout ? 'timeout' : 'failed'}`}>
            {isSuccess ? 'Exit 0' : isTimeout ? 'Timed out' : `Exit ${execution.exit_code}`}
          </span>
          <span className="duration-badge">{execution.duration_seconds}s</span>
        </div>
        <div className="execution-header-actions">
          <button className="exec-btn" onClick={copyOutput} title="Copy output">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="execution-body">
        {execution.stdout ? (
          <pre className="exec-stdout">{execution.stdout}</pre>
        ) : null}

        {execution.stderr ? (
          <pre className="exec-stderr">{execution.stderr}</pre>
        ) : null}

        {!execution.stdout && !execution.stderr && (
          <div className="exec-empty">Process finished with no output.</div>
        )}

        {execution.truncated && (
          <div className="exec-truncated">Output truncated to protect context buffer.</div>
        )}
      </div>
    </div>
  )
}
