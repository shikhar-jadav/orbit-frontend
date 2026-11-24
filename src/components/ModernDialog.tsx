import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ModernDialogProps {
  isOpen: boolean
  onClose: () => void
  ariaLabelledBy?: string
  ariaLabel?: string
  className?: string
  children: ReactNode
}

/**
 * Modern dialog component conforming to the Modern Web Guidance 'dialog'
 * and 'animate-to-from-top-layer' specifications:
 * - Uses native <dialog> with .showModal()
 * - Top-layer rendering with ::backdrop
 * - Smooth entry/exit animation with @starting-style and allow-discrete
 * - Pointer-based click-outside dismiss without synthetic bubbling bugs
 * - Native cancel event interception
 * - No manual role="dialog" or aria-modal (provided by native modal)
 */
export function ModernDialog({
  isOpen,
  onClose,
  ariaLabelledBy,
  ariaLabel,
  className = '',
  children,
}: ModernDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressedOutsideRef = useRef(false)
  const [renderedContent, setRenderedContent] = useState<ReactNode>(isOpen ? children : null)
  const [previousChildren, setPreviousChildren] = useState(children)
  const [wasOpen, setWasOpen] = useState(isOpen)

  if (isOpen && (!wasOpen || previousChildren !== children)) {
    setPreviousChildren(children)
    setWasOpen(true)
    setRenderedContent(children)
  } else if (!isOpen && wasOpen) {
    setWasOpen(false)
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal()
        } catch {
          // In case dialog is already open or pending
        }
      }
    } else {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [isOpen])

  // Clear retained content after exit animation finishes
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current && !isOpen) {
      setRenderedContent(null)
    }
  }

  // Pointer position check from Modern Web Guidance fallback spec
  const isPointerOutside = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current
    if (!dialog) return
    pressedOutsideRef.current = isPointerOutside(e, dialog)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current
    if (!dialog) return
    const releasedOutside = isPointerOutside(e, dialog)
    if (pressedOutsideRef.current && releasedOutside) {
      onClose()
    }
  }

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={className}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onCancel={handleCancel}
      onTransitionEnd={handleTransitionEnd}
    >
      {renderedContent}
    </dialog>
  )
}
