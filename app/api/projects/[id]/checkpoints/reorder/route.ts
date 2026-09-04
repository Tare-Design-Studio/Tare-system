import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Move one progress milestone to a position in the project's list. The whole
// renumber happens inside reorder_project_checkpoint (migration 123) so the
// DEFERRABLE unique constraint on (project_id, sequence_order) is only ever
// violated transiently, within one statement.
const ReorderSchema = z.object({
  checkpoint_id: z.string().uuid(),
  // 0-based index in the project's list after removal of the moved row.
  target_index: z.number().int().min(0),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: canEditProject } = await supabase.rpc('has_capability', { p_capability: 'project:edit' })
  if (!canEditProject) {
    return NextResponse.json({ error: 'Forbidden — requires project:edit capability' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { checkpoint_id, target_index } = parsed.data

  const { error } = await supabase.rpc('reorder_project_checkpoint', {
    p_project_id: projectId,
    p_checkpoint_id: checkpoint_id,
    p_target_index: target_index,
  })

  if (error) {
    const notFound = error.message?.includes('not found')
    return NextResponse.json({ error: error.message }, { status: notFound ? 404 : 500 })
  }

  return NextResponse.json({ ok: true })
}
