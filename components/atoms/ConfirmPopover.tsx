'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface ConfirmPopoverProps {
  /** The trigger element. Receives an onClick that opens the popover. */
  children: (open: () => void) => ReactNode
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
}

const WIDTH = 240
const MARGIN = 8

export function ConfirmPopover({
  children,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
}: ConfirmPopoverProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fixed positioning keeps the panel out of any ancestor's overflow clip, and
  // lets it be clamped to the viewport instead of running off the edge.
  // Layout effect so the first paint already has the panel in place.
  useLayoutEffect(() => {
    if (!open) return

    function place() {
      const trigger = wrapRef.current?.getBoundingClientRect()
      if (!trigger) return
      const height = panelRef.current?.offsetHeight ?? 0

      // Prefer right-aligned below the trigger, then clamp horizontally.
      let left = trigger.right - WIDTH
      left = Math.min(left, window.innerWidth - WIDTH - MARGIN)
      left = Math.max(left, MARGIN)

      // Flip above the trigger when there is no room below.
      let top = trigger.bottom + 6
      if (height && top + height > window.innerHeight - MARGIN) {
        const above = trigger.top - 6 - height
        top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - height - MARGIN)
      }

      setPos({ top, left })
    }

    place()

    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {children(() => setOpen(true))}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={title}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 200,
            width: WIDTH, maxWidth: `calc(100vw - ${MARGIN * 2}px)`, boxSizing: 'border-box',
            padding: 14, borderRadius: 14, whiteSpace: 'normal', textAlign: 'left',
            background: 'var(--color-paper-light)',
            border: '1px solid var(--color-line)',
            boxShadow: '0 8px 28px -8px rgba(30,28,24,.28)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4, whiteSpace: 'normal', wordBreak: 'break-word' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--color-tan)', lineHeight: 1.5, marginBottom: 12, whiteSpace: 'normal', wordBreak: 'break-word' }}>{message}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-line)', background: 'transparent', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {cancelLabel}
            </button>
            <button
              onClick={confirm}
              disabled={busy}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--color-rust)', color: '#FBF8F2', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {busy ? '…' : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
