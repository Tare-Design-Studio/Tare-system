import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const recordSchema = z.object({
  user_id: z.string().uuid(),
  period_month: z.string().regex(/^\d{4}-\d{2}-01$/, "Must be first of the month (YYYY-MM-01)"),
  drawings_completed: z.number().int().min(0).default(0),
  errors: z.number().int().min(0).default(0),
  revisions: z.number().int().min(0).default(0),
  deadline_met_pct: z.number().min(0).max(100).nullable().optional(),
  client_rating: z.number().min(1).max(10).nullable().optional(),
  site_delay_days: z.number().int().min(0).default(0),
  notes: z.string().max(1000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Allow access with finance:view_dashboard OR team:edit_user (admin tag)
  const [{ data: capFinance }, { data: capTeam }] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" }),
    supabase.rpc("has_capability", { p_capability: "team:edit_user" }),
  ]);
  if (!capFinance && !capTeam) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM-01
  const userId = searchParams.get("user_id");

  let query = supabase
    .from("v_kpi_scores")
    .select("*")
    .order("period_month", { ascending: false });

  if (month) query = query.eq("period_month", month);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch revenue contribution for the current month
  const { data: revenueData } = await supabase
    .from("v_employee_revenue_contribution")
    .select("user_id, revenue_contribution, active_project_count");

  const revenueMap = Object.fromEntries(
    (revenueData ?? []).map((r) => [r.user_id, r])
  );

  const enriched = (data ?? []).map((row) => ({
    ...row,
    revenue_contribution: row.user_id ? revenueMap[row.user_id]?.revenue_contribution ?? null : null,
    active_project_count: row.user_id ? revenueMap[row.user_id]?.active_project_count ?? 0 : 0,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "team:edit_user" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: me } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const payload = {
    ...parsed.data,
    tenant_id: me.tenant_id,
    recorded_by: user.id,
  };

  const { data, error } = await supabase
    .from("team_performance_monthly")
    .upsert(payload, { onConflict: "user_id,period_month" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
