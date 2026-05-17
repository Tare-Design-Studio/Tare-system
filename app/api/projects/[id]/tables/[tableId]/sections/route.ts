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
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('project_table_sections')
    .select('display_order')
    .eq('project_table_id', tableId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const display_order = (existing?.display_order ?? 0) + 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('project_table_sections')
    .insert({ project_table_id: tableId, name, display_order })
    .select('id, name, display_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
