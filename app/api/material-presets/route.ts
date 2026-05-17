import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/material-presets
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("material_plan_presets")
    .select("id, name, is_system, created_at, material_plan_preset_items(id, material_name, unit, planned_quantity, sequence_order)")
    .is("deleted_at", null)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/material-presets   body: { name, items: [{ material_name, unit, planned_quantity }] }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canPlan } = await supabase.rpc("has_capability", { p_capability: "materials:plan" });
  if (!canPlan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await req.json().catch(() => null) as { name?: string; items?: any[] } | null;
  const name = (body?.name ?? "").trim();
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: "At least one material item required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: preset, error: pErr } = await db
    .from("material_plan_presets")
    .insert({ name, created_by: user.id })
    .select("id, name, is_system, created_at")
    .single();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = items.map((it: any, idx: number) => ({
    preset_id: preset.id,
    material_name: String(it.material_name ?? "").trim(),
    unit: String(it.unit ?? "").trim(),
    planned_quantity: Number(it.planned_quantity),
    sequence_order: idx + 1,
  }));
  if (rows.some((r: { material_name: string; unit: string; planned_quantity: number }) =>
    !r.material_name || !r.unit || !(r.planned_quantity > 0))) {
    await db.from("material_plan_presets").delete().eq("id", preset.id);
    return NextResponse.json({ error: "Each item needs a name, unit and positive quantity" }, { status: 400 });
  }

  const { data: itemRows, error: iErr } = await db
    .from("material_plan_preset_items")
    .insert(rows)
    .select("id, material_name, unit, planned_quantity, sequence_order");
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json({ ...preset, material_plan_preset_items: itemRows }, { status: 201 });
}

// DELETE /api/material-presets?id=...
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canPlan } = await supabase.rpc("has_capability", { p_capability: "materials:plan" });
  if (!canPlan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("material_plan_presets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("is_system", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
