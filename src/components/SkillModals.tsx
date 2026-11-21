import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { ModernDialog } from './ModernDialog'
import type { PersonalSkill, PersonalSkillFile, SkillSecurityScan } from './types'

type UploadSkillViewProps = {
  onBack: () => void
  onUploaded: (created: PersonalSkill[], scans: SkillSecurityScan[]) => void
}

type SecurityScanSummary = SkillSecurityScan & {
  filename?: string
}

type SkillSecurityReportCardProps = {
  report: SkillSecurityScan
  onTrustOverride?: () => void
  busy?: boolean
  overrideLabel?: string
}

function SkillSecurityReportCard({
  report,
  onTrustOverride,
  busy = false,
  overrideLabel = 'Trust skill & install anyway',
}: SkillSecurityReportCardProps) {
  const issues = report.issues ?? []
  const allowOverride = Boolean(onTrustOverride && report.can_trust_override !== false)
  return (
    <div className="sp-security-report" role="alert">
      <div className="sp-security-report-header">
        <span className="sp-security-report-badge">
          <Icon name="shield" size={14} />
          <span>
            {report.scanner}
            {report.version ? ` v${report.version}` : ''}
          </span>
        </span>
        <span className="sp-security-report-score">
          Score {report.score}/100 · {report.recommendation}
          {report.max_issue_severity && report.max_issue_severity !== 'NONE'
            ? ` · Max ${report.max_issue_severity}`
            : ''}
        </span>
      </div>

      {report.reason && <p className="sp-security-report-reason">{report.reason}</p>}

      {issues.length > 0 && (
        <ul className="sp-security-issue-list">
          {issues.slice(0, 5).map((issue, idx) => (
            <li key={`${issue.id}-${idx}`} className="sp-security-issue-item">
              <div className="sp-security-issue-meta">
                <span className={`sp-sev-pill sp-sev-${issue.severity.toLowerCase()}`}>
                  {issue.severity}
                </span>
                <strong>{issue.category}</strong>
                {issue.pattern && <span>· {issue.pattern}</span>}
                {issue.location && <code>{issue.location}</code>}
              </div>
              {issue.finding && <div className="sp-security-issue-finding">{issue.finding}</div>}
              {issue.remediation && (
                <div className="sp-security-issue-remediation">{issue.remediation}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {allowOverride && (
        <div className="sp-security-override-bar">
          <span className="sp-security-override-note">
            Official or trusted skill flagged by a false positive?
          </span>
          <button
            type="button"
            className="sp-btn-trust-override"
            disabled={busy}
            onClick={onTrustOverride}
          >
            {busy ? 'Installing…' : overrideLabel}
          </button>
        </div>
      )}
    </div>
  )
}

export function UploadSkillView({ onBack, onUploaded }: UploadSkillViewProps) {
  const [dragging, setDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanResults, setScanResults] = useState<SecurityScanSummary[] | null>(null)
  const [blockedReport, setBlockedReport] = useState<SkillSecurityScan | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function acceptFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const valid: File[] = []
    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase()
      if (!lower.endsWith('.md') && !lower.endsWith('.zip') && !lower.endsWith('.skill')) {
        setError(`Unsupported file '${file.name}'. Only .md, .zip, and .skill files are accepted.`)
        return
      }
      valid.push(file)
    }
    setError('')
    setBlockedReport(null)
    setScanResults(null)
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}`))
      const merged = [...prev]
      for (const item of valid) {
        if (!seen.has(`${item.name}-${item.size}`)) {
          merged.push(item)
        }
      }
      return merged
    })
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index))
    setError('')
    setBlockedReport(null)
  }

  async function handleUpload(trustOverride = false) {
    if (selectedFiles.length === 0) return
    setScanning(true)
    setError('')
    if (!trustOverride) {
      setBlockedReport(null)
    }
    setScanResults(null)
    try {
      const form = new FormData()
      for (const file of selectedFiles) {
        form.append('files', file)
      }
      if (trustOverride) {
        form.append('trust_override', 'true')
      }
      const res = await fetch('/settings/personal-skills/upload', {
        method: 'POST',
        body: form,
      })
      const payload = (await res.json().catch(() => ({}))) as {
        detail?: string
        created?: PersonalSkill[]
        security_scans?: SecurityScanSummary[]
        scan_report?: SkillSecurityScan
      }
      if (!res.ok) {
        if (payload.scan_report) {
          setBlockedReport(payload.scan_report)
        }
        throw new Error(payload.detail || 'Upload failed SkillSpector security or YAML validation.')
      }
      const scans = payload.security_scans ?? []
      setScanResults(scans)
      const created = payload.created ?? []
      onUploaded(created, scans)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="sp-upload-view">
      <button type="button" className="sp-subback-btn" onClick={onBack}>
        <Icon name="chevronLeft" size={15} />
        <span>Your skills</span>
      </button>

      <div className="sp-upload-header">
        <h3>Upload a skill</h3>
        <p>
          Add a personal skill to your workspace. An automated NVIDIA SkillSpector security scan
          runs when you upload.
        </p>
      </div>

      <div className="sp-field">
        <span className="sp-label">Skill file</span>
        <div
          className={`sp-dropzone${dragging ? ' dragging' : ''}${selectedFiles.length ? ' has-file' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            acceptFiles(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".md,.zip,.skill"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              acceptFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Icon name="upload" size={24} />
          <p>Drag and drop skill files here, or browse — you can add several at once</p>
        </div>

        <ul className="sp-upload-rules">
          <li>.md file must contain skill name and description formatted in YAML</li>
          <li>.zip or .skill file must include a SKILL.md file</li>
        </ul>
      </div>

      {selectedFiles.length > 0 && (
        <div className="sp-upload-file-list">
          {selectedFiles.map((file, idx) => (
            <div key={`${file.name}-${file.size}`} className="sp-upload-file-chip">
              <Icon name="fileText" size={14} />
              <span className="sp-upload-file-name">{file.name}</span>
              <span className="sp-upload-file-size">
                {file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`}
              </span>
              <button
                type="button"
                className="sp-chip-remove"
                onClick={() => removeFile(idx)}
                aria-label={`Remove ${file.name}`}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="sp-scan-row">
        <Icon
          name={scanResults ? 'checkCircle' : error || blockedReport ? 'alertTriangle' : 'shield'}
          size={15}
        />
        <span className="sp-scan-title">NVIDIA SkillSpector security scan</span>
        <span className="sp-scan-meta">
          {scanning
            ? 'Scanning with SkillSpector… (10s max)'
            : blockedReport
            ? `Blocked (${blockedReport.recommendation})`
            : scanResults
            ? `Passed (${scanResults.length} file${scanResults.length === 1 ? '' : 's'})`
            : 'Runs automatically on upload (10s max)'}
        </span>
      </div>

      {blockedReport ? (
        <SkillSecurityReportCard
          report={blockedReport}
          busy={scanning}
          onTrustOverride={() => void handleUpload(true)}
        />
      ) : (
        error && (
          <div className="sp-inline-alert sp-inline-alert-error" role="alert">
            <Icon name="alertTriangle" size={15} />
            <span>{error}</span>
          </div>
        )
      )}

      <div className="sp-upload-actions">
        <button
          type="button"
          className="sp-btn-white"
          disabled={selectedFiles.length === 0 || scanning}
          onClick={() => void handleUpload()}
        >
          {scanning ? 'Scanning & uploading…' : 'Upload'}
        </button>
        <button type="button" className="sp-btn-ghost" onClick={onBack} disabled={scanning}>
          Cancel
        </button>
        {selectedFiles.length === 0 && (
          <span className="sp-upload-helper">Choose a file to continue.</span>
        )}
      </div>
    </div>
  )
}

type SkillEditorModalProps = {
  initialSkill?: PersonalSkill | null
  onClose: () => void
  onSaved: (skill: PersonalSkill, isEdit: boolean) => void
}

export function SkillEditorModal({ initialSkill, onClose, onSaved }: SkillEditorModalProps) {
  const isEdit = Boolean(initialSkill)
  const [name, setName] = useState(initialSkill?.name ?? '')
  const [description, setDescription] = useState(initialSkill?.description ?? '')
  const [prompt, setPrompt] = useState(initialSkill?.prompt ?? '')
  const [files, setFiles] = useState<PersonalSkillFile[]>(initialSkill?.files ?? [])
  const [isDraft, setIsDraft] = useState(initialSkill?.is_draft ?? false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [blockedReport, setBlockedReport] = useState<SkillSecurityScan | null>(null)
  const refInputRef = useRef<HTMLInputElement>(null)

  const lineCount = Math.max(8, prompt.split('\n').length)

  async function handleAttachReferenceFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const next: PersonalSkillFile[] = []
    for (const f of Array.from(fileList).slice(0, 10 - files.length)) {
      if (f.size > 200_000) {
        setError(`Reference file '${f.name}' must be 200 KB or smaller.`)
        return
      }
      const text = await f.text()
      next.push({ filename: f.name, content: text })
    }
    setError('')
    setBlockedReport(null)
    setFiles((prev) => [...prev, ...next])
  }

  async function handleSubmit(trustOverride = false) {
    if (!name.trim()) {
      setError('Skill name is required.')
      return
    }
    setSaving(true)
    setError('')
    if (!trustOverride) {
      setBlockedReport(null)
    }
    try {
      const endpoint = initialSkill
        ? `/settings/personal-skills/${encodeURIComponent(initialSkill.id)}`
        : '/settings/personal-skills'
      const method = initialSkill ? 'PATCH' : 'POST'
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          prompt,
          is_draft: isDraft,
          is_enabled: isDraft ? false : true,
          files,
          trust_override: trustOverride,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as PersonalSkill & {
        detail?: string
        scan_report?: SkillSecurityScan
      }
      if (!res.ok) {
        if (data.scan_report) {
          setBlockedReport(data.scan_report)
        }
        throw new Error(data.detail || 'Could not save skill.')
      }
      onSaved(data, isEdit)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save skill.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModernDialog
      isOpen={true}
      onClose={onClose}
      ariaLabelledBy="skill-editor-title"
      className="sp-modal sp-modal-skill-editor"
    >
        <div className="sp-modal-header">
          <h3 id="skill-editor-title">{isEdit ? 'Edit skill' : 'Create a skill'}</h3>
          <button type="button" className="sp-modal-close icon-btn" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="sp-modal-body">
          <div className="sp-field">
            <label className="sp-label" htmlFor="skill-name-input">Skill name</label>
            <input
              id="skill-name-input"
              className="sp-input"
              placeholder="Weekly status report"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="sp-field">
            <label className="sp-label" htmlFor="skill-desc-input">Description</label>
            <textarea
              id="skill-desc-input"
              className="sp-textarea"
              rows={2}
              placeholder="Generate weekly status reports from recent work. Use when asked for updates or progress summaries."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="sp-code-editor-box">
            <div className="sp-code-editor-topbar">
              <div className="sp-code-editor-files">
                {files.map((f, idx) => (
                  <span key={`${f.filename}-${idx}`} className="sp-ref-file-chip">
                    <Icon name="fileText" size={12} />
                    <span>{f.filename}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`Remove ${f.filename}`}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="sp-code-editor-actions">
                <input
                  ref={refInputRef}
                  type="file"
                  accept=".md,.txt,.json,.yaml,.yml,.py,.ts"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void handleAttachReferenceFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="sp-add-file-btn"
                  onClick={() => refInputRef.current?.click()}
                >
                  <Icon name="plus" size={13} />
                  <span>Add file</span>
                </button>
                <button
                  type="button"
                  className="icon-btn sp-copy-prompt-btn"
                  title="Copy skill prompt"
                  onClick={() => {
                    void navigator.clipboard.writeText(prompt).catch(() => {})
                    setCopiedPrompt(true)
                    window.setTimeout(() => setCopiedPrompt(false), 1400)
                  }}
                >
                  <Icon name={copiedPrompt ? 'check' : 'copy'} size={14} />
                </button>
              </div>
            </div>

            <div className="sp-code-editor-body">
              <div className="sp-code-gutter" aria-hidden="true">
                {Array.from({ length: lineCount }, (_, idx) => (
                  <span key={idx + 1}>{idx + 1}</span>
                ))}
              </div>
              <textarea
                className="sp-code-textarea"
                aria-label="Skill instructions"
                placeholder="Summarize my recent work in three sections: wins, blockers, and next steps. Keep the tone professional but not stiff..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          </div>

          <div className="sp-scan-row">
            <Icon name={blockedReport ? 'alertTriangle' : 'shield'} size={15} />
            <span className="sp-scan-title">NVIDIA SkillSpector security check</span>
            <span className="sp-scan-meta">
              {saving
                ? 'Scanning skill content…'
                : blockedReport
                ? `Blocked (${blockedReport.recommendation})`
                : 'Runs automatically on save'}
            </span>
          </div>

          {blockedReport ? (
            <SkillSecurityReportCard
              report={blockedReport}
              busy={saving}
              overrideLabel="Trust & save anyway"
              onTrustOverride={() => void handleSubmit(true)}
            />
          ) : (
            error && <p className="sp-error">{error}</p>
          )}
        </div>

        <div className="sp-modal-footer sp-modal-footer-split">
          <button
            type="button"
            className={`sp-draft-pill-btn${isDraft ? ' active' : ''}`}
            onClick={() => setIsDraft((prev) => !prev)}
            title="Save as draft without enabling in active chats"
          >
            {isDraft ? 'Draft: On' : 'Draft'}
          </button>
          <div className="sp-modal-footer-right">
            <button type="button" className="sp-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="sp-btn-white"
              disabled={saving || !name.trim()}
              onClick={() => void handleSubmit()}
            >
              {saving ? 'Scanning & saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
    </ModernDialog>
  )
}
