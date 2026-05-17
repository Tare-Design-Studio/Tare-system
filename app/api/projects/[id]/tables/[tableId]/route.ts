import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/projects/[id]/tables/[tableId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'project_table:edit' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  if (!body.name && body.description === undefined && body.display_order === undefined) {
    return NextResponse.json({ error: 'No updatable fields' }, { status: 400 })
  }

  const patch: { name?: string; description?: string | null; display_order?: number } = {}
  if (body.name !== undefined)         patch.name = body.name
  if (body.description !== undefined)  patch.description = body.description
  if (body.display_order !== undefined) patch.display_order = body.display_order

  const { data, error } = await supabase
    .from('project_tables')
    .update(patch)
    .eq('id', tableId)
    .eq('project_id', id)
    .select('id, name, description, display_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/projects/[id]/tables/[tableId] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tableId: string }> }
) {
  const { id, tableId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'project_table:edit' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('project_tables')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', tableId)
    .eq('project_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
