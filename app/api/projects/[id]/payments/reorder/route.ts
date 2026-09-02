import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Move one milestone to a position inside a (wing, part) group. The whole
// renumber happens inside reorder_payment_milestone (migration 114/115) so the
// DEFERRABLE unique constraint on (project_id, sequence_order) is only ever
// violated transiently, within one statement.
const ReorderSchema = z.object({
  schedule_id: z.string().uuid(),
  wing: z.enum(["design", "execution"]),
  part: z.enum(["a", "b"]),
  // 0-based index within the destination group.
  target_index: z.number().int().min(0),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", {
    p_capability: "customer_payments:create_schedule",
  });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { schedule_id, wing, part, target_index } = parsed.data;

  const { data: project } = await supabase
    .from("projects")
    .select("scope")
    .eq("id", project_id)
    .is("deleted_at", null)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (wing === "execution" && project.scope === "design_only") {
    return NextResponse.json(
      { error: "This project is design-only. Change its scope to use the execution wing." },
      { status: 400 },
    );
  }

  const { error } = await supabase.rpc("reorder_payment_milestone", {
    p_project_id: project_id,
    p_schedule_id: schedule_id,
    p_wing: wing,
    p_part: part,
    p_target_index: target_index,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: schedule, error: readErr } = await supabase
    .from("v_payment_status")
    .select("*")
    .eq("project_id", project_id)
    .order("sequence_order", { ascending: true });

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  return NextResponse.json({ schedule: schedule ?? [] });
}
