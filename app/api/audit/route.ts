import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "audit_log:view" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const actor = searchParams.get("actor_id");
  const resource = searchParams.get("resource_type");
  const action = searchParams.get("action");
  const from = searchParams.get("from");  // ISO date
  const to = searchParams.get("to");      // ISO date
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("audit_log")
    .select(`
      id, action, resource_type, resource_id,
      before, after, ip_address, user_agent, request_id,
      prev_hash, row_hash, occurred_at,
      actor:actor_id(id, full_name)
    `, { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actor) query = query.eq("actor_id", actor);
  if (resource) query = query.eq("resource_type", resource);
  if (action) query = query.eq("action", action);
  if (from) query = query.gte("occurred_at", from);
  if (to) query = query.lte("occurred_at", to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data ?? [],
    meta: { total: count ?? 0, page, limit },
  });
}
