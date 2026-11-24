import './ArtifactCard.css'
import { getFileCategory, formatFriendlyTitle } from './artifactUtils'

export interface ArtifactCardProps {
  filePath?: string
  title?: string
  typeLabel?: string
  extension?: string
  lines?: number
  sizeBytes?: number
  onClick?: () => void
}

export function ArtifactCard({
  filePath = '',
  title,
  typeLabel,
  extension,
  onClick,
}: ArtifactCardProps) {
  const info = getFileCategory(filePath)
  const displayTitle = formatFriendlyTitle(filePath, title)
  const displayLabel = typeLabel || info.label
  const displayExt = extension || info.ext

  return (
    <div
      className={`artifact-pill-card category-${info.category}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={`Open ${displayTitle} in Canvas`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <div className="artifact-pill-icon-box" style={{ borderColor: `${info.color}33`, color: info.color }}>
        {info.category === 'code' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        ) : info.category === 'spreadsheet' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        ) : info.category === 'presentation' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        ) : info.category === 'video' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" fillOpacity="0.2" />
            <rect x="2" y="2" width="20" height="20" rx="3" />
          </svg>
        ) : info.category === 'audio' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        ) : info.category === 'image' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
      </div>

      <div className="artifact-pill-content">
        <span className="artifact-pill-title">{displayTitle}</span>
        <span className="artifact-pill-subtitle">
          {displayLabel} · {displayExt}
        </span>
      </div>

      <div className="artifact-pill-action" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>
    </div>
  )
}
