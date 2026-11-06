import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const MONTH = /^\d{4}-\d{2}-01$/;
const GRADES = ["A++", "A+", "A", "B+", "B", "C", "D"] as const;

const createSchema = z.object({
  user_id: z.string().uuid(),
  period_month: z.string().regex(MONTH, "Must be first of the month (YYYY-MM-01)"),
  points: z.number().min(-1000).max(1000).refine((n) => n !== 0, "Points cannot be 0"),
  grade: z.enum(GRADES).nullable().optional(),
  note: z.string().trim().min(1).max(500),
});

/** GET ?month=YYYY-MM-01 — every remark for that month (RLS scopes the rows). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = new URL(req.url).searchParams.get("month");
  if (!month || !MONTH.test(month)) return NextResponse.json({ error: "month required" }, { status: 400 });

  const { data, error } = await supabase
    .from("kpi_remarks")
    .select("id, user_id, period_month, points, grade, note, created_at, author:users!kpi_remarks_created_by_fkey(full_name)")
    .eq("period_month", month)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "team:edit_user" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.user_id === user.id) {
    return NextResponse.json({ error: "You can't add remarks to your own score" }, { status: 403 });
  }

  const { data: me } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("kpi_remarks")
    .insert({ ...parsed.data, grade: parsed.data.grade ?? null, tenant_id: me.tenant_id, created_by: user.id })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

/** DELETE ?id=<uuid> */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "team:edit_user" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error, count } = await supabase.from("kpi_remarks").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
