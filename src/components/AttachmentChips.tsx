import { Icon } from './Icon'
import './AttachmentChips.css'

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentChips({
  files,
  onRemove,
  disabled = false,
}: {
  files: Array<{ key: string; filename: string; size: number }>
  onRemove?: (key: string) => void
  disabled?: boolean
}) {
  if (!files.length) return null
  return (
    <div className="attachment-chips">
      {files.map((file) => (
        <div className="attachment-chip" key={file.key} title={file.filename}>
          <span className="attachment-chip-name">{file.filename}</span>
          <span className="attachment-chip-size">{formatFileSize(file.size)}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(file.key)}
              disabled={disabled}
              aria-label={`Remove ${file.filename}`}
              title={`Remove ${file.filename}`}
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
