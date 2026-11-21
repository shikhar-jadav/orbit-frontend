import { useCallback, useEffect, useState } from 'react'
import type { CanvasItem } from './UniversalCanvas'
import './WorkspaceArtifactsPanel.css'

interface WorkspaceArtifact {
  file_path?: string
  name?: string
  title?: string
  artifact_type?: string
  language?: string
  content?: string
  mime_type?: string
  size_bytes?: number
  modified?: number
  source?: 'workspace_file' | 'legacy'
}

interface WorkspaceArtifactsPanelProps {
  threadId: string
  onOpen: (item: CanvasItem) => void
  onClose: () => void
}

export function WorkspaceArtifactsPanel({
  threadId,
  onOpen,
  onClose,
}: WorkspaceArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<WorkspaceArtifact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!threadId) return

    try {
      const response = await fetch(`/threads/${encodeURIComponent(threadId)}/artifacts`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error(`Could not load artifacts (${response.status})`)
      const result = await response.json()
      if (!Array.isArray(result)) throw new Error('Artifact response was not a list')
      setArtifacts(result)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load artifacts')
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => {
    if (!threadId) return
    const initialLoad = window.setTimeout(() => void refresh(), 0)

    let refreshTimeout: number | undefined
    const events = new EventSource(
      `/threads/${encodeURIComponent(threadId)}/workspace/events`,
      { withCredentials: true },
    )
    events.onmessage = () => {
      window.clearTimeout(refreshTimeout)
      refreshTimeout = window.setTimeout(() => void refresh(), 150)
    }
    const poll = window.setInterval(() => void refresh(), 10000)

    return () => {
      events.close()
      window.clearInterval(poll)
      window.clearTimeout(initialLoad)
      window.clearTimeout(refreshTimeout)
    }
  }, [threadId, refresh])

  const openArtifact = (artifact: WorkspaceArtifact) => {
    if (artifact.source === 'legacy') {
      onOpen({
        type: 'artifact',
        title: artifact.title || artifact.name || 'Artifact',
        artifactType: artifact.artifact_type,
        language: artifact.language,
        content: artifact.content || '',
      })
      return
    }
    if (!artifact.file_path) return
    onOpen({
      type: 'file',
      filePath: artifact.file_path,
      title: artifact.name || artifact.file_path,
      artifactType: artifact.artifact_type,
      mimeType: artifact.mime_type,
      sizeBytes: artifact.size_bytes,
    })
  }

  return (
    <aside className="workspace-artifacts-panel" aria-label="Artifacts">
      <header className="workspace-artifacts-header">
        <div>
          <strong>Artifacts</strong>
          <span>{artifacts.length}</span>
        </div>
        <div className="workspace-artifacts-actions">
          <button type="button" onClick={() => void refresh()} aria-label="Refresh artifacts" title="Refresh">
            R
          </button>
          <button type="button" onClick={onClose} aria-label="Close artifacts" title="Close">
            x
          </button>
        </div>
      </header>
      {error && <p className="workspace-artifacts-error" role="alert">{error}</p>}
      {!threadId ? (
        <p className="workspace-artifacts-empty">Select a conversation to view its artifacts.</p>
      ) : loading ? (
        <p className="workspace-artifacts-empty">Loading artifacts...</p>
      ) : artifacts.length === 0 ? (
        <p className="workspace-artifacts-empty">Files you create in this conversation will appear here.</p>
      ) : (
        <div className="workspace-artifacts-list">
          {artifacts.map((artifact, index) => {
            const title = artifact.name || artifact.title || artifact.file_path || 'Artifact'
            return (
              <button
                type="button"
                className="workspace-artifact-item"
                key={`${artifact.source}:${artifact.file_path || artifact.title || index}`}
                onClick={() => openArtifact(artifact)}
              >
                <span className="workspace-artifact-kind">
                  {(artifact.artifact_type || 'file').replaceAll('_', ' ')}
                </span>
                <strong>{title}</strong>
                <small>{artifact.file_path || (artifact.source === 'legacy' ? 'Saved artifact' : '')}</small>
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}
