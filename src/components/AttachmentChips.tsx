import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import './AttachmentChips.css'

export type AttachmentChipItem = {
  key: string
  filename: string
  size: number
  contentType?: string
  url?: string
  file?: File
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const PDF_EXTENSIONS = new Set(['pdf'])
const DOC_EXTENSIONS = new Set(['doc', 'docx', 'rtf', 'odt', 'pages'])
const SHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers'])
const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs',
  'rb', 'php', 'sh', 'bash', 'sql', 'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'md',
])

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  if (idx < 0 || idx === filename.length - 1) return ''
  return filename.slice(idx + 1).toLowerCase()
}

function isImageFile(filename: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith('image/')) return true
  return IMAGE_EXTENSIONS.has(getExtension(filename))
}

function getFileBadge(filename: string, contentType?: string): { label: string; tone: string } {
  const ext = getExtension(filename)
  if (PDF_EXTENSIONS.has(ext) || contentType === 'application/pdf') return { label: 'PDF', tone: 'pdf' }
  if (DOC_EXTENSIONS.has(ext)) return { label: ext.toUpperCase() || 'DOC', tone: 'doc' }
  if (SHEET_EXTENSIONS.has(ext)) return { label: ext.toUpperCase() || 'CSV', tone: 'sheet' }
  if (CODE_EXTENSIONS.has(ext)) return { label: ext.toUpperCase(), tone: 'code' }
  if (contentType?.startsWith('audio/')) return { label: 'AUDIO', tone: 'media' }
  if (contentType?.startsWith('video/')) return { label: 'VIDEO', tone: 'media' }
  return { label: ext ? ext.toUpperCase().slice(0, 5) : 'FILE', tone: 'default' }
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentChips({
  files,
  onRemove,
  disabled = false,
  variant = 'composer',
}: {
  files: AttachmentChipItem[]
  onRemove?: (key: string) => void
  disabled?: boolean
  variant?: 'composer' | 'message'
}) {
  const [lightbox, setLightbox] = useState<{ url: string; filename: string; size: number } | null>(null)
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})

  // Create and clean up ObjectURLs for local File objects (composer previews)
  const localObjectUrls = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of files) {
      if (item.file && !item.url && isImageFile(item.filename, item.contentType)) {
        map.set(item.key, URL.createObjectURL(item.file))
      }
    }
    return map
  }, [files])

  useEffect(() => {
    return () => {
      for (const url of localObjectUrls.values()) {
        URL.revokeObjectURL(url)
      }
    }
  }, [localObjectUrls])

  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

  if (!files.length) return null

  const imageItems: Array<AttachmentChipItem & { resolvedUrl: string }> = []
  const fileItems: AttachmentChipItem[] = []

  for (const item of files) {
    const resolvedUrl = item.url || localObjectUrls.get(item.key) || ''
    if (isImageFile(item.filename, item.contentType) && resolvedUrl && !failedImages[item.key]) {
      imageItems.push({ ...item, resolvedUrl })
    } else {
      fileItems.push(item)
    }
  }

  const isMultiImage = imageItems.length > 1

  return (
    <>
      <div className={`attachment-strip attachment-strip--${variant}`}>
        {imageItems.length > 0 && (
          <div className={`attachment-images ${isMultiImage ? 'is-grid' : 'is-single'}`}>
            {imageItems.map((img) => (
              <div
                className={`attachment-image-card attachment-image-card--${variant}`}
                key={img.key}
                title={`${img.filename} (${formatFileSize(img.size)})`}
              >
                <button
                  type="button"
                  className="attachment-image-trigger"
                  onClick={() => setLightbox({ url: img.resolvedUrl, filename: img.filename, size: img.size })}
                  aria-label={`Preview ${img.filename}`}
                >
                  <img
                    src={img.resolvedUrl}
                    alt={img.filename}
                    loading="lazy"
                    onError={() => setFailedImages((prev) => ({ ...prev, [img.key]: true }))}
                  />
                </button>
                {onRemove && (
                  <button
                    type="button"
                    className="attachment-remove-badge"
                    onClick={() => onRemove(img.key)}
                    disabled={disabled}
                    aria-label={`Remove ${img.filename}`}
                    title={`Remove ${img.filename}`}
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {fileItems.length > 0 && (
          <div className="attachment-files">
            {fileItems.map((file) => {
              const badge = getFileBadge(file.filename, file.contentType)
              const resolvedUrl = file.url || ''
              const inner = (
                <>
                  <span className={`attachment-file-badge tone-${badge.tone}`} aria-hidden="true">
                    {badge.label}
                  </span>
                  <span className="attachment-file-meta">
                    <span className="attachment-file-name">{file.filename}</span>
                    <span className="attachment-file-sub">
                      {badge.label} · {formatFileSize(file.size)}
                    </span>
                  </span>
                </>
              )

              return (
                <div className="attachment-file-card" key={file.key} title={file.filename}>
                  {resolvedUrl && !onRemove ? (
                    <a
                      className="attachment-file-link"
                      href={`${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}download=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="attachment-file-body">{inner}</div>
                  )}
                  {onRemove && (
                    <button
                      type="button"
                      className="attachment-file-remove"
                      onClick={() => onRemove(file.key)}
                      disabled={disabled}
                      aria-label={`Remove ${file.filename}`}
                      title={`Remove ${file.filename}`}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {lightbox &&
        createPortal(
          <div
            className="attachment-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.filename}
            onClick={() => setLightbox(null)}
          >
            <div className="attachment-lightbox-bar" onClick={(e) => e.stopPropagation()}>
              <div className="attachment-lightbox-title">
                <span>{lightbox.filename}</span>
                <span className="attachment-lightbox-size">{formatFileSize(lightbox.size)}</span>
              </div>
              <div className="attachment-lightbox-actions">
                <a
                  href={`${lightbox.url}${lightbox.url.includes('?') ? '&' : '?'}download=1`}
                  download={lightbox.filename}
                  className="attachment-lightbox-btn"
                >
                  Download
                </a>
                <button
                  type="button"
                  className="attachment-lightbox-btn"
                  onClick={() => setLightbox(null)}
                  aria-label="Close preview"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
            <div className="attachment-lightbox-stage" onClick={(e) => e.stopPropagation()}>
              <img src={lightbox.url} alt={lightbox.filename} />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
