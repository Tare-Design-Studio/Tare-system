import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string; tableId: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { tableId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'project_table:edit' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const name: string = (body.name ?? '').trim()
  const column_kind: string = body.column_kind ?? 'text'
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const insertAfterOrder: number | undefined = typeof body.insert_after_order === 'number' ? body.insert_after_order : undefined

  // Auto display_order
  const { data: existing } = await supabase
    .from('project_table_columns')
    .select('display_order')
    .eq('project_table_id', tableId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const display_order = insertAfterOrder !== undefined
    ? insertAfterOrder + 1
    : (existing?.display_order ?? 0) + 1

  // Open a slot: shift later columns up so display_order stays unique.
  if (insertAfterOrder !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: shiftError } = await (supabase as any).rpc('shift_table_columns_after', {
      p_table_id: tableId,
      p_after_order: insertAfterOrder,
    })
    if (shiftError) return NextResponse.json({ error: shiftError.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_table_columns')
    .insert({ project_table_id: tableId, name, column_kind, display_order })
    .select('id, name, column_kind, display_order, is_required')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
