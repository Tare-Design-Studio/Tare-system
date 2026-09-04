import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const ActionSchema = z.object({
  action: z.enum(['start', 'complete', 'reset', 'edit_details']),
  name: z.string().min(1).max(200).optional(),
  remarks: z.string().optional().nullable(),
  completion_percentage: z.number().min(0).max(100).optional().nullable(),
  due_date: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
})

type Ctx = { params: Promise<{ id: string; checkpointId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: projectId, checkpointId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { action, name, remarks, completion_percentage, due_date, completed_at } = parsed.data

  const [{ data: canProgress }, { data: canEditProject }] = await Promise.all([
    supabase.rpc('has_capability', { p_capability: 'checkpoint:progress' }),
    supabase.rpc('has_capability', { p_capability: 'project:edit' }),
  ])

  if (!canEditProject && !canProgress) {
    return NextResponse.json({ error: 'Forbidden — requires project:edit or checkpoint:progress capability' }, { status: 403 })
  }

  // Fetch current checkpoint
  // Note: started_at column added by migration 043; types will be regenerated after apply.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: checkpoint, error: fetchErr } = await (supabase as any)
    .from('project_checkpoints')
    .select('id, project_id, sequence_order, started_at, approved_at, completed_at, due_date, remarks, completion_percentage')
    .eq('id', checkpointId)
    .eq('project_id', projectId)
    .single()

  if (fetchErr || !checkpoint) {
    return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let update: Record<string, any> = {}

  if (action === 'start') {
    if (checkpoint.started_at) {
      return NextResponse.json({ error: 'Checkpoint already started' }, { status: 400 })
    }
    if (checkpoint.approved_at) {
      return NextResponse.json({ error: 'Checkpoint already completed' }, { status: 400 })
    }
    update = { started_at: new Date().toISOString() }
  } else if (action === 'complete') {
    if (checkpoint.approved_at) {
      return NextResponse.json({ error: 'Checkpoint already completed' }, { status: 400 })
    }
    update = {
      started_at: checkpoint.started_at ?? new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      completed_at: new Date().toISOString(),
      completion_percentage: 100,
    }
  } else if (action === 'reset') {
    // Only owner or PM can reset — capability already checked above
    update = { started_at: null, approved_at: null, approved_by: null, completed_at: null }
  } else if (action === 'edit_details') {
    // Renaming is a project-structure edit, not progress reporting, so it needs
    // project:edit even when the caller only has checkpoint:progress.
    if (name !== undefined) {
      if (!canEditProject) {
        return NextResponse.json({ error: 'Forbidden — renaming requires project:edit capability' }, { status: 403 })
      }
      update.name = name.trim();
    }
    if (remarks !== undefined) update.remarks = remarks;
    if (completion_percentage !== undefined) update.completion_percentage = completion_percentage;
    if (due_date !== undefined) update.due_date = due_date;
    if (completed_at !== undefined) update.completed_at = completed_at;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_checkpoints')
    .update(update)
    .eq('id', checkpointId)
    .eq('project_id', projectId)
    .select('id, name, sequence_order, started_at, approved_at, completed_at, due_date, remarks, completion_percentage')
    .single()

  if (error) {
    // The DB trigger will raise exceptions for sequencing violations
    const msg = error.message || 'Update failed'
    const isSequenceError = msg.includes('Cannot start checkpoint') || msg.includes('Cannot complete checkpoint')
    return NextResponse.json(
      { error: msg },
      { status: isSequenceError ? 400 : 500 }
    )
  }

  return NextResponse.json({ checkpoint: data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id: projectId, checkpointId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Removing a milestone changes the project's structure, so unlike PATCH this
  // requires project:edit — checkpoint:progress alone is not enough.
  const { data: canEditProject } = await supabase.rpc('has_capability', { p_capability: 'project:edit' })
  if (!canEditProject) {
    return NextResponse.json({ error: 'Forbidden — requires project:edit capability' }, { status: 403 })
  }

  // Hard delete + resequence in one transaction (migration 123).
  const { error } = await supabase.rpc('delete_project_checkpoint', {
    p_project_id: projectId,
    p_checkpoint_id: checkpointId,
  })

  if (error) {
    const notFound = error.message?.includes('not found')
    return NextResponse.json({ error: error.message }, { status: notFound ? 404 : 500 })
  }

  return NextResponse.json({ ok: true })
}
