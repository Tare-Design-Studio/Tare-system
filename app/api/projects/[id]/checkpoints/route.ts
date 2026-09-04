import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Insert a progress milestone anywhere in the list. after_order is the
// sequence_order to insert AFTER; 0 puts the new milestone first. The push-down
// and resequence happen inside insert_project_checkpoint_at (migration 123).
const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  due_date: z.string().min(1),
  after_order: z.number().int().min(0).default(0),
  requires_approval: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS scopes this to the caller's tenant; no extra capability gate — the
  // project page already renders these rows to anyone who can open it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_checkpoints')
    .select('id, name, sequence_order, due_date, started_at, completed_at, requires_approval, approved_at, remarks, completion_percentage')
    .eq('project_id', projectId)
    .order('sequence_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ checkpoints: data ?? [] })
}

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
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, due_date, after_order, requires_approval } = parsed.data

  const { data, error } = await supabase.rpc('insert_project_checkpoint_at', {
    p_project_id: projectId,
    p_after_order: after_order,
    p_name: name,
    p_due_date: due_date,
    p_requires_approval: requires_approval ?? false,
  })

  if (error) {
    const notFound = error.message?.includes('not found')
    return NextResponse.json({ error: error.message }, { status: notFound ? 404 : 500 })
  }

  return NextResponse.json({ checkpoint_id: data })
}
