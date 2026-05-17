import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/payment-presets
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("payment_milestone_presets")
    .select("id, name, is_system, created_at, payment_milestone_preset_items(id, milestone_name, percentage, sequence_order, notes)")
    .is("deleted_at", null)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/payment-presets   body: { name, items: [{ milestone_name, percentage, sequence_order, notes? }] }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", { p_capability: "customer_payments:create_schedule" });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await req.json() as { name?: string; items?: any[] };
  const name = (body.name ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: "At least one milestone item required" }, { status: 400 });

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!profile?.tenant_id) return NextResponse.json({ error: "User profile not found" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: preset, error: pErr } = await db
    .from("payment_milestone_presets")
    .insert({ name, created_by: user.id, tenant_id: profile.tenant_id })
    .select("id, name, is_system, created_at")
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = items.map((it: any, idx: number) => ({
    preset_id: preset.id,
    milestone_name: String(it.milestone_name ?? "").trim(),
    percentage: Number(it.percentage),
    sequence_order: it.sequence_order ?? idx + 1,
    notes: it.notes ?? null,
  }));

  const { data: itemRows, error: iErr } = await db
    .from("payment_milestone_preset_items")
    .insert(rows)
    .select("id, milestone_name, percentage, sequence_order, notes");
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json({ ...preset, payment_milestone_preset_items: itemRows }, { status: 201 });
}

// DELETE /api/payment-presets?id=...
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", { p_capability: "customer_payments:create_schedule" });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("payment_milestone_presets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("is_system", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
