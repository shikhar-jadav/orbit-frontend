import { useState, useEffect, useRef } from 'react'
import { Icon } from './Icon'
import type {
  HITLNormalizedOption,
  HITLQuestionItem,
  HITLCardRequest,
  HITLSubmission,
} from './types'
import './HumanInTheLoopCard.css'

export type {
  HITLNormalizedOption,
  HITLQuestionItem,
  HITLCardRequest,
  HITLSubmission,
}

type HumanInTheLoopCardProps = {
  request: HITLCardRequest
  onSubmit: (submission: HITLSubmission) => void
  onSkip?: () => void
  onDismiss?: () => void
}

export function HumanInTheLoopCard({
  request,
  onSubmit,
  onSkip,
  onDismiss,
}: HumanInTheLoopCardProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const [multiSelected, setMultiSelected] = useState<Record<number, Set<string>>>({})
  const [allAnswers, setAllAnswers] = useState<Record<number, { selectedTitles: string[]; customText?: string }>>({})
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customText, setCustomText] = useState('')
  const customInputRef = useRef<HTMLInputElement>(null)

  const questions = request.questions || []
  const rawQ = questions[pageIndex]
  const parsedQuestion: HITLQuestionItem =
    typeof rawQ === 'string'
      ? { question: rawQ, options: [], is_multi_select: false }
      : rawQ || {
          question: 'Please choose an option to continue:',
          options: [],
          is_multi_select: false,
        }

  const currentQuestion: HITLQuestionItem = {
    ...parsedQuestion,
    options:
      parsedQuestion.options && parsedQuestion.options.length > 0
        ? parsedQuestion.options
        : request.is_approval
        ? [
            {
              title: 'Allow once (Recommended)',
              description: 'Run this tool once for this step and continue',
            },
            {
              title: 'Always allow this tool',
              description: 'Approve and remember "Allow always" in Settings',
            },
            {
              title: 'Decline action',
              description: 'Do not run this tool and let Orbit adapt',
            },
          ]
        : ['Yes', 'No'],
  }
  const isMulti = Boolean(currentQuestion.is_multi_select)
  const totalPages = Math.max(1, questions.length)

  // Normalize options
  const normalizedOptions: HITLNormalizedOption[] = (currentQuestion.options || []).map(
    (opt, idx) => {
      if (typeof opt === 'string') {
        return { id: String(idx + 1), title: opt, raw: opt }
      }
      const title = opt.title || opt.label || `Option ${idx + 1}`
      return {
        id: opt.id || String(idx + 1),
        title,
        description: opt.description,
        raw: title,
      }
    },
  )

  const currentSelectedSet = multiSelected[pageIndex] || new Set<string>()

  function goToPage(nextIdx: number) {
    setPageIndex(nextIdx)
    setFocusedIndex(0)
    setShowCustomInput(false)
    setCustomText('')
  }

  // Focus input when "Something else" opens
  useEffect(() => {
    if (showCustomInput) {
      customInputRef.current?.focus()
    }
  }, [showCustomInput])

  function handleSelectOption(option: HITLNormalizedOption) {
    if (isMulti) {
      setMultiSelected((prev) => {
        const set = new Set(prev[pageIndex] || [])
        if (set.has(option.title)) {
          set.delete(option.title)
        } else {
          set.add(option.title)
        }
        return { ...prev, [pageIndex]: set }
      })
    } else {
      // Single select: submit immediately or advance to next question
      submitAnswer([option.title])
    }
  }

  function submitAnswer(selectedTitles: string[], customVal?: string) {
    const updatedAnswers = {
      ...allAnswers,
      [pageIndex]: { selectedTitles, customText: customVal },
    }
    setAllAnswers(updatedAnswers)

    if (pageIndex < totalPages - 1) {
      goToPage(pageIndex + 1)
      return
    }

    // Compile answers across all questions
    const combinedTitles: string[] = []
    const combinedCustom: string[] = []
    const answersMap: Record<string, string[]> = {}
    for (let i = 0; i < totalPages; i++) {
      const q = questions[i]
      const qText = typeof q === 'string' ? q : q?.question || `Question ${i + 1}`
      const a = updatedAnswers[i]
      if (a) {
        combinedTitles.push(...a.selectedTitles)
        if (a.customText) combinedCustom.push(a.customText)
        answersMap[qText] = a.customText ? [a.customText] : a.selectedTitles
      }
    }

    const isAlwaysAllow = combinedTitles.some((t) =>
      t.toLowerCase().includes('always allow'),
    )
    const isApproval = Boolean(request.is_approval)

    onSubmit({
      requestId: request.id,
      questionIndex: pageIndex,
      question: currentQuestion.question,
      selectedTitles: combinedTitles,
      customText: combinedCustom.join('\n') || customVal,
      isApproval,
      alwaysAllow: isAlwaysAllow,
      connectorId: request.connector_id,
      toolName: request.tool_name,
      answers: answersMap,
    })
  }

  function handleSkip() {
    if (pageIndex < totalPages - 1) {
      goToPage(pageIndex + 1)
    } else {
      if (onSkip) onSkip()
      else if (onDismiss) onDismiss()
    }
  }

  function handleSubmitMulti() {
    const selected = Array.from(currentSelectedSet)
    if (selected.length === 0) return
    submitAnswer(selected)
  }

  function handleCustomSubmit() {
    const trimmed = customText.trim()
    if (!trimmed) return
    if (isMulti) {
      setMultiSelected((prev) => {
        const set = new Set(prev[pageIndex] || [])
        set.add(trimmed)
        return { ...prev, [pageIndex]: set }
      })
      setShowCustomInput(false)
      setCustomText('')
    } else {
      submitAnswer([trimmed], trimmed)
    }
  }

  // Keep latest actions in a ref to keep key listener stable
  const actionsRef = useRef({
    showCustomInput,
    normalizedOptions,
    focusedIndex,
    isMulti,
    handleSelectOption,
    handleSubmitMulti,
    submitAnswer,
    onDismiss,
    onSkip,
  })

  useEffect(() => {
    actionsRef.current = {
      showCustomInput,
      normalizedOptions,
      focusedIndex,
      isMulti,
      handleSelectOption,
      handleSubmitMulti,
      submitAnswer,
      onDismiss,
      onSkip,
    }
  })

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const act = actionsRef.current
      if (act.showCustomInput) {
        if (e.key === 'Escape') {
          setShowCustomInput(false)
          e.preventDefault()
        }
        return
      }

      // Number keys 1-9
      const num = parseInt(e.key, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= act.normalizedOptions.length) {
        e.preventDefault()
        const opt = act.normalizedOptions[num - 1]
        if (opt) act.handleSelectOption(opt)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % act.normalizedOptions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((prev) =>
          prev <= 0 ? act.normalizedOptions.length - 1 : prev - 1,
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (act.isMulti) {
          act.handleSubmitMulti()
        } else {
          const opt = act.normalizedOptions[act.focusedIndex]
          if (opt) act.submitAnswer([opt.title])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (act.onDismiss) act.onDismiss()
        else if (act.onSkip) act.onSkip()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="hitl-card" role="dialog" aria-labelledby="hitl-q-title">
      {/* Header */}
      <div className="hitl-header">
        <div className="hitl-title" id="hitl-q-title">
          {request.risk_level && (
            <span className={`hitl-risk-badge hitl-risk-${request.risk_level.toLowerCase()}`}>
              {request.risk_level.toUpperCase()}
            </span>
          )}
          {currentQuestion.question}
        </div>
        <div className="hitl-header-actions">
          {totalPages > 1 && (
            <div className="hitl-pagination">
              <button
                type="button"
                className="hitl-page-btn"
                disabled={pageIndex === 0}
                onClick={() => goToPage(pageIndex - 1)}
                aria-label="Previous question"
              >
                ‹
              </button>
              <span>
                {pageIndex + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="hitl-page-btn"
                disabled={pageIndex === totalPages - 1}
                onClick={() => goToPage(pageIndex + 1)}
                aria-label="Next question"
              >
                ›
              </button>
            </div>
          )}
          <button
            type="button"
            className="hitl-close-btn"
            onClick={onDismiss || onSkip}
            aria-label="Close"
            title="Dismiss question"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      {/* Policy Note / Action Reason */}
      {request.reason && (
        <div className="hitl-policy-note">
          <Icon name="shield" size={12} />
          <span>{request.reason}</span>
        </div>
      )}

      {/* Options List */}
      <div className="hitl-options-list">
        {normalizedOptions.map((opt, idx) => {
          const isFocused = focusedIndex === idx
          const isChecked = currentSelectedSet.has(opt.title)

          return (
            <div
              key={opt.id}
              className={`hitl-option-item${isFocused ? ' focused' : ''}${
                isChecked ? ' selected' : ''
              }`}
              onClick={() => handleSelectOption(opt)}
              onMouseEnter={() => setFocusedIndex(idx)}
              role={isMulti ? 'checkbox' : 'button'}
              aria-checked={isMulti ? isChecked : undefined}
              tabIndex={0}
            >
              <div className="hitl-option-content">
                {isMulti ? (
                  <div className={`hitl-checkbox${isChecked ? ' checked' : ''}`}>
                    {isChecked && <Icon name="check" size={11} />}
                  </div>
                ) : (
                  <span className="hitl-number-badge">{idx + 1}</span>
                )}
                <div className="hitl-option-text">
                  <span className="hitl-option-title">{opt.title}</span>
                  {opt.description && (
                    <span className="hitl-option-desc">{opt.description}</span>
                  )}
                </div>
              </div>

              {!isMulti && (
                <div className="hitl-action-hint" aria-hidden="true">
                  {isFocused ? '→' : ''}
                </div>
              )}
            </div>
          )
        })}

        {/* Free-text "Something else" row */}
        {currentQuestion.allow_custom !== false && (
          <>
            {showCustomInput ? (
              <div className="hitl-custom-input-wrap">
                <input
                  ref={customInputRef}
                  className="hitl-custom-input"
                  placeholder="Type a custom answer and press Enter..."
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCustomSubmit()
                    }
                  }}
                />
                <button
                  type="button"
                  className="hitl-custom-submit-btn"
                  disabled={!customText.trim()}
                  onClick={handleCustomSubmit}
                >
                  Send
                </button>
              </div>
            ) : (
              <div
                className="hitl-custom-row"
                onClick={() => setShowCustomInput(true)}
                role="button"
                tabIndex={0}
              >
                <Icon name="edit" size={13} />
                <span>Something else</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className={`hitl-footer${isMulti ? '' : ' hitl-footer-right'}`}>
        {isMulti && (
          <span className="hitl-selected-count">
            {currentSelectedSet.size} selected
          </span>
        )}
        <div className="hitl-footer-actions">
          {currentQuestion.can_skip !== false && (
            <button
              type="button"
              className="hitl-btn-skip"
              onClick={handleSkip}
            >
              Skip
            </button>
          )}
          {isMulti && (
            <button
              type="button"
              className="hitl-btn-submit-orange"
              disabled={currentSelectedSet.size === 0}
              onClick={handleSubmitMulti}
              aria-label="Submit selection"
              title="Submit selection"
            >
              <Icon name="arrowUp" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
