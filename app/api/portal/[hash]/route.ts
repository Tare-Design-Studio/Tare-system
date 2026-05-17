import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

// GET /api/portal/[hash]
// Public endpoint — no auth required.
// Calls get_customer_portal() then converts storage_path → signed/public URLs.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const headersList = await headers()
  const ip = headersList.get('x-real-ip') ?? headersList.get('x-forwarded-for') ?? null
  const ua = headersList.get('user-agent') ?? null
  const reqId = headersList.get('x-request-id') ?? null

  const { hash } = await params
  if (!hash || hash.length !== 16) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_customer_portal', {
    p_hash: hash,
    p_ip: ip ?? undefined,
    p_user_agent: ua ?? undefined,
    p_request_id: reqId ?? undefined,
  })

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Cast to mutable object for URL post-processing
  type RawImage = { id: string; storage_path: string; bucket: string; kind: string; taken_at: string }
  const payload = data as unknown as { images?: RawImage[] }

  // Sign storage URLs — raw paths never reach the browser
  if (Array.isArray(payload.images) && payload.images.length > 0) {
    payload.images = await Promise.all(
      payload.images.map(async (img) => {
        if (img.bucket === 'media-customer-public') {
          const { data: pub } = supabase.storage
            .from(img.bucket)
            .getPublicUrl(img.storage_path)
          return { id: img.id, url: pub.publicUrl, kind: img.kind, taken_at: img.taken_at } as unknown as RawImage
        }
        const { data: signed } = await supabase.storage
          .from(img.bucket)
          .createSignedUrl(img.storage_path, 600)
        return { id: img.id, url: signed?.signedUrl ?? null, kind: img.kind, taken_at: img.taken_at } as unknown as RawImage
      })
    )
  }

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
