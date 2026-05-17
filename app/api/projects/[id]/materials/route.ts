import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ConsumptionSchema = z.object({
  material_plan_id: z.string().uuid().optional(),
  material_name: z.string().min(1).max(200),
  unit: z.string().min(1).max(50),
  quantity_used: z.number().positive(),
  excess_reason: z.string().max(500).optional(),
  consumed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expense_id: z.string().uuid().optional(),
  corrects_material_consumption_id: z.string().uuid().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [planRes, consumptionRes] = await Promise.all([
    supabase
      .from("material_plan")
      .select("id, material_name, unit, planned_quantity, planned_for_date, planned_for_week, created_at")
      .eq("project_id", project_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),

    supabase
      .from("material_consumption")
      .select("id, material_plan_id, material_name, unit, quantity_used, is_excess, excess_reason, consumed_on, recorded_by, is_corrected, corrects_material_consumption_id, created_at")
      .eq("project_id", project_id)
      .is("deleted_at", null)
      .order("consumed_on", { ascending: false }),
  ]);

  if (planRes.error) return NextResponse.json({ error: planRes.error.message }, { status: 500 });
  if (consumptionRes.error) return NextResponse.json({ error: consumptionRes.error.message }, { status: 500 });

  // Aggregate current (non-corrected) consumption per plan
  const currentConsumption = (consumptionRes.data ?? []).filter(r => !r.is_corrected);
  const consumedByPlan = new Map<string, number>();
  for (const row of currentConsumption) {
    if (row.material_plan_id) {
      consumedByPlan.set(row.material_plan_id, (consumedByPlan.get(row.material_plan_id) ?? 0) + Number(row.quantity_used));
    }
  }

  const plans = (planRes.data ?? []).map(p => ({
    ...p,
    consumed: consumedByPlan.get(p.id) ?? 0,
    pct_used: p.planned_quantity > 0 ? ((consumedByPlan.get(p.id) ?? 0) / Number(p.planned_quantity)) * 100 : 0,
  }));

  return NextResponse.json({ plans, consumption: consumptionRes.data });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ConsumptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from("material_consumption")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, recorded_by: user.id, ...parsed.data } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
