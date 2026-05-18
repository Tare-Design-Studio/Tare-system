import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BroadcastSchema = z.object({
  body: z.string().min(1).max(2000),
  attachment_url: z.string().url().optional(),
  recipient_ids: z.array(z.string().uuid()).min(1),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 100);

  // Returns broadcasts authored by me OR targeted at me
  const { data, error } = await supabase
    .from("owner_broadcasts")
    .select(`
      id, body, attachment_url, created_at, edited_at,
      users:author_id (id, full_name),
      owner_broadcast_recipients (user_id, is_acknowledged, acknowledged_at,
        users:user_id (id, full_name))
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ broadcasts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = BroadcastSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { recipient_ids, ...broadcastFields } = parsed.data;

  const { data: broadcast, error: bErr } = await supabase
    .from("owner_broadcasts")
    .insert({ author_id: user.id, tenant_id: profile.tenant_id, ...broadcastFields })
    .select("id")
    .single();

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  const { error: rErr } = await supabase
    .from("owner_broadcast_recipients")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(recipient_ids.map(uid => ({ broadcast_id: broadcast.id, user_id: uid })) as any);

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({ id: broadcast.id }, { status: 201 });
}
