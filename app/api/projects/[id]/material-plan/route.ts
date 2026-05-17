import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const PlanSchema = z.object({
  material_name: z.string().min(1).max(200),
  unit: z.string().min(1).max(50),
  planned_quantity: z.number().positive(),
  planned_for_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  planned_for_week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PlanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: canPlan } = await supabase.rpc("has_capability", {
    p_capability: "materials:plan",
    p_project_id: project_id,
  });
  if (!canPlan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("material_plan")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, created_by: user.id, ...parsed.data } as any)
    .select("id, material_name, unit, planned_quantity, planned_for_date, planned_for_week, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
