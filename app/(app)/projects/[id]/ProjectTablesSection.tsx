'use client'

import { useState, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { Avatar, Chip, ConfirmPopover } from '@/components/atoms'
import styles from './project-detail.module.css'

interface Column {
  id: string
  name: string
  column_kind: 'serial' | 'text' | 'checkbox' | 'date' | 'revision_text'
  display_order: number
  is_required: boolean
}

interface Section {
  id: string
  name: string
  display_order: number
}

interface Row {
  id: string
  section_id: string | null
  display_order: number
  cells: Record<string, unknown>
}

interface ProjectTable {
  id: string
  name: string
  table_owner_role: string
  description: string | null
  display_order: number
  project_table_columns: Column[]
  project_table_sections: Section[]
  project_table_rows: Row[]
}

interface TablePresetOption {
  id: string
  name: string
  description: string | null
  table_owner_role: string
  table_preset_columns: { id: string }[]
  table_preset_sections: { id: string }[]
  table_preset_rows: { id: string }[]
}

interface Props {
  projectId: string
  initialTables: ProjectTable[]
  canEdit: boolean
  siteEngineers: Assignment[]
}

interface Assignment {
  id: string
  role_on_project: string
  contribution_pct: number | null
  users: { id: string; full_name: string; role: string } | null
}

const COLUMN_KINDS = [
  { value: 'text', label: 'Text' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'revision_text', label: 'Revision Text' },
]

function CellInput({ col, value, onChange }: { col: Column; value: unknown; onChange: (v: unknown) => void }) {
  if (col.column_kind === 'checkbox') {
    return (
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 20, height: 20, borderRadius: 5, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${!!value ? 'var(--color-forest)' : 'var(--color-line)'}`,
          background: !!value ? 'var(--color-forest)' : 'transparent',
        }}
      >
        {!!value && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
      </div>
    )
  }
  if (col.column_kind === 'date') {
    return (
      <input
        type="date"
        value={value as string ?? ''}
        onChange={e => onChange(e.target.value)}
        style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-line)', fontSize: 11, fontFamily: 'inherit', outline: 'none', background: 'transparent' }}
      />
    )
  }
  return (
    <input
      type="text"
      value={value as string ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid transparent',
        fontSize: 12, fontFamily: col.column_kind === 'revision_text' ? 'var(--font-mono)' : 'inherit',
        outline: 'none', background: 'transparent',
      }}
      onFocus={e => (e.target.style.borderColor = 'var(--color-line)')}
      onBlur={e => (e.target.style.borderColor = 'transparent')}
    />
  )
}

function TableView({
  table, canEdit, projectId,
  onAddRow, onInsertRowAfter, onUpdateRow, onDeleteRow, onDeleteTable, onTableUpdated,
}: {
  table: ProjectTable
  canEdit: boolean
  projectId: string
  onAddRow: (tableId: string, sectionId: string | null) => Promise<void>
  onInsertRowAfter: (tableId: string, sectionId: string | null, afterDisplayOrder: number) => Promise<void>
  onUpdateRow: (tableId: string, rowId: string, cells: Record<string, unknown>) => Promise<void>
  onDeleteRow: (tableId: string, rowId: string) => void
  onDeleteTable: (tableId: string) => Promise<void>
  onTableUpdated: () => Promise<void>
}) {
  const sortedCols = [...table.project_table_columns].sort((a, b) => a.display_order - b.display_order)
  const sortedRows = [...table.project_table_rows].sort((a, b) => a.display_order - b.display_order)
  const sectionMap: Record<string, string> = {}
  for (const s of table.project_table_sections) sectionMap[s.id] = s.name

  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [editMode, setEditMode] = useState(false)
  const [showColForm, setShowColForm] = useState(false)
  const [insertColAfterOrder, setInsertColAfterOrder] = useState<number | null>(null)
  const [showSectionForm, setShowSectionForm] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColKind, setNewColKind] = useState('text')
  const [newSectionName, setNewSectionName] = useState('')
  const [saving, setSaving] = useState(false)
  const showEdit = canEdit && editMode

  function getDraft(rowId: string, row: Row) { return drafts[rowId] ?? { ...row.cells } }
  function setCellDraft(rowId: string, row: Row, colId: string, val: unknown) {
    const current = getDraft(rowId, row)
    setDrafts(d => ({ ...d, [rowId]: { ...current, [colId]: val } }))
    if (sortedCols.find(c => c.id === colId)?.column_kind === 'checkbox') {
      onUpdateRow(table.id, rowId, { ...current, [colId]: val })
    }
  }
  function flushDraft(rowId: string) {
    if (drafts[rowId]) {
      onUpdateRow(table.id, rowId, drafts[rowId])
      setDrafts(d => { const next = { ...d }; delete next[rowId]; return next })
    }
  }

  const groups: { sectionId: string | null; sectionName: string | null; rows: Row[] }[] = []
  const seen = new Set<string | null>()
  for (const row of sortedRows) {
    const sid = row.section_id ?? null
    if (!seen.has(sid)) {
      seen.add(sid)
      groups.push({ sectionId: sid, sectionName: sid ? (sectionMap[sid] ?? null) : null, rows: [] })
    }
    groups.find(g => g.sectionId === sid)!.rows.push(row)
  }

  const done = sortedRows.filter(r => Object.values(r.cells).some(v => v === true)).length
  const total = sortedRows.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const isSiteTable = table.table_owner_role === 'site_engineer'
  const progressLabel = isSiteTable
    ? `${done} of ${total} items verified`
    : `${done} of ${total} drawings issued`

  async function addColumn(afterOrder?: number) {
    if (!newColName.trim()) return
    setSaving(true)
    await fetch(`/api/projects/${projectId}/tables/${table.id}/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newColName.trim(),
        column_kind: newColKind,
        insert_after_order: afterOrder,
      }),
    })
    setNewColName(''); setShowColForm(false); setInsertColAfterOrder(null); setSaving(false)
    await onTableUpdated()
  }

  async function deleteColumn(columnId: string) {
    setSaving(true)
    await fetch(`/api/projects/${projectId}/tables/${table.id}/columns/${columnId}`, {
      method: 'DELETE',
    })
    setSaving(false)
    await onTableUpdated()
  }

  async function addSection() {
    if (!newSectionName.trim()) return
    setSaving(true)
    await fetch(`/api/projects/${projectId}/tables/${table.id}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSectionName.trim() }),
    })
    setNewSectionName(''); setShowSectionForm(false); setSaving(false)
    await onTableUpdated()
  }

  const inputSm: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-line)',
    background: 'var(--color-paper-light)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div className={styles.executionCard}>
      <div className={styles.executionTableHeader}>
        <div>
          <div className={styles.executionTableTitle}>{table.name}</div>
          <div className={styles.executionTableSubtitle}>{total > 0 ? progressLabel : table.description ?? 'No rows configured yet'}</div>
        </div>
        <div className={styles.executionActions}>
          {total > 0 && (
            <>
              <div className={styles.executionProgressTrack}>
                <div
                  className={styles.executionProgressFill}
                  style={{
                    width: `${pct}%`,
                    background: isSiteTable ? 'var(--color-teal)' : 'var(--color-forest)',
                  }}
                />
              </div>
              <span className={styles.executionProgressText}>{pct}%</span>
            </>
          )}
          {canEdit && (
            <button
              onClick={() => { setEditMode(v => !v); if (editMode) { setShowColForm(false); setShowSectionForm(false); setInsertColAfterOrder(null) } }}
              className={`${styles.executionGhostBtn} ${editMode ? styles.executionGhostBtnActive : ''}`}
              title={editMode ? 'Exit edit mode' : 'Edit table'}
              aria-label="Toggle edit mode"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
            </button>
          )}
          {showEdit && (
            <>
              <button
                onClick={() => { setShowSectionForm(v => !v); setShowColForm(false) }}
                className={`${styles.executionGhostBtn} ${showSectionForm ? styles.executionGhostBtnActive : ''}`}
              >
                + Section
              </button>
              <button
                onClick={() => { setShowColForm(v => !v); setShowSectionForm(false) }}
                className={`${styles.executionGhostBtn} ${showColForm ? styles.executionGhostBtnActive : ''}`}
              >
                + Column
              </button>
              <ConfirmPopover
                title="Delete table?"
                message={`"${table.name}" and all its columns, sections and rows will be removed. This cannot be undone.`}
                onConfirm={() => onDeleteTable(table.id)}
              >
                {(open) => (
                  <button
                    onClick={open}
                    className={styles.executionGhostBtn}
                    style={{ color: 'var(--color-rust)' }}
                    title="Delete table"
                  >
                    Delete
                  </button>
                )}
              </ConfirmPopover>
            </>
          )}
        </div>
      </div>

      {/* Add column form */}
      {showColForm && canEdit && (
        <div className={styles.executionConfigPanel}>
          {insertColAfterOrder !== null && (
            <span style={{ fontSize: 11, color: 'var(--color-tan)', whiteSpace: 'nowrap' }}>After col {insertColAfterOrder}</span>
          )}
          <input placeholder="Column name" value={newColName} onChange={e => setNewColName(e.target.value)} style={{ ...inputSm, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addColumn(insertColAfterOrder ?? undefined)} />
          <select value={newColKind} onChange={e => setNewColKind(e.target.value)} style={{ ...inputSm, appearance: 'none' as const }}>
            {COLUMN_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <button onClick={() => addColumn(insertColAfterOrder ?? undefined)} disabled={!newColName.trim() || saving} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--color-ink)', color: '#FBF8F2', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Add</button>
          <button onClick={() => { setShowColForm(false); setInsertColAfterOrder(null); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-line)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Add section form */}
      {showSectionForm && canEdit && (
        <div className={styles.executionConfigPanel}>
          <input placeholder="Section name" value={newSectionName} onChange={e => setNewSectionName(e.target.value)} style={{ ...inputSm, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addSection()} />
          <button onClick={addSection} disabled={!newSectionName.trim() || saving} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--color-ink)', color: '#FBF8F2', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Add</button>
          <button onClick={() => setShowSectionForm(false)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-line)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {sortedCols.length === 0 && canEdit ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-tan)', fontSize: 13, border: '1px dashed var(--color-line)', borderRadius: 12 }}>
          No columns yet — click &quot;+ Column&quot; to add one.
        </div>
      ) : (
        <div className={styles.executionTableFrame}>
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.executionTable}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  {sortedCols.map((col) => (
                    <th key={col.id} style={{ textAlign: col.column_kind === 'checkbox' ? 'center' : 'left', position: 'relative' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {col.name}
                        {showEdit && (
                          <button
                            onClick={() => { setInsertColAfterOrder(col.display_order); setShowColForm(true); setShowSectionForm(false) }}
                            style={{ padding: '1px 3px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-tan)', fontSize: 10, lineHeight: 1, flexShrink: 0 }}
                            title={`Insert column after "${col.name}"`}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          </button>
                        )}
                        {showEdit && col.column_kind !== 'serial' && (
                          <ConfirmPopover
                            title="Delete column?"
                            message={`"${col.name}" will be removed from this table. Existing cell data in this column is lost. This cannot be undone.`}
                            onConfirm={() => deleteColumn(col.id)}
                          >
                            {(open) => (
                              <button
                                onClick={open}
                                style={{ padding: '1px 3px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-rust)', fontSize: 10, lineHeight: 1, flexShrink: 0 }}
                                title={`Delete column "${col.name}"`}
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              </button>
                            )}
                          </ConfirmPopover>
                        )}
                      </span>
                    </th>
                  ))}
                  {canEdit && <th style={{ width: 56 }} />}
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <Fragment key={group.sectionId || 'unsectioned'}>
                    {group.sectionName && (
                      <tr key={`s-${group.sectionId}`}>
                        <td colSpan={sortedCols.length + (canEdit ? 2 : 1)} className={styles.executionSectionRow}>
                          {group.sectionName}
                          {showEdit && (
                            <button onClick={() => onAddRow(table.id, group.sectionId)} style={{ marginLeft: 10, fontSize: 10, color: 'var(--color-tan)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>+ row</button>
                          )}
                        </td>
                      </tr>
                    )}
                    {group.rows.map((row, ri) => {
                      const draft = getDraft(row.id, row)
                      return (
                        <tr key={row.id}>
                          <td className={styles.executionIndexCell}>{ri + 1}</td>
                          {sortedCols.map(col => (
                            <td key={col.id} style={{ padding: col.column_kind === 'checkbox' ? '10px 12px' : '6px 8px', textAlign: col.column_kind === 'checkbox' ? 'center' : 'left' }}>
                              {canEdit ? (
                                <div onBlur={() => flushDraft(row.id)}>
                                  <CellInput col={col} value={draft[col.id]} onChange={v => setCellDraft(row.id, row, col.id, v)} />
                                </div>
                              ) : (
                                col.column_kind === 'checkbox' ? (
                                  <div style={{ width: 18, height: 18, borderRadius: 4, margin: '0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${!!draft[col.id] ? 'var(--color-forest)' : 'var(--color-line)'}`, background: !!draft[col.id] ? 'var(--color-forest)' : 'transparent' }}>
                                    {!!draft[col.id] && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 12, fontFamily: col.column_kind === 'revision_text' ? 'var(--font-mono)' : 'inherit' }}>
                                    {draft[col.id] !== undefined && draft[col.id] !== null && draft[col.id] !== '' ? String(draft[col.id]) : <span style={{ color: 'var(--color-tan)' }}>—</span>}
                                  </span>
                                )
                              )}
                            </td>
                          ))}
                          {canEdit && (
                            <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {showEdit && (
                                <>
                                  <button
                                    onClick={() => onInsertRowAfter(table.id, row.section_id, row.display_order)}
                                    style={{ padding: '3px 5px', borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-tan)' }}
                                    title="Insert row below"
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                  </button>
                                  <button onClick={() => onDeleteRow(table.id, row.id)} style={{ padding: '3px 5px', borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-tan)' }} title="Delete row">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                  </button>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={sortedCols.length + (canEdit ? 2 : 1)} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--color-tan)', fontSize: 12, fontStyle: 'italic' }}>
                      No rows yet.{canEdit && ' Click the pencil to enable editing.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function SiteEngineersTable({ siteEngineers, projectId }: { siteEngineers: Assignment[]; projectId: string }) {
  return (
    <div className={styles.executionCard}>
      <div className={styles.executionTableHeader}>
        <div>
          <div className={styles.executionTableTitle}>Site Engineers</div>
          <div className={styles.executionTableSubtitle}>
            Linked team for the site engineers dashboard
          </div>
        </div>
        <Link href={`/site?project=${projectId}`} className={styles.executionPrimaryBtn}>
          Open Site Dashboard
        </Link>
      </div>

      <div className={styles.executionTableFrame}>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.executionTable}>
            <thead>
              <tr>
                <th>Engineer</th>
                <th>Project Role</th>
                <th style={{ textAlign: 'center' }}>Allocation</th>
                <th>Dashboard Link</th>
              </tr>
            </thead>
            <tbody>
              {siteEngineers.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.executionEmptyCell}>
                    No site engineers assigned to this project yet.
                  </td>
                </tr>
              ) : (
                siteEngineers.map((assignment, index) => {
                  const person = assignment.users
                  const name = person?.full_name ?? 'Unknown'
                  return (
                    <tr key={assignment.id}>
                      <td>
                        <div className={styles.siteEngineerCell}>
                          <Avatar initials={initials(name)} tone={index % 2 === 0 ? 'amber' : 'teal'} size={30} />
                          <div>
                            <div className={styles.siteEngineerName}>{name}</div>
                            <div className={styles.siteEngineerRole}>{person?.role ? roleLabel(person.role) : 'Site Engineer'}</div>
                          </div>
                        </div>
                      </td>
                      <td>{roleLabel(assignment.role_on_project)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={styles.executionMono}>{assignment.contribution_pct ?? '—'}{assignment.contribution_pct !== null ? '%' : ''}</span>
                      </td>
                      <td>
                        <Link href={`/site?project=${projectId}`} className={styles.executionTextLink}>
                          Site dashboard
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function ProjectTablesSection({ projectId, initialTables, canEdit, siteEngineers }: Props) {
  const [tables, setTables] = useState(initialTables)
  const [showNewTable, setShowNewTable] = useState(false)
  const [newTableMode, setNewTableMode] = useState<'preset' | 'custom'>('preset')
  const [newTableName, setNewTableName] = useState('')
  const [newTableRole, setNewTableRole] = useState('team_member')
  const [tablePresets, setTablePresets] = useState<TablePresetOption[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetsLoaded, setPresetsLoaded] = useState(false)
  const [creating, setCreating] = useState(false)

  const refreshTables = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/tables`)
    if (res.ok) setTables(await res.json())
  }, [projectId])

  const addRow = useCallback(async (tableId: string, sectionId: string | null) => {
    const res = await fetch(`/api/projects/${projectId}/tables/${tableId}/rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_id: sectionId, cells: {} }),
    })
    if (res.ok) await refreshTables()
  }, [projectId, refreshTables])

  const insertRowAfter = useCallback(async (tableId: string, sectionId: string | null, afterDisplayOrder: number) => {
    const res = await fetch(`/api/projects/${projectId}/tables/${tableId}/rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_id: sectionId, cells: {}, display_order: afterDisplayOrder + 0.5 }),
    })
    if (res.ok) await refreshTables()
  }, [projectId, refreshTables])

  const updateRow = useCallback(async (tableId: string, rowId: string, cells: Record<string, unknown>) => {
    await fetch(`/api/projects/${projectId}/tables/${tableId}/rows/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cells }),
    })
    setTables(prev => prev.map(t => t.id !== tableId ? t : {
      ...t,
      project_table_rows: t.project_table_rows.map(r => r.id !== rowId ? r : { ...r, cells }),
    }))
  }, [projectId])

  const deleteRow = useCallback(async (tableId: string, rowId: string) => {
    if (!confirm('Delete this row?')) return
    await fetch(`/api/projects/${projectId}/tables/${tableId}/rows/${rowId}`, { method: 'DELETE' })
    setTables(prev => prev.map(t => t.id !== tableId ? t : {
      ...t,
      project_table_rows: t.project_table_rows.filter(r => r.id !== rowId),
    }))
  }, [projectId])

  const deleteTable = useCallback(async (tableId: string) => {
    const res = await fetch(`/api/projects/${projectId}/tables/${tableId}`, { method: 'DELETE' })
    if (res.ok) {
      setTables(prev => prev.filter(t => t.id !== tableId))
    }
  }, [projectId])

  async function openNewTable() {
    setShowNewTable(v => !v)
    if (!presetsLoaded) {
      const res = await fetch('/api/table-presets')
      if (res.ok) {
        const data = await res.json()
        const presets = data.presets ?? []
        setTablePresets(presets)
        setSelectedPresetId(presets[0]?.id ?? '')
      }
      setPresetsLoaded(true)
    }
  }

  async function createTable() {
    const preset = tablePresets.find(p => p.id === selectedPresetId)
    const tableName = newTableMode === 'preset' ? preset?.name ?? '' : newTableName.trim()
    const tableRole = newTableMode === 'preset' ? preset?.table_owner_role ?? 'team_member' : newTableRole
    if (!tableName) return
    setCreating(true)
    const res = await fetch(`/api/projects/${projectId}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tableName,
        table_owner_role: tableRole,
        description: preset?.description ?? undefined,
        preset_id: newTableMode === 'preset' ? selectedPresetId : undefined,
      }),
    })
    if (res.ok) {
      await refreshTables()
      setNewTableName(''); setShowNewTable(false); setNewTableMode('preset')
    }
    setCreating(false)
  }

  const inputSm: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 9, border: '1px solid var(--color-line)',
    background: 'var(--color-paper-light)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  const drawingTable = tables.find(t => t.name.toLowerCase().includes('drawing register'))
  const orderedTables = drawingTable
    ? [drawingTable, ...tables.filter(t => t.id !== drawingTable.id)]
    : tables
  const remainingTables = drawingTable ? orderedTables.slice(1) : orderedTables
  const tableCount = tables.length

  return (
    <section className={styles.executionSection}>
      <div className={styles.executionSectionHeader}>
        <div className={`font-serif ${styles.executionSectionTitle}`}>Execution Tables</div>
        <Chip label={`${tableCount} tables`} tone="teal" dot />
        {canEdit && (
          <button
            onClick={openNewTable}
            className={showNewTable ? styles.executionGhostBtn : styles.executionPrimaryBtn}
          >
            {showNewTable ? 'Cancel' : '+ New Table'}
          </button>
        )}
      </div>

      {showNewTable && canEdit && (
        <div className={styles.executionConfigPanel} style={{ marginBottom: 20, alignItems: 'stretch' }}>
          <select value={newTableMode} onChange={e => setNewTableMode(e.target.value as 'preset' | 'custom')} style={{ ...inputSm, appearance: 'none' as const }}>
            <option value="preset">Preset</option>
            <option value="custom">Custom</option>
          </select>
          {newTableMode === 'preset' ? (
            <select value={selectedPresetId} onChange={e => setSelectedPresetId(e.target.value)} style={{ ...inputSm, flex: 1, appearance: 'none' as const }}>
              {tablePresets.length === 0 ? (
                <option value="">No presets available</option>
              ) : tablePresets.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.table_owner_role.replace(/_/g, ' ')} · {p.table_preset_columns.length} cols
                </option>
              ))}
            </select>
          ) : (
            <>
              <input placeholder="Table name (e.g. Drawing Register)" value={newTableName} onChange={e => setNewTableName(e.target.value)} style={{ ...inputSm, flex: 1 }} onKeyDown={e => e.key === 'Enter' && createTable()} />
              <select value={newTableRole} onChange={e => setNewTableRole(e.target.value)} style={{ ...inputSm, appearance: 'none' as const }}>
                <option value="team_member">Team Member</option>
                <option value="site_engineer">Site Engineer</option>
              </select>
            </>
          )}
          <button onClick={createTable} disabled={(newTableMode === 'preset' ? !selectedPresetId : !newTableName.trim()) || creating} style={{ padding: '8px 16px', borderRadius: 9, background: 'var(--color-ink)', color: '#FBF8F2', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Create</button>
        </div>
      )}

      <div className={styles.executionStack}>
        {drawingTable ? (
          <TableView
            table={drawingTable}
            canEdit={canEdit}
            projectId={projectId}
            onAddRow={addRow}
            onInsertRowAfter={insertRowAfter}
            onUpdateRow={updateRow}
            onDeleteRow={deleteRow}
            onDeleteTable={deleteTable}
            onTableUpdated={refreshTables}
          />
        ) : tables.length === 0 && !showNewTable ? (
          <div className={styles.executionCard}>
            <p style={{ color: 'var(--color-tan)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>
              No execution tables yet.{canEdit && ' Click "+ New Table" to create one.'}
            </p>
          </div>
        ) : null}

        {remainingTables.map(table => (
          <TableView
            key={table.id}
            table={table}
            canEdit={canEdit}
            projectId={projectId}
            onAddRow={addRow}
            onInsertRowAfter={insertRowAfter}
            onUpdateRow={updateRow}
            onDeleteRow={deleteRow}
            onDeleteTable={deleteTable}
            onTableUpdated={refreshTables}
          />
        ))}
      </div>
    </section>
  )
}
