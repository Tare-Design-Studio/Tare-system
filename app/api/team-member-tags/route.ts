import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_TAGS = ["accountant", "admin", "project_manager"] as const;
type Tag = (typeof VALID_TAGS)[number];

// Caller's tenant, derived server-side from the session (never trusted from input).
async function callerTenantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", userId)
    .is("deleted_at", null)
    .single();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
}

// GET /api/team-member-tags?user_id=...   (omit to list all in tenant)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: "team_member_tags:manage" });
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = await callerTenantId(supabase, user.id);
  if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = req.nextUrl.searchParams.get("user_id");
  let q = supabase
    .from("team_member_tags")
    .select("id, user_id, tag, granted_at, granted_by")
    .eq("tenant_id", tenantId);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/team-member-tags   body: { user_id, tag }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: "team_member_tags:manage" });
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { user_id, tag } = body as { user_id?: string; tag?: Tag };

  if (!user_id || !tag || !VALID_TAGS.includes(tag)) {
    return NextResponse.json({ error: "Invalid user_id or tag" }, { status: 400 });
  }

  // Target user must belong to the caller's tenant (prevents cross-tenant grants).
  const tenantId = await callerTenantId(supabase, user.id);
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", user_id)
    .eq("tenant_id", tenantId ?? "")
    .single();
  if (!target) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("team_member_tags")
    .insert({ user_id, tag, granted_by: user.id })
    .select("id, user_id, tag, granted_at, granted_by")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/team-member-tags?user_id=...&tag=...
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: "team_member_tags:manage" });
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = req.nextUrl.searchParams.get("user_id");
  const tag = req.nextUrl.searchParams.get("tag") as Tag | null;
  if (!userId || !tag || !VALID_TAGS.includes(tag)) {
    return NextResponse.json({ error: "Invalid user_id or tag" }, { status: 400 });
  }

  const tenantId = await callerTenantId(supabase, user.id);
  if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("team_member_tags")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("tag", tag);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
