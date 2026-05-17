import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── Per-table role gating helper (B3) ────────────────────────────────
// Reads the table's table_owner_role and the user's role + tags.
// Owner and PM bypass all role gates.
async function checkTableWriteAccess(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  tableId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Fetch user role
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (!profile) return { allowed: false, reason: 'User not found' }

  // Owner bypasses everything
  if (profile.role === 'owner') return { allowed: true }

  // Check for project_manager tag (PM bypasses)
  const { data: isPM } = await supabase.rpc('has_member_tag', { p_tag: 'project_manager' })
  if (isPM) return { allowed: true }

  // Fetch the table's owner role
  const { data: table } = await supabase
    .from('project_tables')
    .select('table_owner_role')
    .eq('id', tableId)
    .single()

  if (!table) return { allowed: false, reason: 'Table not found' }

  const tableOwnerRole = table.table_owner_role

  // Role-based gating
  if (tableOwnerRole === 'team_member') {
    // Drawing Register: allow team_member, deny site_engineer
    if (profile.role === 'team_member') return { allowed: true }
    if (profile.role === 'site_engineer') return { allowed: false, reason: 'Site engineers cannot edit the Drawing Register table' }
  }

  if (tableOwnerRole === 'site_engineer') {
    // Site Execution: allow site_engineer, deny team_member
    if (profile.role === 'site_engineer') return { allowed: true }
    if (profile.role === 'team_member') return { allowed: false, reason: 'Team members cannot edit the Site Execution table' }
  }

  // Default: if they have the base capability, allow
  return { allowed: true }
}

// GET /api/projects/[id]/tables/[tableId]/rows
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { tableId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('project_table_rows')
    .select('id, section_id, display_order, cells, created_at, updated_at, updated_by')
    .eq('project_table_id', tableId)
    .is('deleted_at', null)
    .order('display_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/projects/[id]/tables/[tableId]/rows
// Body: { section_id?, display_order?, cells? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { tableId } = await params
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

  let displayOrder = body.display_order
  if (displayOrder === undefined) {
    const { data: last } = await supabase
      .from('project_table_rows')
      .select('display_order')
      .eq('project_table_id', tableId)
      .is('deleted_at', null)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()
    displayOrder = (last?.display_order ?? 0) + 1
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_table_rows')
    .insert({
      project_table_id: tableId,
      section_id: body.section_id ?? null,
      display_order: displayOrder,
      cells: body.cells ?? {},
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id, section_id, display_order, cells, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
