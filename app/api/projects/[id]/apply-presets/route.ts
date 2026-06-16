import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Apply one or more presets to an EXISTING project (from the Edit Project modal).
// Mirrors the preset-application logic in POST /api/projects, but for a project
// that already exists. Each kind is optional; only the provided ones are applied.
const ApplyPresetsSchema = z.object({
  table_preset_ids: z.array(z.string().uuid()).optional(),
  pipeline_template_ids: z.array(z.string().uuid()).optional(),
  payment_preset_id: z.string().uuid().optional().nullable(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: canEdit } = await supabase.rpc('has_capability', { p_capability: 'project:edit' })
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = ApplyPresetsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 })
  }
  const { table_preset_ids, pipeline_template_ids, payment_preset_id } = parsed.data

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, budget_total, start_date')
    .eq('id', projectId)
    .is('deleted_at', null)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const applied = { checkpoints: 0, tables: 0, payments: 0 }

  // Progress timeline presets (checkpoint templates)
  for (const templateId of pipeline_template_ids ?? []) {
    const { error } = await supabase.rpc('apply_checkpoint_template', {
      p_project_id: projectId,
      p_template_id: templateId,
      p_start_date: project.start_date ?? new Date().toISOString().split('T')[0],
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    applied.checkpoints++
  }

  // Table presets (drawing register, site execution, etc.)
  for (const presetId of table_preset_ids ?? []) {
    const { error } = await supabase.rpc('apply_table_preset', {
      p_project_id: projectId,
      p_preset_id: presetId,
      p_created_by: user.id,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    applied.tables++
  }

  // Payment milestone preset (budget-scaled, appended after any existing schedule)
  if (payment_preset_id) {
    const budget = Number(project.budget_total ?? 0)
    if (budget <= 0) {
      return NextResponse.json({ error: 'Project budget must be set before applying a payment preset' }, { status: 400 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabase as any)
      .from('payment_milestone_preset_items')
      .select('milestone_name, percentage, sequence_order, notes')
      .eq('preset_id', payment_preset_id)
      .order('sequence_order')

    if (items && items.length > 0) {
      const { data: existingOrders } = await supabase
        .from('payment_schedule')
        .select('sequence_order')
        .eq('project_id', projectId)
      const orderOffset = Math.max(0, ...((existingOrders ?? []).map(r => r.sequence_order)))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = items.map((item: any) => ({
        project_id: projectId,
        milestone_name: item.milestone_name,
        amount_due: Math.round((item.percentage / 100) * budget * 100) / 100,
        due_date: new Date().toISOString().split('T')[0],
        sequence_order: orderOffset + item.sequence_order,
        notes: item.notes,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (supabase as any)
        .from('payment_schedule')
        .insert(rows)
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('projects')
        .update({ source_payment_preset_id: payment_preset_id })
        .eq('id', projectId)
      applied.payments = rows.length
    }
  }

  return NextResponse.json({ applied }, { status: 201 })
}
