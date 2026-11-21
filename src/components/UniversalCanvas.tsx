import { useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getFileCategory, formatFriendlyTitle } from './ArtifactCard'
import { GenerativeUIWidget } from './GenerativeUIWidget'
import { A2UICanvas } from './A2UICanvas'
import './UniversalCanvas.css'

export interface CanvasItem {
  type: 'file' | 'artifact' | 'a2ui' | 'generative_ui'
  title?: string
  filePath?: string
  artifactType?: string
  language?: string
  content?: string
  spec?: any
  html?: string
  mimeType?: string
  sizeBytes?: number
}

interface UniversalCanvasProps {
  item: CanvasItem
  threadId: string
  onClose: () => void
  insertPrompt?: (prompt: string) => void
  onA2UIAction?: (actionId: string, payload?: Record<string, unknown>) => void
}

export function UniversalCanvas({
  item,
  threadId,
  onClose,
  insertPrompt,
  onA2UIAction,
}: UniversalCanvasProps) {
  const [loading, setLoading] = useState<boolean>(item.type === 'file' && !item.content)
  const [error, setError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  const [copied, setCopied] = useState<boolean>(false)
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0)
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0)
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [imageZoom, setImageZoom] = useState<number>(100)

  const filePath = item.filePath || ''
  const fileCategory = getFileCategory(filePath)
  const displayTitle = formatFriendlyTitle(filePath, item.title)

  useEffect(() => {
    let isMounted = true

    if (item.type === 'file' && filePath) {
      setLoading(true)
      setError(null)

      fetch(`/threads/${encodeURIComponent(threadId)}/workspace/preview?path=${encodeURIComponent(filePath)}`)
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Failed to load preview' }))
            throw new Error(err.detail || `HTTP ${res.status}`)
          }
          return res.json()
        })
        .then((data) => {
          if (isMounted) {
            setPreviewData(data)
            setLoading(false)
            // Default viewMode based on extension
            const ext = (filePath.split('.').pop() || '').toLowerCase()
            if (['md', 'markdown', 'html'].includes(ext)) {
              setViewMode('preview')
            } else {
              setViewMode('source')
            }
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err.message || 'Error loading preview')
            setLoading(false)
          }
        })
    } else if (item.type === 'artifact' && item.content) {
      setPreviewData({
        type: 'text',
        content: item.content,
        extension: item.language || 'md',
        filename: item.title || 'Artifact',
      })
      setLoading(false)
    }

    return () => {
      isMounted = false
    }
  }, [item, filePath, threadId])

  const copyContent = async () => {
    let textToCopy = ''
    if (previewData?.content) {
      textToCopy = previewData.content
    } else if (previewData?.raw_text) {
      textToCopy = previewData.raw_text
    } else if (item.content) {
      textToCopy = item.content
    } else if (filePath) {
      textToCopy = filePath
    }

    if (textToCopy) {
      try {
        await navigator.clipboard.writeText(textToCopy)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      } catch {
        // clipboard fallback
      }
    }
  }

  const downloadFile = () => {
    if (filePath) {
      window.open(`/threads/${encodeURIComponent(threadId)}/workspace/download?path=${encodeURIComponent(filePath)}`, '_blank')
    }
  }

  const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown') || item.artifactType === 'markdown_plan'
  const isCode = fileCategory.category === 'code' || item.artifactType === 'code'

  // Filtered rows for Excel or CSV
  const filteredRows = useMemo(() => {
    if (!previewData) return []
    let rows: string[][] = []

    if (previewData.type === 'excel' && previewData.sheets?.[activeSheetIndex]) {
      rows = previewData.sheets[activeSheetIndex].rows || []
    } else if (previewData.type === 'csv' && previewData.rows) {
      rows = previewData.rows
    }

    if (!searchFilter.trim()) return rows
    const q = searchFilter.toLowerCase()
    return rows.filter((row, idx) => idx === 0 || row.some((cell) => String(cell).toLowerCase().includes(q)))
  }, [previewData, activeSheetIndex, searchFilter])

  return (
    <div className="universal-canvas-root">
      {/* ----------------- CANVAS TOPBAR ----------------- */}
      <header className="canvas-header">
        <div className="canvas-header-left">
          <div
            className="canvas-header-icon"
            style={{ color: fileCategory.color, borderColor: `${fileCategory.color}44` }}
          >
            {fileCategory.category === 'code' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            ) : fileCategory.category === 'spreadsheet' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
            ) : fileCategory.category === 'presentation' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            ) : fileCategory.category === 'video' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
                <rect x="2" y="2" width="20" height="20" rx="3" />
              </svg>
            ) : fileCategory.category === 'audio' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            ) : fileCategory.category === 'pdf' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
          </div>
          <div className="canvas-header-meta">
            <h2 className="canvas-header-title">{displayTitle}</h2>
            <span className="canvas-header-path">{filePath || item.title || 'Canvas Item'}</span>
          </div>
        </div>

        <div className="canvas-header-actions">
          {/* Toggle Preview / Source for Markdown */}
          {isMarkdown && (
            <div className="canvas-segmented-control">
              <button
                className={`canvas-seg-btn ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
              >
                Preview
              </button>
              <button
                className={`canvas-seg-btn ${viewMode === 'source' ? 'active' : ''}`}
                onClick={() => setViewMode('source')}
              >
                Source
              </button>
            </div>
          )}

          {/* Copy Button */}
          <button className="canvas-action-btn" onClick={copyContent} title="Copy to clipboard">
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ color: '#34d399' }}>Copied</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Run code button */}
          {isCode && insertPrompt && (
            <button
              className="canvas-action-btn run-btn"
              onClick={() => {
                const target = filePath || (item.content ? `python script` : 'main.py')
                insertPrompt(`Run ${target} in the workspace and show execution output`)
              }}
              title="Execute in workspace sandbox"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Run</span>
            </button>
          )}

          {/* Download Button */}
          {filePath && (
            <button className="canvas-action-btn" onClick={downloadFile} title="Download file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download</span>
            </button>
          )}

          {/* Close Canvas */}
          <button className="canvas-close-btn" onClick={onClose} title="Close Canvas (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* ----------------- CANVAS BODY ----------------- */}
      <div className="canvas-body">
        {loading ? (
          <div className="canvas-loading">
            <span className="canvas-spinner" />
            <p>Loading {displayTitle}...</p>
          </div>
        ) : error ? (
          <div className="canvas-error-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3>Could not preview file</h3>
            <p>{error}</p>
            {filePath && (
              <button className="canvas-download-fallback" onClick={downloadFile}>
                Download {filePath} directly
              </button>
            )}
          </div>
        ) : item.type === 'a2ui' && item.spec ? (
          <div className="canvas-a2ui-wrapper">
            <A2UICanvas
              canvas={{ canvas_id: 'canvas-active', title: item.title || 'A2UI Canvas', spec: item.spec }}
              onAction={onA2UIAction}
            />
          </div>
        ) : item.type === 'generative_ui' && item.html ? (
          <div className="canvas-genui-wrapper">
            <GenerativeUIWidget title={item.title || 'Interactive Widget'} html={item.html} />
          </div>
        ) : previewData?.type === 'docx' ? (
          /* ---------- 1. WORD DOCUMENT (.docx) ---------- */
          <div className="canvas-doc-page">
            <div
              className="canvas-docx-rendered"
              dangerouslySetInnerHTML={{ __html: previewData.html || '<p>Empty document</p>' }}
            />
          </div>
        ) : previewData?.type === 'html' ? (
          <iframe
            className="canvas-html-preview"
            title={displayTitle}
            src={previewData.serve_url}
            sandbox="allow-scripts allow-forms"
          />
        ) : previewData?.type === 'excel' ? (
          /* ---------- 2. EXCEL WORKBOOK (.xlsx, .xls) ---------- */
          <div className="canvas-sheet-container">
            {/* Sheet Tabs */}
            {previewData.sheets && previewData.sheets.length > 0 && (
              <div className="canvas-sheet-tabs-bar">
                <div className="canvas-sheet-tabs">
                  {previewData.sheets.map((sheet: any, idx: number) => (
                    <button
                      key={sheet.sheet_name || idx}
                      className={`canvas-sheet-tab ${activeSheetIndex === idx ? 'active' : ''}`}
                      onClick={() => setActiveSheetIndex(idx)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9h18M9 3v18" />
                      </svg>
                      <span>{sheet.sheet_name || `Sheet ${idx + 1}`}</span>
                    </button>
                  ))}
                </div>
                <div className="canvas-sheet-search">
                  <input
                    type="text"
                    placeholder="Search cells..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Grid Table */}
            <div className="canvas-table-scroll">
              <table className="canvas-data-table">
                <thead>
                  {filteredRows.length > 0 && (
                    <tr>
                      <th className="row-num-header">#</th>
                      {filteredRows[0].map((cell, colIdx) => (
                        <th key={colIdx}>{String(cell) || String.fromCharCode(65 + colIdx)}</th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filteredRows.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="row-num-cell">{rowIdx + 1}</td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length <= 1 && (
                <div className="canvas-empty-table-msg">No data cells found in this sheet.</div>
              )}
            </div>
          </div>
        ) : previewData?.type === 'csv' ? (
          /* ---------- 3. CSV / TSV DATA ---------- */
          <div className="canvas-sheet-container">
            <div className="canvas-sheet-tabs-bar">
              <span className="canvas-csv-badge">{previewData.rows?.length || 0} rows</span>
              <div className="canvas-sheet-search">
                <input
                  type="text"
                  placeholder="Filter CSV rows..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
            </div>
            <div className="canvas-table-scroll">
              <table className="canvas-data-table">
                <thead>
                  {filteredRows.length > 0 && (
                    <tr>
                      <th className="row-num-header">#</th>
                      {filteredRows[0].map((cell, colIdx) => (
                        <th key={colIdx}>{String(cell) || `Col ${colIdx + 1}`}</th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filteredRows.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="row-num-cell">{rowIdx + 1}</td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : previewData?.type === 'pptx' ? (
          /* ---------- 4. PRESENTATION (.pptx) ---------- */
          <div className="canvas-pptx-container">
            <div className="canvas-pptx-toolbar">
              <span className="canvas-slide-indicator">
                Slide {activeSlideIndex + 1} of {previewData.total_slides || 1}
              </span>
              <div className="canvas-pptx-nav">
                <button
                  className="canvas-nav-btn"
                  disabled={activeSlideIndex <= 0}
                  onClick={() => setActiveSlideIndex((i) => Math.max(0, i - 1))}
                >
                  ◀ Prev
                </button>
                <button
                  className="canvas-nav-btn"
                  disabled={activeSlideIndex >= (previewData.slides?.length || 1) - 1}
                  onClick={() => setActiveSlideIndex((i) => Math.min((previewData.slides?.length || 1) - 1, i + 1))}
                >
                  Next ▶
                </button>
              </div>
            </div>

            {/* Main Presentation Slide Card */}
            {previewData.slides?.[activeSlideIndex] && (
              <div className="canvas-slide-stage">
                <div className="canvas-slide-card">
                  <div className="canvas-slide-header">
                    <h3>{previewData.slides[activeSlideIndex].title}</h3>
                  </div>
                  <div className="canvas-slide-body">
                    {previewData.slides[activeSlideIndex].text_blocks?.map((block: string, bIdx: number) => (
                      <div key={bIdx} className="canvas-slide-bullet">
                        <span className="slide-bullet-dot" />
                        <p>{block}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Speaker Notes */}
                {previewData.slides[activeSlideIndex].notes && (
                  <div className="canvas-slide-notes">
                    <h4>Speaker Notes</h4>
                    <p>{previewData.slides[activeSlideIndex].notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Thumbnail Pills */}
            <div className="canvas-pptx-thumbnails">
              {previewData.slides?.map((slide: any, sIdx: number) => (
                <button
                  key={sIdx}
                  className={`canvas-thumb-btn ${activeSlideIndex === sIdx ? 'active' : ''}`}
                  onClick={() => setActiveSlideIndex(sIdx)}
                >
                  <span className="thumb-num">{sIdx + 1}</span>
                  <span className="thumb-title">{slide.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : previewData?.type === 'pdf' ? (
          /* ---------- 5. PDF DOCUMENT (.pdf) ---------- */
          <div className="canvas-pdf-container">
            <iframe
              src={previewData.raw_url}
              className="canvas-pdf-iframe"
              title={displayTitle}
            />
          </div>
        ) : previewData?.type === 'media' ? (
          /* ---------- 6. MEDIA (Video / Audio / Image) ---------- */
          <div className="canvas-media-container">
            {previewData.category === 'video' ? (
              <div className="canvas-video-box">
                <video controls src={previewData.raw_url} className="canvas-video-player" autoPlay={false}>
                  Your browser does not support HTML5 video.
                </video>
              </div>
            ) : previewData.category === 'audio' ? (
              <div className="canvas-audio-box">
                <audio controls src={previewData.raw_url} className="canvas-audio-player">
                  Your browser does not support HTML5 audio.
                </audio>
              </div>
            ) : previewData.category === 'image' ? (
              <div className="canvas-image-stage">
                <div className="canvas-image-controls">
                  <button onClick={() => setImageZoom((z) => Math.max(25, z - 25))}>-</button>
                  <span>{imageZoom}%</span>
                  <button onClick={() => setImageZoom((z) => Math.min(400, z + 25))}>+</button>
                  <button onClick={() => setImageZoom(100)}>Fit</button>
                </div>
                <div className="canvas-image-wrapper">
                  {previewData.svg_content ? (
                    <div
                      className="canvas-svg-display"
                      dangerouslySetInnerHTML={{ __html: previewData.svg_content }}
                    />
                  ) : (
                    <img
                      src={previewData.raw_url}
                      alt={displayTitle}
                      style={{ transform: `scale(${imageZoom / 100})` }}
                    />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          /* ---------- 7. MARKDOWN, CODE & TEXT ---------- */
          <div className="canvas-text-container">
            {isMarkdown && viewMode === 'preview' ? (
              <div className="canvas-markdown-rendered message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {previewData?.content || item.content || ''}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="canvas-code-viewer">
                <pre className="canvas-code-pre">
                  <code>
                    {(previewData?.content || item.content || '')
                      .split('\n')
                      .map((line: string, idx: number) => (
                        <div key={idx} className="canvas-code-line">
                          <span className="canvas-line-number">{idx + 1}</span>
                          <span className="canvas-line-text">{line || ' '}</span>
                        </div>
                      ))}
                  </code>
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
