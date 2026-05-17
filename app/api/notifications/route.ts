import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);

  let query = supabase
    .from("notification_recipients")
    .select(`
      id, is_read, read_at, is_acknowledged, acknowledged_at, push_delivered,
      notifications!notification_id (
        id, kind, severity, title, body, source_type, source_id, created_at
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "notifications", ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const unreadCount = unreadOnly
    ? data?.length ?? 0
    : (data?.filter(r => !r.is_read).length ?? 0);

  return NextResponse.json({ data, unread_count: unreadCount });
}

const PatchSchema = z.object({
  recipient_ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["mark_read", "acknowledge"]),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { recipient_ids, action } = parsed.data;

  const update =
    action === "mark_read"
      ? { is_read: true, read_at: new Date().toISOString() }
      : { is_acknowledged: true, acknowledged_at: new Date().toISOString() };

  const { error } = await supabase
    .from("notification_recipients")
    .update(update)
    .in("id", recipient_ids)
    .eq("user_id", user.id); // RLS double-lock

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
