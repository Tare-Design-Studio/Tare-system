import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string; tableId: string; columnId: string }> }

// DELETE /api/projects/[id]/tables/[tableId]/columns/[columnId]
// Hard-deletes the column and shifts later columns down to close the gap.
// Orphaned cell values keyed by this column id remain in row JSONB but are
// never rendered.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { tableId, columnId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'project_table:edit' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('delete_table_column', {
    p_table_id: tableId,
    p_column_id: columnId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
