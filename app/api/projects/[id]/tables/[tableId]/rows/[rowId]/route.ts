import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── Per-table role gating helper (B3) ────────────────────────────────
async function checkTableWriteAccess(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  tableId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (!profile) return { allowed: false, reason: 'User not found' }
  if (profile.role === 'owner') return { allowed: true }

  const { data: isPM } = await supabase.rpc('has_member_tag', { p_tag: 'project_manager' })
  if (isPM) return { allowed: true }

  const { data: table } = await supabase
    .from('project_tables')
    .select('table_owner_role')
    .eq('id', tableId)
    .single()

  if (!table) return { allowed: false, reason: 'Table not found' }

  if (table.table_owner_role === 'team_member') {
    if (profile.role === 'site_engineer') return { allowed: false, reason: 'Site engineers cannot edit the Drawing Register table' }
  }
  if (table.table_owner_role === 'site_engineer') {
    if (profile.role === 'team_member') return { allowed: false, reason: 'Team members cannot edit the Site Execution table' }
  }

  return { allowed: true }
}

// PATCH /api/projects/[id]/tables/[tableId]/rows/[rowId]
// Body: { cells?, section_id?, display_order? }
// The revision trigger fires automatically on the DB side when cells changes.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string; rowId: string }> }
) {
  const { tableId, rowId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'project_table:edit' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Per-role table gating (B3)
  const access = await checkTableWriteAccess(supabase, user.id, tableId)
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { updated_by: user.id, updated_at: new Date().toISOString() }
  if (body.cells !== undefined)         patch.cells = body.cells
  if (body.section_id !== undefined)    patch.section_id = body.section_id
  if (body.display_order !== undefined) patch.display_order = body.display_order

  const { data, error } = await supabase
    .from('project_table_rows')
    .update(patch)
    .eq('id', rowId)
    .eq('project_table_id', tableId)
    .is('deleted_at', null)
    .select('id, section_id, display_order, cells, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/projects/[id]/tables/[tableId]/rows/[rowId] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string; rowId: string }> }
) {
  const { tableId, rowId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'project_table:edit' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Per-role table gating (B3)
  const access = await checkTableWriteAccess(supabase, user.id, tableId)
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('project_table_rows')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', rowId)
    .eq('project_table_id', tableId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
