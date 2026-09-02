import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EditScheduleSchema = z.object({
  milestone_name: z.string().min(1).max(200).optional(),
  amount_due: z.number().positive().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sequence_order: z.number().int().min(1).optional(),
  notes: z.string().max(1000).optional().nullable(),
  wing: z.enum(["design", "execution"]).optional(),
  part: z.enum(["a", "b"]).optional(),
});

type Ctx = { params: Promise<{ id: string; scheduleId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: project_id, scheduleId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = EditScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Moving a milestone into the execution wing needs the project to have one.
  if (parsed.data.wing === "execution") {
    const { data: project } = await supabase
      .from("projects")
      .select("scope")
      .eq("id", project_id)
      .is("deleted_at", null)
      .single();
    if (project?.scope === "design_only") {
      return NextResponse.json(
        { error: "This project is design-only. Change its scope to use the execution wing." },
        { status: 400 },
      );
    }
  }

  // RLS enforces: only unpaid + non-deleted rows can be updated
  const { data, error } = await supabase
    .from("payment_schedule")
    .update(parsed.data)
    .eq("id", scheduleId)
    .eq("project_id", project_id)
    .eq("is_paid", false)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found or already paid" }, { status: 409 });

  // A wing/part change re-groups the row; renumber so the list stays canonical.
  if (parsed.data.wing || parsed.data.part) {
    await supabase.rpc("resequence_payment_schedule", { p_project_id: project_id });
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id: project_id, scheduleId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existingOrders, error: ordersError } = await supabase
    .from("payment_schedule")
    .select("sequence_order")
    .eq("project_id", project_id);

  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

  const freedOrder = Math.min(0, ...(existingOrders ?? []).map((row) => row.sequence_order)) - 1;

  // Soft delete — only unpaid rows
  const { data, error } = await supabase
    .from("payment_schedule")
    .update({ deleted_at: new Date().toISOString(), sequence_order: freedOrder })
    .eq("id", scheduleId)
    .eq("project_id", project_id)
    .eq("is_paid", false)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found or already paid" }, { status: 409 });

  return NextResponse.json({ deleted: true });
}
