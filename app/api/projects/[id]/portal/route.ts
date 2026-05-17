import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

// POST /api/projects/[id]/portal
// Body: { action: 'generate' | 'revoke' }
// Requires customer_portal:manage capability (Owner only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cap } = await supabase.rpc('has_capability', { p_capability: 'customer_portal:manage' })
  if (!cap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { action?: string }
  try { body = await req.json() } catch { body = {} }

  if (body.action === 'revoke') {
    const { error } = await supabase
      .from('projects')
      .update({
        customer_portal_hash: null,
        customer_portal_hash_generated_at: null,
        customer_portal_enabled: false,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ revoked: true })
  }

  // Generate a fresh 16-character URL-safe token
  const hash = randomBytes(12).toString('base64url').slice(0, 16)

  const { data: project, error } = await supabase
    .from('projects')
    .update({
      customer_portal_hash: hash,
      customer_portal_hash_generated_at: new Date().toISOString(),
      customer_portal_enabled: true,
    })
    .eq('id', id)
    .select('id, customer_portal_hash, customer_portal_hash_generated_at, customer_portal_enabled')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(project)
}
