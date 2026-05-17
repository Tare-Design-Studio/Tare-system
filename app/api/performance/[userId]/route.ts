import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateSchema = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}-01$/),
  drawings_completed: z.number().int().min(0).optional(),
  errors: z.number().int().min(0).optional(),
  revisions: z.number().int().min(0).optional(),
  deadline_met_pct: z.number().min(0).max(100).nullable().optional(),
  client_rating: z.number().min(1).max(10).nullable().optional(),
  site_delay_days: z.number().int().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;

  // Own data: always allowed. Others: requires finance:view_dashboard.
  if (userId !== user.id) {
    const { data: cap } = await supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" });
    if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");

  let query = supabase
    .from("v_kpi_scores")
    .select("*")
    .eq("user_id", userId)
    .order("period_month", { ascending: false });

  if (month) query = query.eq("period_month", month);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "team:edit_user" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { period_month, ...fields } = parsed.data;

  const { data, error } = await supabase
    .from("team_performance_monthly")
    .update({ ...fields, recorded_by: user.id })
    .eq("user_id", userId)
    .eq("period_month", period_month)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
