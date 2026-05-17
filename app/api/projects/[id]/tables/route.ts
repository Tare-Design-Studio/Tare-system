import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const CreateTableSchema = z.object({
  name: z.string().min(1).max(200),
  table_owner_role: z.enum(['team_member', 'site_engineer']),
  description: z.string().max(1000).optional().nullable(),
  preset_id: z.string().uuid().optional().nullable(),
})

// GET /api/projects/[id]/tables
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('project_tables')
    .select(`
      id, name, table_owner_role, description, source_preset_id, display_order, created_at,
      project_table_columns (id, name, column_kind, display_order, is_required),
      project_table_sections (id, name, display_order),
      project_table_rows (id, section_id, display_order, cells, created_at, updated_at, updated_by)
    `)
    .eq('project_id', id)
    .is('deleted_at', null)
    .order('display_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/projects/[id]/tables
// Body: { name, table_owner_role, description?, preset_id? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'project_table:create' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = CreateTableSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
  }
  const { name, table_owner_role, description, preset_id } = parsed.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: table, error } = await (supabase as any)
    .from('project_tables')
    .insert({
      project_id: id,
      name,
      table_owner_role,
      description: description ?? null,
      source_preset_id: preset_id ?? null,
      created_by: user.id,
    })
    .select('id, name, table_owner_role, description, display_order, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (preset_id && table) {
    const [{ data: presetCols }, { data: presetSections }, { data: presetRows }] = await Promise.all([
      supabase.from('table_preset_columns').select('*').eq('preset_id', preset_id).order('display_order'),
      supabase.from('table_preset_sections').select('*').eq('preset_id', preset_id).order('display_order'),
      supabase.from('table_preset_rows').select('*').eq('preset_id', preset_id).order('display_order'),
    ])

    const colInserts = (presetCols ?? []).map((c) => ({
      project_table_id: table.id,
      name: c.name,
      column_kind: c.column_kind,
      display_order: c.display_order,
      is_required: c.is_required,
    }))
    const sectionInserts = (presetSections ?? []).map((s) => ({
      project_table_id: table.id,
      name: s.name,
      display_order: s.display_order,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [{ data: createdSections }] = await Promise.all([
      sectionInserts.length > 0 ? db.from('project_table_sections').insert(sectionInserts).select('id, display_order') : Promise.resolve({ data: [] }),
      colInserts.length > 0 ? db.from('project_table_columns').insert(colInserts) : Promise.resolve(),
    ])

    const sectionByOrder = new Map((createdSections ?? []).map((s: { id: string; display_order: number }) => [s.display_order, s.id]))
    const presetSectionById = new Map((presetSections ?? []).map((s) => [s.id, s.display_order]))
    const rowInserts = (presetRows ?? []).map((r) => ({
      project_table_id: table.id,
      section_id: r.section_id ? sectionByOrder.get(presetSectionById.get(r.section_id) ?? -1) ?? null : null,
      display_order: r.display_order,
      cells: r.cells ?? {},
    }))
    if (rowInserts.length > 0) await db.from('project_table_rows').insert(rowInserts)
  }

  return NextResponse.json(table, { status: 201 })
}
