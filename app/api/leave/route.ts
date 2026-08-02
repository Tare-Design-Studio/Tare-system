import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const KINDS = ["casual", "sick", "earned", "unpaid", "comp_off"] as const;

const CreateSchema = z.object({
  kind: z.enum(KINDS).default("casual"),
  start_date: z.string().date(),
  end_date: z.string().date(),
  days: z.number().positive().max(365),
  reason: z.string().trim().min(1).max(1000),
});

// GET /api/leave            → my requests + my balance
// GET /api/leave?scope=all  → every member's requests (needs leave:view_all)
export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope");
  const status = searchParams.get("status");

  let query = supabase
    .from("leave_requests")
    .select("id, user_id, kind, status, start_date, end_date, days, reason, decided_by, decided_at, decision_note, created_at, users!leave_requests_user_id_fkey(full_name)")
    .order("start_date", { ascending: false })
    .limit(200);

  if (scope === "all") {
    const { data: can } = await supabase.rpc("has_capability", { p_capability: "leave:view_all" });
    if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    query = query.eq("user_id", user.id);
  }
  if (status) query = query.eq("status", status);

  const [{ data: rows, error }, { data: balance }] = await Promise.all([
    query,
    supabase.from("v_leave_balance").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: rows ?? [], balance: balance ?? null });
}

// POST /api/leave — request leave for yourself.
export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  if (body.end_date < body.start_date) {
    return NextResponse.json({ error: "End date cannot be before the start date" }, { status: 400 });
  }

  // Reject overlaps against live requests so the balance cannot be double-spent.
  const { data: clash } = await supabase
    .from("leave_requests")
    .select("id, start_date, end_date")
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"])
    .lte("start_date", body.end_date)
    .gte("end_date", body.start_date)
    .limit(1);

  if (clash?.length) {
    return NextResponse.json({ error: "You already have leave requested for those dates" }, { status: 409 });
  }

  // tenant_id is stamped by the set_tenant_from_user trigger (088); status is
  // forced to 'pending' by the insert policy, so it is not accepted here.
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      user_id: user.id,
      kind: body.kind,
      start_date: body.start_date,
      end_date: body.end_date,
      days: body.days,
      reason: body.reason,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
