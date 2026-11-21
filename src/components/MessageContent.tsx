import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from './Icon'
import { GenerativeUIWidget } from './GenerativeUIWidget'
import { A2UICanvas } from './A2UICanvas'
import './MessageContent.css'

export const MessageContent = memo(function MessageContent({
  content,
  onA2UIAction,
  suppressGenerativeUI = false,
}: {
  content: string
  onA2UIAction?: (actionId: string, payload?: Record<string, unknown>) => void
  suppressGenerativeUI?: boolean
}) {
  return (
    <div className="message-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const lang = (match ? match[1] : '').toLowerCase()
            const isCodeBlock = Boolean(match) || String(children).includes('\n')
            const codeString = String(children).replace(/\n$/, '')

            const isSvgOrDiagram = lang === 'svg' || codeString.includes('<svg')
            const isGenerative =
              lang === 'generative_ui' ||
              lang === 'generative-ui' ||
              isSvgOrDiagram ||
              (lang === 'html' &&
                (codeString.includes('class=') ||
                  codeString.includes('<button') ||
                  codeString.includes('<div') ||
                  codeString.includes('<canvas')))

            if (isGenerative) {
              if (suppressGenerativeUI) return null
              return (
                <GenerativeUIWidget
                  title={isSvgOrDiagram ? 'Visual Diagram' : 'Interactive Generative UI'}
                  html={codeString}
                  description={isSvgOrDiagram ? 'Rendered visual model' : 'Live interactive generative component'}
                />
              )
            }

            if (lang === 'a2ui') {
              try {
                const parsed = JSON.parse(codeString)
                return (
                  <A2UICanvas
                    canvas={{
                      canvas_id: 'inline-a2ui',
                      title: parsed.title || 'A2UI Component Catalog',
                      spec: parsed,
                    }}
                    onAction={onA2UIAction}
                  />
                )
              } catch {
                // fallback to regular code block
              }
            }

            if (isCodeBlock) {
              return (
                <div className="code-block">
                  <div className="code-header">
                    <span className="code-language">{match ? match[1] : 'code'}</span>
                    <button
                      className="code-copy-btn"
                      onClick={() => void navigator.clipboard.writeText(codeString)}
                      title="Copy code"
                    >
                      <Icon name="copy" size={13} />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre>
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              )
            }
            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            )
          },
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
