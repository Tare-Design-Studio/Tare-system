import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Comp-off credits (103): weekend/holiday work that earns +1 leave day.
// Mirrors /api/leave — filing is self-service and always lands as 'pending';
// only an approver with leave:approve can turn it into entitlement.

const CreateSchema = z.object({
  work_date: z.string().date(),
  reason: z.string().trim().min(1).max(1000),
});

// GET /api/comp-off            → my credits
// GET /api/comp-off?scope=all  → everyone's (needs leave:view_all)
export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");
  const status = searchParams.get("status");

  let query = supabase
    .from("comp_off_credits")
    .select("id, user_id, work_date, days, reason, status, decided_by, decided_at, decision_note, created_at, users!comp_off_credits_user_id_fkey(full_name)")
    .order("work_date", { ascending: false })
    .limit(200);

  if (scope === "all") {
    const { data: can } = await supabase.rpc("has_capability", { p_capability: "leave:view_all" });
    if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    query = query.eq("user_id", user.id);
  }
  if (status) query = query.eq("status", status);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ credits: rows ?? [] });
}

// POST /api/comp-off — claim a worked non-working day for yourself.
export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { work_date, reason } = parsed.data;

  // A day that has not happened yet cannot have been worked.
  const today = new Date().toISOString().slice(0, 10);
  if (work_date > today) {
    return NextResponse.json({ error: "You cannot claim a future date" }, { status: 400 });
  }

  // tenant_id is stamped by set_comp_off_tenant (103); status is forced to
  // 'pending' by the insert policy, so neither is accepted from the client.
  const { data, error } = await supabase
    .from("comp_off_credits")
    .insert({ user_id: user.id, work_date, reason })
    .select()
    .single();

  if (error) {
    // comp_off_one_per_date — the same worked day cannot be banked twice.
    if (error.code === "23505") {
      return NextResponse.json({ error: "You have already claimed that date" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
