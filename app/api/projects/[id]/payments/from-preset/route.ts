import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const FromPresetSchema = z.object({
  preset_id: z.string().uuid(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: canCreate } = await supabase.rpc('has_capability', {
    p_capability: 'customer_payments:create_schedule',
  })
  if (!canCreate) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = FromPresetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Fetch project budget
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, budget_total')
    .eq('id', projectId)
    .is('deleted_at', null)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (!project.budget_total || Number(project.budget_total) <= 0) {
    return NextResponse.json({ error: 'Project budget must be set before applying a payment preset' }, { status: 400 })
  }

  // Fetch preset items (table added by migration 046 — types not yet regenerated)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items, error: itemsErr } = await (supabase as any)
    .from('payment_milestone_preset_items')
    .select('milestone_name, percentage, sequence_order, notes')
    .eq('preset_id', parsed.data.preset_id)
    .order('sequence_order')

  if (itemsErr || !items || items.length === 0) {
    return NextResponse.json({ error: 'Preset not found or has no milestones' }, { status: 404 })
  }

  const budget = Number(project.budget_total)

  const { data: existingOrders, error: ordersErr } = await supabase
    .from('payment_schedule')
    .select('sequence_order')
    .eq('project_id', projectId)
    .order('sequence_order')

  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 })
  }

  const orderOffset = Math.max(0, ...((existingOrders ?? []).map(row => row.sequence_order)))

  // Create payment_schedule rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = items.map((item: any) => ({
    project_id: projectId,
    milestone_name: item.milestone_name,
    amount_due: Math.round((item.percentage / 100) * budget * 100) / 100,
    due_date: new Date().toISOString().split('T')[0], // default to today; user can edit later
    sequence_order: orderOffset + item.sequence_order,
    notes: item.notes,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error: insertErr } = await (supabase as any)
    .from('payment_schedule')
    .insert(rows)
    .select('id, milestone_name, amount_due, due_date, sequence_order')

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Track the source preset on the project (column added by migration 046)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('projects')
    .update({ source_payment_preset_id: parsed.data.preset_id })
    .eq('id', projectId)

  return NextResponse.json({ schedules: created }, { status: 201 })
}
