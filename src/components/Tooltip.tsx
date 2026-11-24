import React, { cloneElement, useId, useRef, type ReactElement, type ReactNode } from 'react'
import './Tooltip.css'

interface TooltipProps {
  content: ReactNode
  children: ReactElement<Record<string, unknown>>
  disabled?: boolean
  side?: 'top' | 'bottom' | 'right'
}

/**
 * Modern platform-native Tooltip component.
 * Conforms to modern-web-guidance:
 * - Uses Popover API (popover="hint") for top-layer promotion and isolation
 * - CSS Anchor Positioning (position-area: block-start, position-try-fallbacks: flip-block)
 * - interestfor trigger association
 * - WCAG 1.4.13 compliance: dismissible (Esc), hoverable, persistent
 */
export function Tooltip({ content, children, disabled = false, side = 'top' }: TooltipProps) {
  const rawId = useId().replace(/:/g, '')
  const tooltipId = `orbit-hint-${rawId}`
  const anchorName = `--orbit-anchor-${rawId}`
  const popoverRef = useRef<HTMLDivElement>(null)
  const isHoveredRef = useRef(false)
  const isPopoverHoveredRef = useRef(false)

  if (disabled || !content) {
    return children
  }

  const show = () => {
    isHoveredRef.current = true
    const el = popoverRef.current
    if (el && typeof el.showPopover === 'function') {
      try {
        el.showPopover()
      } catch {
        // Popover may already be open
      }
    }
  }

  const hide = () => {
    isHoveredRef.current = false
    // Delay slightly to allow pointer to move onto the tooltip itself (WCAG 1.4.13)
    setTimeout(() => {
      if (!isHoveredRef.current && !isPopoverHoveredRef.current) {
        const el = popoverRef.current
        if (el && typeof el.hidePopover === 'function') {
          try {
            el.hidePopover()
          } catch {
            // Already hidden
          }
        }
      }
    }, 50)
  }

  const handlePopoverMouseEnter = () => {
    isPopoverHoveredRef.current = true
  }

  const handlePopoverMouseLeave = () => {
    isPopoverHoveredRef.current = false
    hide()
  }

  const childStyle = ((children.props.style as Record<string, unknown>) || {}) as Record<string, unknown>

  // Preserve the caller's ref; this component reads only its own popover ref in event handlers.
  // eslint-disable-next-line react-hooks/refs -- cloneElement forwards the caller's ref without reading it.
  const trigger = cloneElement(children, {
    // Platform-native interest trigger
    interestfor: tooltipId,
    'aria-describedby': tooltipId,
    style: {
      ...childStyle,
      anchorName,
    },
    onPointerEnter: (e: React.PointerEvent) => {
      show()
      if (typeof children.props.onPointerEnter === 'function') {
        ;(children.props.onPointerEnter as (e: React.PointerEvent) => void)(e)
      }
    },
    onPointerLeave: (e: React.PointerEvent) => {
      hide()
      if (typeof children.props.onPointerLeave === 'function') {
        ;(children.props.onPointerLeave as (e: React.PointerEvent) => void)(e)
      }
    },
    onFocus: (e: React.FocusEvent) => {
      show()
      if (typeof children.props.onFocus === 'function') {
        ;(children.props.onFocus as (e: React.FocusEvent) => void)(e)
      }
    },
    onBlur: (e: React.FocusEvent) => {
      hide()
      if (typeof children.props.onBlur === 'function') {
        ;(children.props.onBlur as (e: React.FocusEvent) => void)(e)
      }
    },
  })

  return (
    <>
      {trigger}
      <div
        ref={popoverRef}
        id={tooltipId}
        popover="hint"
        role="tooltip"
        data-side={side}
        className="orbit-tooltip"
        style={{ positionAnchor: anchorName } as React.CSSProperties}
        onPointerEnter={handlePopoverMouseEnter}
        onPointerLeave={handlePopoverMouseLeave}
      >
        {content}
      </div>
    </>
  )
}
