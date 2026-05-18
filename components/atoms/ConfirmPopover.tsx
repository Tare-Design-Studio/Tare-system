'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ConfirmPopoverProps {
  /** The trigger element. Receives an onClick that opens the popover. */
  children: (open: () => void) => ReactNode
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
}

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
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
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
          role="dialog"
          aria-label={title}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            width: 240, maxWidth: 240, boxSizing: 'border-box',
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
