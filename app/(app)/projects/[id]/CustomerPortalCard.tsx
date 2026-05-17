'use client'

import { useState } from 'react'
import styles from './project-detail.module.css'

interface Props {
  projectId: string
  initialHash: string | null
  initialEnabled: boolean
  siteUrl: string
}

export default function CustomerPortalCard({ projectId, initialHash, initialEnabled, siteUrl }: Props) {
  const [hash, setHash] = useState(initialHash)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const portalUrl = hash ? `${siteUrl}/c/${hash}` : null

  async function generate() {
    setLoading(true)
    const res = await fetch(`/api/projects/${projectId}/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' }),
    })
    if (res.ok) {
      const data = await res.json()
      setHash(data.customer_portal_hash)
      setEnabled(data.customer_portal_enabled)
    }
    setLoading(false)
  }

  async function revoke() {
    if (!confirm('Revoke this link? The customer will lose access immediately.')) return
    setLoading(true)
    const res = await fetch(`/api/projects/${projectId}/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke' }),
    })
    if (res.ok) {
      setHash(null)
      setEnabled(false)
    }
    setLoading(false)
  }

  async function copy() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className={styles.cardHeading} style={{ marginBottom: 0 }}>Customer Portal</div>
        {enabled && hash && (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-forest)', background: 'rgba(45,106,79,.1)', padding: '3px 8px', borderRadius: 99 }}>
            Active
          </span>
        )}
      </div>

      {!hash ? (
        <div>
          <p style={{ fontSize: 13, color: 'var(--color-tan)', marginBottom: 14, lineHeight: 1.5 }}>
            Generate a secure link to share project progress, payments, and site images with your client. The link is read-only and only shows information you explicitly opt in.
          </p>
          <button
            onClick={generate}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 10, background: 'var(--color-ink)',
              color: '#F3EFE7', fontSize: 13, fontWeight: 500, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .6 : 1,
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {loading ? 'Generating…' : 'Generate Customer Link'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--color-tan)' }}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {portalUrl}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={copy}
              style={{
                padding: '9px 16px', borderRadius: 9, background: 'var(--color-ink)',
                color: '#F3EFE7', fontSize: 12, fontWeight: 500, border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                  Copy Link
                </>
              )}
            </button>
            <a
              href={portalUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '9px 16px', borderRadius: 9, border: '1px solid var(--color-line)',
                fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                color: 'var(--color-ink)', background: 'transparent', cursor: 'pointer',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
              Preview
            </a>
            <button
              onClick={revoke}
              disabled={loading}
              style={{
                padding: '9px 16px', borderRadius: 9, border: '1px solid var(--color-line)',
                fontSize: 12, fontWeight: 500, color: 'var(--color-rust)',
                background: 'transparent', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .6 : 1,
              }}
            >
              {loading ? 'Revoking…' : 'Revoke'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
