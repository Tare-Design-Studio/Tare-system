import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const PatchSchema = z.object({
  material_name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(50).optional(),
  planned_quantity: z.number().positive().optional(),
  planned_for_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  planned_for_week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string; planId: string }> };

async function authorise(project_id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: canPlan } = await supabase.rpc("has_capability", {
    p_capability: "materials:plan",
    p_project_id: project_id,
  });
  if (!canPlan) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: project_id, planId } = await params;
  const auth = await authorise(project_id);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("material_plan")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(parsed.data as any)
    .eq("id", planId)
    .eq("project_id", project_id)
    .is("deleted_at", null)
    .select("id, material_name, unit, planned_quantity, planned_for_date, planned_for_week, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id: project_id, planId } = await params;
  const auth = await authorise(project_id);
  if (auth.error) return auth.error;

  const service = createServiceClient();

  // Block deletion if consumption has been logged against this plan row.
  const { count } = await service
    .from("material_consumption")
    .select("id", { count: "exact", head: true })
    .eq("material_plan_id", planId)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Cannot delete — consumption already logged against this material" }, { status: 409 });
  }

  const { error } = await service
    .from("material_plan")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("project_id", project_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
