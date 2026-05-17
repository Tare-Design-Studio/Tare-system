import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const Schema = z.object({ preset_id: z.string().uuid() });

type Ctx = { params: Promise<{ id: string }> };

// Applies a material plan preset — inserts a material_plan row per preset item.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "preset_id required" }, { status: 400 });

  const { data: canPlan } = await supabase.rpc("has_capability", {
    p_capability: "materials:plan",
    p_project_id: project_id,
  });
  if (!canPlan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();

  const { data: items, error: itemsErr } = await service
    .from("material_plan_preset_items")
    .select("material_name, unit, planned_quantity")
    .eq("preset_id", parsed.data.preset_id)
    .order("sequence_order", { ascending: true });
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json({ error: "Preset has no items" }, { status: 400 });

  const rows = items.map((it) => ({
    project_id,
    material_name: it.material_name,
    unit: it.unit,
    planned_quantity: it.planned_quantity,
    created_by: user.id,
  }));

  const { data, error } = await service
    .from("material_plan")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(rows as any)
    .select("id, material_name, unit, planned_quantity, planned_for_date, planned_for_week, created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] }, { status: 201 });
}
