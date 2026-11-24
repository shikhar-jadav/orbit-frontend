import { ArtifactCard } from './ArtifactCard'
import type { CanvasItem } from './UniversalCanvas'

export interface ArtifactData {
  title: string
  artifact_type: string
  language?: string
  content: string
  status?: string
}

interface ArtifactWidgetProps {
  artifact: ArtifactData
  onRun?: (code: string) => void
  onOpenCanvas?: (item: CanvasItem) => void
}

export function ArtifactWidget({ artifact, onOpenCanvas }: ArtifactWidgetProps) {
  const isCode = artifact.artifact_type === 'code' || !!artifact.language
  const isPlan = artifact.artifact_type === 'markdown_plan' || artifact.artifact_type === 'plan'

  const ext = artifact.language || (isPlan ? 'md' : 'txt')
  const syntheticPath = `${artifact.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.${ext}`

  return (
    <ArtifactCard
      filePath={syntheticPath}
      title={artifact.title}
      typeLabel={isPlan ? 'Plan' : isCode ? 'Code' : 'Document'}
      extension={ext.toUpperCase()}
      onClick={() =>
        onOpenCanvas?.({
          type: 'artifact',
          title: artifact.title,
          artifactType: artifact.artifact_type,
          language: artifact.language,
          content: artifact.content,
        })
      }
    />
  )
}
