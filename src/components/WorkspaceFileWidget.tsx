import { ArtifactCard } from './ArtifactCard'
import type { CanvasItem } from './UniversalCanvas'

export interface WorkspaceFileData {
  status: 'written' | 'edited' | 'created' | 'updated' | 'error'
  file_path: string
  lines?: number
  size_bytes?: number
  extension?: string
  artifact_type?: string | null
  mime_type?: string
  occurrences_replaced?: number
  message?: string
  error?: string
}

interface WorkspaceFileWidgetProps {
  data: WorkspaceFileData
  onOpenCanvas?: (item: CanvasItem) => void
}

export function WorkspaceFileWidget({ data, onOpenCanvas }: WorkspaceFileWidgetProps) {
  return (
    <ArtifactCard
      filePath={data.file_path}
      lines={data.lines}
      sizeBytes={data.size_bytes}
      onClick={() =>
        onOpenCanvas?.({
          type: 'file',
          filePath: data.file_path,
          sizeBytes: data.size_bytes,
          artifactType: data.artifact_type || undefined,
          mimeType: data.mime_type,
        })
      }
    />
  )
}
