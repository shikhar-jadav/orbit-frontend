export function getFileCategory(filePath: string = ''): {
  category: 'document' | 'code' | 'spreadsheet' | 'presentation' | 'word' | 'pdf' | 'video' | 'audio' | 'image'
  label: string
  ext: string
  color: string
} {
  const clean = filePath.split(/[?#]/)[0]
  const ext = (clean.split('.').pop() || '').toLowerCase()

  if (['md', 'markdown', 'txt', 'rtf'].includes(ext)) {
    return { category: 'document', label: 'Document', ext: ext.toUpperCase(), color: '#60a5fa' }
  }
  if (['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'css', 'html', 'sh', 'bash', 'sql', 'rs', 'go', 'java', 'c', 'cpp', 'h'].includes(ext)) {
    const langMap: Record<string, string> = {
      py: 'Python', js: 'JavaScript', ts: 'TypeScript', tsx: 'React TS', jsx: 'React JS',
      json: 'JSON', yaml: 'YAML', yml: 'YAML', css: 'CSS', html: 'HTML', sh: 'Shell', sql: 'SQL',
      rs: 'Rust', go: 'Go', java: 'Java', cpp: 'C++', c: 'C'
    }
    return { category: 'code', label: 'Code', ext: langMap[ext] || ext.toUpperCase(), color: '#a78bfa' }
  }
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
    return { category: 'spreadsheet', label: 'Spreadsheet', ext: ext.toUpperCase(), color: '#34d399' }
  }
  if (['pptx', 'ppt', 'key'].includes(ext)) {
    return { category: 'presentation', label: 'Presentation', ext: ext.toUpperCase(), color: '#fb923c' }
  }
  if (['docx', 'doc'].includes(ext)) {
    return { category: 'word', label: 'Document', ext: ext.toUpperCase(), color: '#38bdf8' }
  }
  if (ext === 'pdf') {
    return { category: 'pdf', label: 'PDF Document', ext: 'PDF', color: '#f87171' }
  }
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) {
    return { category: 'video', label: 'Video', ext: ext.toUpperCase(), color: '#c084fc' }
  }
  if (['mp3', 'wav', 'm4a', 'flac', 'aac'].includes(ext)) {
    return { category: 'audio', label: 'Audio', ext: ext.toUpperCase(), color: '#fbbf24' }
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return { category: 'image', label: 'Image', ext: ext.toUpperCase(), color: '#22d3ee' }
  }

  return { category: 'document', label: 'File', ext: ext ? ext.toUpperCase() : 'DOC', color: '#94a3b8' }
}

export function formatFriendlyTitle(filePath: string = '', fallbackTitle?: string): string {
  if (fallbackTitle && fallbackTitle.trim()) {
    return fallbackTitle.trim()
  }
  const base = filePath.split(/[/\\]/).pop() || filePath
  const nameWithoutExt = base.replace(/\.[^/.]+$/, '')
  if (!nameWithoutExt) return 'Document'

  // Format "essay" -> "Essay", "my_summary_doc" -> "My Summary Doc"
  return nameWithoutExt
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
