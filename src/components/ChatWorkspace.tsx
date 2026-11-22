import { useEffect } from 'react'
import type { Dispatch, FormEvent, RefObject, SetStateAction } from 'react'
import { AttachmentChips } from './AttachmentChips'
import { Icon } from './Icon'
import { Tooltip } from './Tooltip'
import { MessageContent } from './MessageContent'
import { A2UICanvas } from './A2UICanvas'
import { GenerativeUIWidget } from './GenerativeUIWidget'
import { ArtifactWidget } from './ArtifactWidget'
import { ExecutionWidget } from './ExecutionWidget'
import { WorkspaceFileWidget } from './WorkspaceFileWidget'
import { HumanInTheLoopCard } from './HumanInTheLoopCard'
import { extractRemainingMessageText } from './messagePartUtils'
import { RoutineSetupCard, ProactiveAlertCard } from './ProactiveChatCards'
import type { Message, Thread, ToolEvent, HITLCardRequest, HITLSubmission } from './types'
import type { CanvasItem } from './UniversalCanvas'
import './ChatWorkspace.css'

type ChatWorkspaceProps = {
  loadingThread: boolean
  messages: Message[]
  hasOlderMessages: boolean
  loadingOlderMessages: boolean
  loadOlderMessages: () => void
  scrollRef: RefObject<HTMLDivElement | null>
  editingMessageId: string | number | null
  setEditingMessageId: Dispatch<SetStateAction<string | number | null>>
  editDraft: string
  setEditDraft: Dispatch<SetStateAction<string>>
  sending: boolean
  beginEdit: (message: Message) => void
  regenerateResponse: (message: Message, editedContent?: string) => Promise<void>
  selectTurnVersion: (message: Message, version: number) => Promise<void>
  copiedMessageId: string | number | null
  copyMessage: (message: Message) => Promise<void>
  messageMenuId: string | number | null
  setMessageMenuId: Dispatch<SetStateAction<string | number | null>>
  branchFromMessage: (message: Message) => Promise<void>
  navigateThread: (threadId: string) => void
  currentThread: Thread | undefined
  attachments: File[]
  removeAttachment: (key: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  attachmentInputRef: RefObject<HTMLInputElement | null>
  input: string
  setInput: Dispatch<SetStateAction<string>>
  sendMessage: (event?: FormEvent) => Promise<void>
  stopResponse: () => void
  insertPrompt: (prompt: string) => void
  onA2UIAction?: (actionId: string, payload?: Record<string, unknown>) => void
  onOpenCanvas?: (item: CanvasItem) => void
  sendShortcut?: 'enter' | 'ctrl_enter'
  hitlRequest?: HITLCardRequest | null
  onHITLSubmit?: (submission: HITLSubmission) => void
  onHITLSkip?: () => void
  onHITLDismiss?: () => void
  onOpenRoutinesModal?: () => void
}

function formatToolName(name: string) {
  return name.replaceAll('_', ' ')
}

function getToolLabel(
  name: string,
  status?: 'running' | 'done',
  args?: Record<string, unknown>,
) {
  const isRunning = status === 'running'
  if (name === 'manage_routine') {
    const action = String(args?.action || 'schedule')
    if (action === 'schedule') return isRunning ? 'Scheduling reminder...' : 'Scheduled reminder'
    if (action === 'create') return isRunning ? 'Creating routine...' : 'Created routine'
    if (action === 'list') return isRunning ? 'Checking routines...' : 'Checked routines'
    if (action === 'pause') return isRunning ? 'Pausing routine...' : 'Paused routine'
    if (action === 'resume') return isRunning ? 'Resuming routine...' : 'Resumed routine'
    if (action === 'delete') return isRunning ? 'Deleting routine...' : 'Deleted routine'
    return isRunning ? 'Managing routine...' : 'Managed routine'
  }
  if (name === 'workspace_files') {
    const action = String(args?.action || 'workspace')
    if (action === 'list') return isRunning ? 'Listing workspace files...' : 'Listed workspace files'
    if (action === 'read') return isRunning ? 'Reading workspace file...' : 'Read a workspace file'
    return isRunning ? 'Creating or updating workspace file...' : 'Created or updated a workspace file'
  }
  const runningLabels: Record<string, string> = {
    calculate: 'Calculating result...',
    get_current_time: 'Checking time...',
    get_weather: 'Checking weather...',
    render_a2ui_canvas: 'Creating canvas...',
    render_generative_ui: 'Generating visual widget...',
    write_workspace_file: 'Writing workspace file...',
    edit_workspace_file: 'Editing workspace file...',
    run_workspace_code: 'Executing workspace code...',
    create_artifact: 'Generating artifact deliverable...',
    search_available_tools: 'Searching available tools...',
    ask_question: 'Asking question...',
  }
  const doneLabels: Record<string, string> = {
    calculate: 'Calculated a result',
    get_current_time: 'Checked the time',
    get_weather: 'Checked the weather',
    render_a2ui_canvas: 'Created a canvas',
    render_generative_ui: 'Created a visual',
    write_workspace_file: 'Wrote a workspace file',
    edit_workspace_file: 'Edited a workspace file',
    run_workspace_code: 'Executed workspace code',
    create_artifact: 'Generated an artifact deliverable',
    search_available_tools: 'Searched available tools',
    ask_question: 'Asked question',
  }
  if (isRunning && runningLabels[name]) return runningLabels[name]
  if (!isRunning && doneLabels[name]) return doneLabels[name]

  const normalized = name.toLowerCase()
  if (normalized.includes('notion')) {
    return isRunning ? 'Searching Notion...' : 'Searched Notion'
  }
  if (normalized.includes('langchain')) {
    return isRunning ? 'Searching LangChain...' : 'Searched LangChain'
  }
  if (normalized.includes('github')) {
    return isRunning ? 'Querying GitHub...' : 'Queried GitHub'
  }
  if (normalized.includes('slack')) {
    return isRunning ? 'Querying Slack...' : 'Queried Slack'
  }
  if (normalized.includes('search') && normalized.includes('web')) {
    return isRunning ? 'Searching the web...' : 'Searched the web'
  }
  if (normalized.includes('search')) {
    return isRunning ? 'Searching workspace...' : 'Searched workspace'
  }
  if (normalized.includes('command') || normalized.includes('terminal') || normalized.includes('exec')) {
    return isRunning ? 'Running a command...' : 'Ran a command'
  }
  if (normalized.includes('read') || normalized.includes('open')) {
    return isRunning ? 'Reading a file...' : 'Read a file'
  }
  if (normalized.includes('write') || normalized.includes('create')) {
    return isRunning ? 'Creating a file...' : 'Created a file'
  }
  if (normalized.includes('list')) {
    return isRunning ? 'Listing files...' : 'Listed files'
  }
  return formatToolName(name).replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getToolSubject(tool: ToolEvent) {
  const subjectKeys = [
    'name',
    'file_path',
    'target_file',
    'query',
    'search_query',
    'expression',
    'location',
    'command',
    'path',
    'filename',
    'url',
    'title',
    'action_prompt',
  ]
  const subject = subjectKeys
    .map((key) => tool.args?.[key])
    .find((value) => typeof value === 'string' && value.trim())
  return typeof subject === 'string' ? subject : ''
}

function formatToolOutput(output: string) {
  try {
    return JSON.stringify(JSON.parse(output), null, 2)
  } catch {
    return output
  }
}

function parseHistoricalProactiveCard(content: string, createdAt?: string) {
  if (!content) return null
  const trimmed = content.trim()

  const isOldHeader = trimmed.startsWith('### ⏰') || trimmed.startsWith('### ⚡')
  const isNewHeader = trimmed.startsWith('⏰ **') || trimmed.startsWith('⚡ **')

  if (!isOldHeader && !isNewHeader) return null

  const isReminder = trimmed.includes('⏰')
  let title = 'Reminder'
  let body = ''

  if (isOldHeader) {
    const lines = trimmed.split('\n')
    const firstLine = lines[0]
    const titleMatch = firstLine.match(/###\s*(?:⏰ Reminder|⚡ Proactive Routine):\s*(.+)/)
    if (titleMatch) title = titleMatch[1].trim()

    const remainingLines = lines.slice(1).filter(
      (l) => !l.trim().startsWith('*Executed in') && !l.trim().startsWith('*Triggered at'),
    )
    body = remainingLines.join('\n').trim()
    body = body.replace(/Reminder \/ Routine '[^']+' triggered successfully\./g, '').trim()
    if (!body) body = title
  } else {
    const match = trimmed.match(/^[⏰⚡]\s*\*\*([^*]+)\*\*\s*([\s\S]*)/)
    if (match) {
      title = match[1].trim()
      body = match[2].trim()
    }
  }

  let formattedTime = ''
  if (createdAt) {
    try {
      formattedTime = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {}
  }

  return {
    routine_id: '',
    routine_name: title,
    content: body || title,
    one_shot: isReminder,
    trigger_type: isReminder ? 'timer' : 'cron',
    timestamp: formattedTime,
  }
}

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const {
    loadingThread,
    messages,
    hasOlderMessages,
    loadingOlderMessages,
    loadOlderMessages,
    scrollRef,
    editingMessageId,
    setEditingMessageId,
    editDraft,
    setEditDraft,
    sending,
    beginEdit,
    regenerateResponse,
    selectTurnVersion,
    copiedMessageId,
    copyMessage,
    messageMenuId,
    setMessageMenuId,
    branchFromMessage,
    navigateThread,
    currentThread,
    attachments,
    removeAttachment,
    inputRef,
    attachmentInputRef,
    input,
    setInput,
    sendMessage,
    stopResponse,
    insertPrompt,
    sendShortcut = 'enter',
    hitlRequest,
    onHITLSubmit,
    onHITLSkip,
    onHITLDismiss,
  } = props

  // Keep the composer compact after send/clear and grow it with the current draft.
  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [input, inputRef])

  const shouldSendOnKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return false
    if (sendShortcut === 'ctrl_enter') {
      return e.ctrlKey || e.metaKey
    }
    return !e.shiftKey
  }

  const renderToolWidget = (tool: ToolEvent) => {
    if (tool.status !== 'done' || !tool.output) return null
    if (tool.name === 'render_a2ui_canvas') {
      try {
        const p = JSON.parse(tool.output)
        return (
          <div key={`canvas-${tool.id}`} className="inline-generative-section">
            <A2UICanvas
              canvas={{
                canvas_id: 'tool-' + tool.id,
                title: p.title || 'A2UI Component',
                spec: p.spec || p,
              }}
              onAction={props.onA2UIAction}
            />
          </div>
        )
      } catch {
        return null
      }
    }
    if (tool.name === 'render_generative_ui') {
      try {
        const p = JSON.parse(tool.output)
        return (
          <div key={`genui-${tool.id}`} className="inline-generative-section">
            <GenerativeUIWidget
              title={p.title || 'Generative UI'}
              html={p.html}
              description={p.description}
            />
          </div>
        )
      } catch {
        return null
      }
    }
    if (tool.name === 'create_artifact') {
      try {
        const p = JSON.parse(tool.output)
        return (
          <div key={`artifact-${tool.id}`} className="inline-generative-section">
            <ArtifactWidget
              artifact={p}
              onRun={(code) => {
                insertPrompt(`Run this code in the workspace:\n\`\`\`python\n${code}\n\`\`\``)
              }}
              onOpenCanvas={props.onOpenCanvas}
            />
          </div>
        )
      } catch {
        return null
      }
    }
    if (tool.name === 'run_workspace_code') {
      try {
        const p = JSON.parse(tool.output)
        return (
          <div key={`code-${tool.id}`} className="inline-generative-section">
            <ExecutionWidget execution={p} />
          </div>
        )
      } catch {
        return null
      }
    }
    const workspaceAction = tool.name === 'workspace_files'
      ? String(tool.args?.action || '')
      : ''
    if (
      ['create', 'replace', 'append', 'edit'].includes(workspaceAction) ||
      tool.name === 'create_file' ||
      tool.name === 'write_workspace_file' ||
      tool.name === 'edit_workspace_file'
    ) {
      try {
        const p = JSON.parse(tool.output)
        if (p.error) {
          return (
            <div key={`file-${tool.id}`} className="inline-generative-section" role="alert">
              {p.error}
            </div>
          )
        }
        return (
          <div key={`file-${tool.id}`} className="inline-generative-section">
            <WorkspaceFileWidget data={p} onOpenCanvas={props.onOpenCanvas} />
          </div>
        )
      } catch {
        return null
      }
    }
    if (tool.name === 'manage_routine') {
      const output = String(tool.output || '')
      if (
        output.includes('Reminder scheduled:') ||
        output.includes('Recurring routine created:') ||
        tool.args?.action === 'schedule' ||
        tool.args?.action === 'create'
      ) {
        return (
          <div key={`routine-${tool.id}`} className="inline-generative-section">
            <RoutineSetupCard
              toolOutput={output}
              toolArgs={tool.args}
              onOpenModal={props.onOpenRoutinesModal}
            />
          </div>
        )
      }
    }
    return null
  }

  const renderToolStep = (tool: ToolEvent) => {
    const label = getToolLabel(tool.name, tool.status, tool.args)
    const subject = getToolSubject(tool)
    const visibleArgs = Object.fromEntries(
      Object.entries(tool.args || {}).filter(
        ([key]) => !/html|spec|content/i.test(key),
      ),
    )
    const safeOutput =
      tool.name === 'render_generative_ui'
        ? 'Visual displayed below.'
        : tool.name === 'render_a2ui_canvas'
          ? 'Canvas displayed below.'
          : tool.name === 'create_artifact'
            ? 'Artifact deliverable displayed below.'
            : tool.name === 'manage_routine' &&
              (String(tool.output || '').includes('Reminder scheduled:') ||
                String(tool.output || '').includes('Recurring routine created:') ||
                tool.args?.action === 'schedule' ||
                tool.args?.action === 'create')
              ? 'Schedule confirmed below.'
            : tool.name === 'workspace_files' &&
                ['create', 'replace', 'append', 'edit'].includes(String(tool.args?.action || ''))
              ? 'Workspace file updated.'
            : tool.output
    const hasDetails = Object.keys(visibleArgs).length > 0 || Boolean(safeOutput)

    if (tool.status === 'running') {
      const isWaitingApproval = Boolean(
        hitlRequest &&
          (hitlRequest.tool_name === tool.name ||
            hitlRequest.id.includes(tool.id) ||
            hitlRequest.is_approval)
      )
      return (
        <div className={`tool-step-live tool-step-running ${isWaitingApproval ? 'waiting-approval' : ''}`} key={tool.id}>
          <span className={isWaitingApproval ? 'tool-activity-paused' : 'tool-activity-running'} aria-label={isWaitingApproval ? 'Waiting for approval' : 'Running'} />
          <span className="tool-activity-step-copy">
            <span className="tool-activity-step-title">{label}</span>
            {subject && <span className="tool-activity-subject">{subject}</span>}
            {isWaitingApproval && (
              <span className="tool-approval-pill">Needs approval</span>
            )}
          </span>
        </div>
      )
    }

    return (
      <details className="tool-step-live tool-step-done" key={tool.id}>
        <summary>
          <svg
            className="tool-activity-check"
            aria-label="Complete"
            role="img"
            viewBox="0 0 20 20"
            fill="none"
          >
            <path d="m5 10 3.2 3.2L15 6.5" />
          </svg>
          <span className="tool-activity-step-copy">
            <span className="tool-activity-step-title">{label}</span>
            {subject && <span className="tool-activity-subject">{subject}</span>}
          </span>
          {hasDetails && (
            <svg
              className="tool-activity-chevron"
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          )}
        </summary>
        {hasDetails && (
          <div className="tool-activity-detail">
            {Object.keys(visibleArgs).length > 0 && (
              <pre>{JSON.stringify(visibleArgs, null, 2)}</pre>
            )}
            {safeOutput && <pre>{formatToolOutput(safeOutput)}</pre>}
          </div>
        )}
      </details>
    )
  }

  return (
          <div className={`chat-layout ${!loadingThread && !messages.length ? 'empty-chat' : ''}`}>
            <div className="chat-scroll" ref={scrollRef}>
              {loadingThread ? (
                <div className="loading-history" role="status" aria-live="polite" aria-label="Loading conversation">
                  <span className="loading-history-announcement">Loading conversation</span>
                  <div className="loading-history-stack" aria-hidden="true">
                    <div className="loading-history-user">
                      <span className="loading-history-line user-line-primary" />
                      <span className="loading-history-line user-line-secondary" />
                    </div>
                    <div className="loading-history-assistant">
                      <span className="loading-history-avatar" />
                      <div className="loading-history-copy">
                        <span className="loading-history-line assistant-line-wide" />
                        <span className="loading-history-line assistant-line-full" />
                        <span className="loading-history-line assistant-line-medium" />
                        <span className="loading-history-line assistant-line-short" />
                      </div>
                    </div>
                    <div className="loading-history-user loading-history-user-short">
                      <span className="loading-history-line user-line-primary" />
                    </div>
                    <div className="loading-history-assistant">
                      <span className="loading-history-avatar" />
                      <div className="loading-history-copy">
                        <span className="loading-history-line assistant-line-full" />
                        <span className="loading-history-line assistant-line-medium" />
                        <span className="loading-history-line assistant-line-wide" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : messages.length ? (
                <div className="messages-inner">
                  {hasOlderMessages && (
                    <div className="older-messages-control">
                      <button
                        type="button"
                        onClick={loadOlderMessages}
                        disabled={loadingOlderMessages}
                      >
                        {loadingOlderMessages ? 'Loading earlier messages…' : 'Load older messages'}
                      </button>
                    </div>
                  )}
                  {messages.map((message) => (
                    <div
                      className={`message-entry ${message.role === 'user' ? 'user-entry' : 'assistant-entry'}`}
                      key={message.id}
                    >
                      {message.role === 'user' ? (
                      <div
                        className={`user-message-wrapper ${
                          editingMessageId === message.id ? 'editing' : ''
                        }`}
                      >
                          {editingMessageId === message.id ? (
                            <form
                              className="user-edit-form"
                              onSubmit={(event) => {
                                event.preventDefault()
                                void regenerateResponse(message, editDraft)
                              }}
                            >
                              <textarea
                                aria-label="Edit your message"
                                autoFocus
                                value={editDraft}
                                onChange={(event) => setEditDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    setEditingMessageId(null)
                                    setEditDraft('')
                                  }
                                }}
                              />
                              <div className="user-edit-actions">
                                <button
                                  type="button"
                                  className="edit-cancel-btn"
                                  onClick={() => {
                                    setEditingMessageId(null)
                                    setEditDraft('')
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="edit-send-btn"
                                  disabled={sending || !editDraft.trim()}
                                >
                                  Send
                                </button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <div className="user-bubble">
                                {message.content}
                                <AttachmentChips
                                  files={(message.attachments || []).map((attachment) => ({
                                    key: attachment.attachment_id || attachment.filename,
                                    filename: attachment.filename,
                                    size: attachment.size_bytes,
                                  }))}
                                />
                              </div>
                              <div className="user-actions">
                                {(message.variants?.length ?? message.version_count ?? 1) > 1 && (
                                  <div className="response-version-nav" aria-label="Prompt versions">
                                    <button
                                      className="version-arrow"
                                      title="Previous prompt"
                                      aria-label="Previous prompt"
                                      disabled={sending || (message.selected_version ?? 1) <= 1}
                                      onClick={() =>
                                        void selectTurnVersion(
                                          message,
                                          (message.selected_version ?? 1) - 1,
                                        )
                                      }
                                    >
                                      <Icon name="chevronLeft" size={14} />
                                    </button>
                                    <span>
                                      {message.selected_version ?? 1} /{' '}
                                      {message.variants?.length ?? message.version_count}
                                    </span>
                                    <button
                                      className="version-arrow"
                                      title="Next prompt"
                                      aria-label="Next prompt"
                                      disabled={
                                        sending ||
                                        (message.selected_version ?? 1) >=
                                          (message.variants?.length ?? message.version_count ?? 1)
                                      }
                                      onClick={() =>
                                        void selectTurnVersion(
                                          message,
                                          (message.selected_version ?? 1) + 1,
                                        )
                                      }
                                    >
                                      <Icon name="chevronRight" size={14} />
                                    </button>
                                  </div>
                                )}
                                <button
                                  className="message-icon-btn"
                                  onClick={() => beginEdit(message)}
                                  title="Edit message"
                                  aria-label="Edit message"
                                  disabled={sending}
                                >
                                  <Icon name="edit" size={14} />
                                </button>
                                <button
                                  className="message-icon-btn"
                                  onClick={() => void copyMessage(message)}
                                  title="Copy message"
                                  aria-label="Copy message"
                                >
                                  <Icon
                                    name={copiedMessageId === message.id ? 'check' : 'copy'}
                                    size={14}
                                  />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="assistant-message-wrapper">
                          <div className="assistant-content">
                            {message.pending &&
                            !message.content &&
                            !message.tools?.length &&
                            !message.parts?.length ? (
                              <div className="message-loading-skeleton" aria-label="Thinking">
                                <span />
                                <span />
                                <span />
                              </div>
                            ) : null}

                            {(() => {
                              const hasGenerativeUI = Boolean(
                                message.tools?.some(
                                  (tool) =>
                                    tool.name === 'render_generative_ui' &&
                                    tool.status === 'done' &&
                                    Boolean(tool.output),
                                ) ||
                                message.parts?.some(
                                  (part) =>
                                    part.type === 'tool' &&
                                    part.tool.name === 'render_generative_ui' &&
                                    part.tool.status === 'done' &&
                                    Boolean(part.tool.output),
                                ),
                              )

                              if (message.parts && message.parts.length > 0) {
                                const remainingText = extractRemainingMessageText(
                                  message.content,
                                  message.parts,
                                )

                                return (
                                  <>
                                    {message.parts.map((part, index) => {
                                      if (part.type === 'text') {
                                        if (!part.text) return null
                                        return (
                                          <MessageContent
                                            key={`part-text-${index}`}
                                            content={part.text}
                                            onA2UIAction={props.onA2UIAction}
                                            suppressGenerativeUI={hasGenerativeUI}
                                          />
                                        )
                                      }
                                      if (part.type === 'tool') {
                                        return (
                                          <div
                                            key={`part-tool-${part.tool.id || index}`}
                                            className="tool-part-wrapper"
                                          >
                                            {renderToolStep(part.tool)}
                                            {renderToolWidget(part.tool)}
                                          </div>
                                        )
                                      }
                                      if (part.type === 'proactive_card') {
                                        return (
                                          <div
                                            key={`part-proactive-${index}`}
                                            className="proactive-card-part-wrapper"
                                          >
                                            <ProactiveAlertCard
                                              card={part.card}
                                              onOpenModal={props.onOpenRoutinesModal}
                                            />
                                          </div>
                                        )
                                      }
                                      return null
                                    })}
                                    {remainingText ? (
                                      <MessageContent
                                        content={remainingText}
                                        onA2UIAction={props.onA2UIAction}
                                        suppressGenerativeUI={hasGenerativeUI}
                                      />
                                    ) : null}
                                  </>
                                )
                              }

                              return (
                                <>
                                  {message.tools?.map((tool) => (
                                    <div key={`tool-${tool.id}`} className="tool-part-wrapper">
                                      {renderToolStep(tool)}
                                      {renderToolWidget(tool)}
                                    </div>
                                  ))}
                                  {message.content && (() => {
                                    const historicalCard = parseHistoricalProactiveCard(
                                      message.content,
                                      message.created_at,
                                    )
                                    if (historicalCard) {
                                      return (
                                        <div className="proactive-card-part-wrapper">
                                          <ProactiveAlertCard
                                            card={historicalCard}
                                            onOpenModal={props.onOpenRoutinesModal}
                                          />
                                        </div>
                                      )
                                    }
                                    return (
                                      <MessageContent
                                        content={message.content}
                                        onA2UIAction={props.onA2UIAction}
                                        suppressGenerativeUI={hasGenerativeUI}
                                      />
                                    )
                                  })()}
                                </>
                              )
                            })()}

                            {message.failed ? (
                              <div className="failed-note">Response interrupted or incomplete.</div>
                            ) : null}

                            {!message.pending &&
                              (message.content || message.parts?.some((p) => p.type === 'text')) && (
                              <div className="assistant-actions">
                                {(message.variants?.length ?? message.version_count ?? 1) > 1 && (
                                  <div className="response-version-nav" aria-label="Response versions">
                                    <button
                                      className="version-arrow"
                                      title="Previous response"
                                      aria-label="Previous response"
                                      disabled={sending || (message.selected_version ?? 1) <= 1}
                                      onClick={() =>
                                        void selectTurnVersion(
                                          message,
                                          (message.selected_version ?? 1) - 1,
                                        )
                                      }
                                    >
                                      <Icon name="chevronLeft" size={14} />
                                    </button>
                                    <span>
                                      {message.selected_version ?? 1} /{' '}
                                      {message.variants?.length ?? message.version_count}
                                    </span>
                                    <button
                                      className="version-arrow"
                                      title="Next response"
                                      aria-label="Next response"
                                      disabled={
                                        sending ||
                                        (message.selected_version ?? 1) >=
                                          (message.variants?.length ?? message.version_count ?? 1)
                                      }
                                      onClick={() =>
                                        void selectTurnVersion(
                                          message,
                                          (message.selected_version ?? 1) + 1,
                                        )
                                      }
                                    >
                                      <Icon name="chevronRight" size={14} />
                                    </button>
                                  </div>
                                )}
                                <button
                                  className="message-icon-btn"
                                  onClick={() => void copyMessage(message)}
                                  title="Copy response"
                                  aria-label="Copy response"
                                >
                                  <Icon
                                    name={copiedMessageId === message.id ? 'check' : 'copy'}
                                    size={14}
                                  />
                                </button>
                                <div className="assistant-menu-wrap">
                                  <button
                                    className="message-icon-btn"
                                    onClick={() =>
                                      setMessageMenuId((openId) =>
                                        openId === message.id ? null : message.id,
                                      )
                                    }
                                    title="More response actions"
                                    aria-label="More response actions"
                                    aria-expanded={messageMenuId === message.id}
                                    disabled={sending}
                                  >
                                    <Icon name="more" size={16} />
                                  </button>
                                  {messageMenuId === message.id && (
                                    <div className="message-action-menu" role="menu">
                                      <button
                                        role="menuitem"
                                        onClick={() => {
                                          const userMessage = messages.find(
                                            (item) =>
                                              item.role === 'user' &&
                                              Number(item.id) === Number(message.turn_id),
                                          )
                                          if (userMessage) void regenerateResponse(userMessage)
                                        }}
                                        disabled={sending}
                                      >
                                        <Icon name="refresh" size={15} />
                                        <span>Regenerate response</span>
                                      </button>
                                      <button
                                        role="menuitem"
                                        onClick={() => void branchFromMessage(message)}
                                        disabled={sending || message.turn_id === undefined}
                                      >
                                        <Icon name="branch" size={15} />
                                        <span>Branch in new chat</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {message.role === 'assistant' &&
                        currentThread?.branch_from_message_id !== null &&
                        currentThread?.branch_from_message_id !== undefined &&
                        Number(message.id) === Number(currentThread.branch_from_message_id) && (
                          <div className="branch-continuation">
                            <span className="branch-continuation-rule" />
                            <span className="branch-continuation-copy">
                              <Icon name="branch" size={14} />
                              Continued from{' '}
                              {currentThread.parent_thread_id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigateThread(currentThread.parent_thread_id as string)
                                  }
                                  title={`Open ${currentThread.parent_title || 'parent chat'}`}
                                >
                                  {currentThread.branch_label ||
                                    currentThread.parent_title ||
                                    'previous chat'}
                                </button>
                              ) : (
                                <span>
                                  {currentThread.branch_label ||
                                    currentThread.parent_title ||
                                    'previous chat'}
                                </span>
                              )}
                            </span>
                            <span className="branch-continuation-rule" />
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hero">
                  <div className="empty-heading">
                    <h1>Where knowledge begins</h1>
                    <p>Ask questions, generate interactive Generative UI widgets, or build declarative A2UI canvases.</p>
                  </div>
                  <div className="empty-composer-slot">
                    {hitlRequest && (
                      <HumanInTheLoopCard
                        request={hitlRequest}
                        onSubmit={(sub) => onHITLSubmit?.(sub)}
                        onSkip={onHITLSkip}
                        onDismiss={onHITLDismiss}
                      />
                    )}
                    <form className="composer-dock" onSubmit={(e) => void sendMessage(e)}>
                      <AttachmentChips
                        files={attachments.map((file) => ({
                          key: `${file.name}-${file.size}-${file.lastModified}`,
                          filename: file.name,
                          size: file.size,
                        }))}
                        onRemove={removeAttachment}
                        disabled={sending}
                      />
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value)
                          e.target.style.height = 'auto'
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`
                        }}
                        onKeyDown={(e) => {
                          if (shouldSendOnKeyDown(e)) {
                            e.preventDefault()
                            void sendMessage()
                          }
                        }}
                        placeholder={
                          hitlRequest
                            ? '+ Or reply directly...'
                            : sendShortcut === 'ctrl_enter'
                            ? 'Ask anything... (Ctrl+Enter to send)'
                            : 'Ask anything...'
                        }
                        rows={2}
                        disabled={sending && !hitlRequest}
                        aria-label="Ask anything"
                      />
                      <div className="composer-toolbar">
                        <Tooltip content="Attach files">
                          <button
                            type="button"
                            className="circle-action-btn attach-circle"
                            onClick={() => attachmentInputRef.current?.click()}
                            disabled={sending}
                            aria-label="Attach files"
                          >
                            <Icon name="plus" size={17} />
                          </button>
                        </Tooltip>
                        <div className="composer-right-actions">
                          {sending && !hitlRequest ? (
                            <Tooltip content="Stop generation">
                              <button
                                type="button"
                                className="circle-action-btn stop-circle"
                                onClick={stopResponse}
                                aria-label="Stop generation"
                              >
                                <Icon name="stop" size={12} />
                              </button>
                            </Tooltip>
                          ) : (
                            <Tooltip content="Send message">
                              <button
                                type="submit"
                                className={`circle-action-btn send-circle ${input.trim() || attachments.length ? 'active' : ''}`}
                                disabled={!input.trim() && !attachments.length}
                                aria-label="Send message"
                              >
                                <Icon name="arrowUp" size={16} />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>

            {(messages.length > 0 || loadingThread) && <div className="composer-container">
              {hitlRequest && (
                <HumanInTheLoopCard
                  request={hitlRequest}
                  onSubmit={(sub) => onHITLSubmit?.(sub)}
                  onSkip={onHITLSkip}
                  onDismiss={onHITLDismiss}
                />
              )}
              <form className="composer-dock" onSubmit={(e) => void sendMessage(e)}>
                <AttachmentChips
                  files={attachments.map((file) => ({
                    key: `${file.name}-${file.size}-${file.lastModified}`,
                    filename: file.name,
                    size: file.size,
                  }))}
                  onRemove={removeAttachment}
                  disabled={sending}
                />
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`
                  }}
                  onKeyDown={(e) => {
                    if (shouldSendOnKeyDown(e)) {
                      e.preventDefault()
                      void sendMessage()
                    }
                  }}
                  placeholder={
                    hitlRequest
                      ? '+ Or reply directly...'
                      : sendShortcut === 'ctrl_enter'
                      ? 'Ask a follow-up... (Ctrl+Enter to send)'
                      : 'Ask a follow-up...'
                  }
                  rows={1}
                  disabled={loadingThread || (sending && !hitlRequest)}
                />
                <div className="composer-toolbar">
                  <Tooltip content="Attach files">
                    <button
                      type="button"
                      className="circle-action-btn attach-circle"
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={sending}
                      aria-label="Attach files"
                    >
                      <Icon name="plus" size={17} />
                    </button>
                  </Tooltip>
                  <div className="composer-right-actions">
                    {sending && !hitlRequest ? (
                      <Tooltip content="Stop generation">
                        <button
                          type="button"
                          className="circle-action-btn stop-circle"
                          onClick={stopResponse}
                          aria-label="Stop generation"
                        >
                          <Icon name="stop" size={12} />
                        </button>
                      </Tooltip>
                    ) : (
                      <Tooltip content="Execute command (Enter)">
                        <button
                          type="submit"
                          className={`circle-action-btn send-circle ${input.trim() || attachments.length ? 'active' : ''}`}
                          disabled={loadingThread || (!input.trim() && !attachments.length)}
                          aria-label="Execute command (Enter)"
                        >
                          <Icon name="arrowUp" size={16} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </form>
            </div>}
          </div>
  )
}
