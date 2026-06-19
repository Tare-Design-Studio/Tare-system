import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { headers } from 'next/headers'

// Brute-force budget for the public portal: a 16-char hash is the only gate,
// so cap guesses per IP. 60 hits / 60s is generous for a real customer
// (a portal page makes a handful of calls) but kills an enumeration sweep.
const PORTAL_RATE_LIMIT = 60
const PORTAL_RATE_WINDOW_SECONDS = 60

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

  // IP-based rate limit BEFORE any lookup — reuses the existing
  // public_rate_limit_hit() fixed-window limiter (migration 025). The function
  // is REVOKE FROM PUBLIC, so it must be called via the service client.
  // Fail-open on limiter error (don't let a limiter blip 500 a real customer),
  // but a missing IP is treated as one shared bucket.
  const service = createServiceClient()
  const { data: hitCount, error: rlError } = await service.rpc('public_rate_limit_hit', {
    // tenant is unknown before the hash lookup; the SQL function accepts NULL.
    // The generated types mark it non-null, so cast just this arg object.
    p_tenant_id: null,
    p_kind: 'portal_view',
    p_identifier: ip ?? 'unknown',
    p_window_seconds: PORTAL_RATE_WINDOW_SECONDS,
  } as unknown as { p_tenant_id: string; p_kind: string; p_identifier: string; p_window_seconds: number })
  if (!rlError && typeof hitCount === 'number' && hitCount > PORTAL_RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(PORTAL_RATE_WINDOW_SECONDS) } }
    )
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
