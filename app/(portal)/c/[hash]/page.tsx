import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// ── Types ────────────────────────────────────────────────────────────────────

interface Checkpoint {
  id: string
  name: string
  sequence_order: number
  due_date: string | null
  completed_at: string | null
  total_items: number
  completed_items: number
  progress_pct: number | null
  status: 'complete' | 'overdue' | 'pending'
}

interface Payment {
  milestone_name: string
  amount_due: number
  due_date: string | null
  is_paid: boolean
  triggered_at: string | null
}

interface Image {
  id: string
  url: string | null
  kind: string
  taken_at: string | null
}

interface TableColumn {
  id: string
  name: string
  column_kind: 'serial' | 'text' | 'checkbox' | 'date' | 'revision_text'
  display_order: number
}

interface TableSection {
  id: string
  name: string
  display_order: number
}

interface TableRow {
  id: string
  section_id: string | null
  display_order: number
  cells: Record<string, unknown>
}

interface ProjectTable {
  id: string
  name: string
  table_owner_role: string
  columns: TableColumn[]
  sections: TableSection[]
  rows: TableRow[]
}

interface PortalData {
  project_name: string
  project_type: string | null
  location: string | null
  current_stage: string | null
  start_date: string | null
  expected_end_date: string | null
  checkpoints: Checkpoint[]
  payments: Payment[]
  images: Image[]
  drive_folder_url: string | null
  project_tables: ProjectTable[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtAmount(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`
  return `₹${n.toLocaleString('en-IN')}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ padding: '18px 20px', borderRadius: 18, background: 'var(--paper)', boxShadow: '0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)', border: '1px solid rgba(30,28,24,.04)' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function CheckpointTimeline({ checkpoints }: { checkpoints: Checkpoint[] }) {
  const totalItems = checkpoints.reduce((n, cp) => n + cp.total_items, 0)
  const completedItems = checkpoints.reduce((n, cp) => n + cp.completed_items, 0)
  const overallPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : null

  const chipStyle = (cp: Checkpoint, isActive: boolean) => {
    if (cp.status === 'complete') return { bg: 'rgba(107,138,110,.12)', color: 'var(--mint)', label: 'Complete', dot: true }
    if (cp.status === 'overdue')  return { bg: 'rgba(197,84,59,.08)',   color: 'var(--rust)', label: 'Overdue',  dot: true }
    if (isActive)                 return { bg: 'rgba(45,106,79,.1)',    color: 'var(--accent)', label: 'Active', dot: true }
    return { bg: 'var(--bg-2)', color: 'var(--muted)', label: 'Upcoming', dot: false }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <div className="serif" style={{ fontSize: 28, letterSpacing: -.5 }}>Project Milestones</div>
        {overallPct !== null && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 100, height: 5, background: 'var(--line-2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${overallPct}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width .3s' }} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{overallPct}%</span>
          </div>
        )}
      </div>
      <div style={{ background: 'var(--paper)', borderRadius: 20, padding: 24, boxShadow: '0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)', border: '1px solid rgba(30,28,24,.04)' }}>
        {checkpoints.map((cp, i) => {
          const isActive = cp.status !== 'complete' && (i === 0 || checkpoints[i - 1].status === 'complete')
          const chip = chipStyle(cp, isActive)
          return (
            <div key={cp.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 14, alignItems: 'flex-start', padding: '14px 0', borderBottom: i < checkpoints.length - 1 ? '1px solid var(--line)' : 'none', position: 'relative' }}>
              {i < checkpoints.length - 1 && (
                <div style={{ position: 'absolute', left: 11, top: 38, width: 2, height: 20, background: cp.status === 'complete' ? 'var(--ink)' : 'var(--line-2)', zIndex: 0 }} />
              )}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: cp.status === 'complete' ? 'var(--ink)' : isActive ? 'var(--accent)' : 'var(--bg-2)',
                  border: isActive ? '3px solid rgba(45,106,79,.3)' : `2px solid ${cp.status === 'complete' ? 'var(--ink)' : 'var(--line-2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isActive ? '0 0 0 6px rgba(45,106,79,.1)' : 'none',
                }}>
                  {cp.status === 'complete' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F3EFE7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: isActive || cp.status === 'complete' ? 600 : 400, color: cp.status === 'pending' && !isActive ? 'var(--muted)' : 'var(--ink)' }}>
                  {cp.name}
                </div>
                {cp.due_date && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Due {fmt(cp.due_date)}</div>
                )}
                {cp.total_items > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 80, height: 4, background: 'var(--line-2)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${cp.progress_pct ?? 0}%`, background: cp.status === 'complete' ? 'var(--mint)' : 'var(--accent)', borderRadius: 99 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {cp.completed_items}/{cp.total_items}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 2 }}>
                {chip.dot && <div style={{ width: 6, height: 6, borderRadius: '50%', background: chip.color, flexShrink: 0 }} />}
                <span style={{ fontSize: 11, fontWeight: 500, color: chip.color, background: chip.bg, padding: '3px 8px', borderRadius: 99 }}>
                  {chip.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PaymentSchedule({ payments }: { payments: Payment[] }) {
  const chipStyle = (p: Payment) => {
    if (p.is_paid) return { bg: 'rgba(107,138,110,.12)', color: 'var(--mint)', label: 'Paid' }
    if (p.triggered_at) return { bg: 'rgba(226,166,75,.15)', color: 'var(--amber)', label: 'Due Now' }
    return { bg: 'var(--bg-2)', color: 'var(--muted)', label: 'Upcoming' }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, marginBottom: 18 }}>Payment Schedule</div>
      <div style={{ background: 'var(--paper)', borderRadius: 20, boxShadow: '0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)', border: '1px solid rgba(30,28,24,.04)', overflow: 'hidden' }}>
        {payments.map((p, i) => {
          const chip = chipStyle(p)
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              gap: 16, alignItems: 'center',
              padding: '18px 24px',
              borderBottom: i < payments.length - 1 ? '1px solid var(--line)' : 'none',
              background: p.triggered_at && !p.is_paid ? '#FFFBF0' : 'transparent',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.milestone_name}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {p.due_date ? `Due ${fmt(p.due_date)}` : 'No due date'}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{fmtAmount(p.amount_due)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: chip.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: chip.color, background: chip.bg, padding: '3px 8px', borderRadius: 99 }}>
                  {chip.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ImageGallery({ images }: { images: Image[] }) {
  if (images.length === 0) return null
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, marginBottom: 18 }}>Site Images</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {images.map((img) => (
          img.url ? (
            <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', aspectRatio: '4/3', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            </a>
          ) : (
            <div key={img.id} style={{ aspectRatio: '4/3', borderRadius: 14, background: 'var(--bg-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            </div>
          )
        ))}
      </div>
    </div>
  )
}

function ProjectTableView({ table }: { table: ProjectTable }) {
  const sectionMap = Object.fromEntries(table.sections.map((s) => [s.id, s.name]))
  const sortedCols = [...table.columns].sort((a, b) => a.display_order - b.display_order)
  const sortedRows = [...table.rows].sort((a, b) => a.display_order - b.display_order)

  // Group rows by section
  const grouped: { sectionId: string | null; sectionName: string | null; rows: TableRow[] }[] = []
  const seen = new Set<string | null>()
  for (const row of sortedRows) {
    const sid = row.section_id ?? null
    if (!seen.has(sid)) {
      seen.add(sid)
      grouped.push({ sectionId: sid, sectionName: sid ? (sectionMap[sid] ?? null) : null, rows: [] })
    }
    grouped.find((g) => g.sectionId === sid)!.rows.push(row)
  }

  const done  = sortedRows.filter((r) => r.cells && typeof r.cells === 'object' && Object.values(r.cells).some((v) => v === true)).length
  const total = sortedRows.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div style={{ marginBottom: 32 }}>
      <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, marginBottom: 18 }}>{table.name}</div>
      <div style={{ background: 'var(--paper)', borderRadius: 20, boxShadow: '0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)', border: '1px solid rgba(30,28,24,.04)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{total} rows</div>
          {total > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 120, height: 6, background: 'var(--line-2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width .3s' }} />
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{pct}%</span>
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ width: 40, padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>#</th>
                {sortedCols.map((col) => (
                  <th key={col.id} style={{ padding: '10px 16px', textAlign: col.column_kind === 'checkbox' ? 'center' : 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <>
                  {group.sectionName && (
                    <tr key={`section-${group.sectionId}`}>
                      <td colSpan={sortedCols.length + 1} style={{ padding: '8px 16px', background: 'var(--bg-2)', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .8 }}>
                        {group.sectionName}
                      </td>
                    </tr>
                  )}
                  {group.rows.map((row, ri) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px 16px', fontFamily: "'Geist Mono',monospace", fontSize: 11, color: 'var(--muted)' }}>{ri + 1}</td>
                      {sortedCols.map((col) => {
                        const val = row.cells[col.id]
                        if (col.column_kind === 'checkbox') {
                          return (
                            <td key={col.id} style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <div style={{
                                width: 20, height: 20, borderRadius: 5, margin: '0 auto',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                border: `2px solid ${!!val ? 'var(--accent)' : 'var(--line-2)'}`,
                                background: !!val ? 'var(--accent)' : 'transparent',
                              }}>
                                {!!val && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                              </div>
                            </td>
                          )
                        }
                        if (col.column_kind === 'revision_text') {
                          return (
                            <td key={col.id} style={{ padding: '12px 16px', fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>
                              {val ? String(val) : <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                          )
                        }
                        return (
                          <td key={col.id} style={{ padding: '12px 16px' }}>
                            {val !== undefined && val !== null && val !== '' ? String(val) : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CustomerPortalPage({ params }: { params: Promise<{ hash: string }> }) {
  const headersList = await headers()
  const ip = headersList.get('x-real-ip') ?? headersList.get('x-forwarded-for') ?? undefined
  const ua = headersList.get('user-agent') ?? undefined
  const reqId = headersList.get('x-request-id') ?? undefined

  const { hash } = await params
  if (!hash || hash.length !== 16) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_customer_portal', {
    p_hash: hash,
    p_ip: ip ?? undefined,
    p_user_agent: ua ?? undefined,
    p_request_id: reqId ?? undefined,
  }) as { data: PortalData | null; error: unknown }

  if (error || !data) notFound()

  // Sign storage URLs server-side
  if (Array.isArray(data.images) && data.images.length > 0) {
    const signed = await Promise.all(
      (data.images as unknown as Array<{ id: string; storage_path: string; bucket: string; kind: string; taken_at: string }>).map(async (img) => {
        if (img.bucket === 'media-customer-public') {
          const { data: pub } = supabase.storage.from(img.bucket).getPublicUrl(img.storage_path)
          return { id: img.id, url: pub.publicUrl, kind: img.kind, taken_at: img.taken_at }
        }
        const { data: s } = await supabase.storage.from(img.bucket).createSignedUrl(img.storage_path, 600)
        return { id: img.id, url: s?.signedUrl ?? null, kind: img.kind, taken_at: img.taken_at }
      })
    )
    ;(data as unknown as { images: typeof signed }).images = signed
  }

  const paid = (data.payments ?? []).filter((p) => p.is_paid)
  const due  = (data.payments ?? []).filter((p) => !p.is_paid && p.triggered_at)
  const totalFee = (data.payments ?? []).reduce((n, p) => n + (p.amount_due ?? 0), 0)
  const totalPaid = paid.reduce((n, p) => n + (p.amount_due ?? 0), 0)
  const nextDue = due[0] ?? null

  return (
    <>
      <style>{`
        :root {
          --bg: #F3EFE7; --bg-2: #EDE7DB; --paper: #FBF8F2;
          --ink: #1B1A17; --ink-2: #3A3833; --muted: #8A857B;
          --line: #E2DBCC; --line-2: #D6CDBA;
          --accent: #2D6A4F; --accent-soft: #B7E4C7;
          --mint: #6B8A6E; --amber: #E2A64B; --rust: #C5543B;
          --teal: #3A8A7A;
        }
        *, *::before, *::after { box-sizing: border-box }
        html, body {
          margin: 0; padding: 0;
          background: var(--bg); color: var(--ink);
          font-family: 'Geist', ui-sans-serif, system-ui;
          -webkit-font-smoothing: antialiased;
        }
        body {
          background:
            radial-gradient(900px 500px at 80% -5%, #D8E2DC 0%, transparent 60%),
            radial-gradient(700px 400px at -10% 110%, #E8DFCC 0%, transparent 55%),
            var(--bg);
          min-height: 100vh;
        }
        .mono { font-family: 'Geist Mono', ui-monospace, monospace; letter-spacing: -.01em }
        .serif { font-family: 'Instrument Serif', serif; letter-spacing: -.01em }
        a { color: inherit; text-decoration: none }
        @media (max-width: 640px) {
          .summary-grid { grid-template-columns: 1fr 1fr !important }
          .summary-grid > div:last-child { grid-column: span 2 }
        }
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: 'max(env(safe-area-inset-top, 0px), 40px) 28px 60px' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 80, height: 35, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--muted)', textTransform: 'uppercase', marginTop: 1 }}>Client Portal</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', background: 'rgba(45,106,79,.1)', padding: '3px 8px', borderRadius: 99 }}>Active Project</span>
          </div>
        </div>

        {/* Project hero */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: .6, textTransform: 'uppercase', marginBottom: 8 }}>
            {[data.project_type, data.location].filter(Boolean).join(' · ')}
          </div>
          <h1 className="serif" style={{ margin: '0 0 12px', fontSize: 52, lineHeight: 1, fontWeight: 400, letterSpacing: -1.2 }}>
            {data.project_name}
          </h1>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--ink-2)', fontSize: 13 }}>
            {data.start_date && <span>Started: <b>{fmt(data.start_date)}</b></span>}
            {data.expected_end_date && <span>Est. completion: <b>{fmt(data.expected_end_date)}</b></span>}
            {data.current_stage && <span>Stage: <b>{data.current_stage.replace(/_/g, ' ')}</b></span>}
          </div>
        </div>

        {/* Summary cards */}
        {totalFee > 0 && (
          <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
            <SummaryCard label="Total Fee" value={fmtAmount(totalFee)} sub="Project value" color="var(--ink)" />
            <SummaryCard label="Paid to Date" value={fmtAmount(totalPaid)} sub={`${paid.length} of ${data.payments.length} milestones`} color="var(--mint)" />
            <SummaryCard
              label="Next Due"
              value={nextDue ? fmtAmount(nextDue.amount_due) : '—'}
              sub={nextDue ? `${nextDue.milestone_name}${nextDue.due_date ? ` · ${fmt(nextDue.due_date)}` : ''}` : 'All paid'}
              color="var(--amber)"
            />
          </div>
        )}

        {/* Payments */}
        {data.payments.length > 0 && <PaymentSchedule payments={data.payments} />}

        {/* Checkpoints */}
        {data.checkpoints.length > 0 && <CheckpointTimeline checkpoints={data.checkpoints} />}

        {/* Images */}
        <ImageGallery images={data.images} />

        {/* Drive folder */}
        {data.drive_folder_url && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ padding: '20px 24px', borderRadius: 18, background: 'var(--paper)', boxShadow: '0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)', border: '1px solid rgba(30,28,24,.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Project Files &amp; Drawings</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>All drawings, specifications, and design documents</div>
              </div>
              <a href={data.drive_folder_url} target="_blank" rel="noopener noreferrer"
                style={{ padding: '12px 20px', borderRadius: 12, background: 'var(--ink)', color: '#F3EFE7', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Open Drive Folder
              </a>
            </div>
          </div>
        )}

        {/* Project tables (read-only) */}
        {data.project_tables.map((table) => (
          <ProjectTableView key={table.id} table={table} />
        ))}

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 11 }}>
          <span>Powered by <a href="https://ascension-ten.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'none' }}>ascension</a></span>
          <span className="mono">/c/{hash}</span>
        </div>

      </div>
    </>
  )
}
