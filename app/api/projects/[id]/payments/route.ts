import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const WingSchema = z.enum(["design", "execution"]);
const PartSchema = z.enum(["a", "b"]);

const CreateScheduleSchema = z.object({
  milestone_name: z.string().min(1).max(200),
  amount_due: z.number().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sequence_order: z.number().int().min(1),
  notes: z.string().max(1000).optional(),
  wing: WingSchema.default("design"),
  part: PartSchema.default("a"),
  // Insert AFTER this sequence_order (0 = first in the group). When given, the
  // row is placed via the insert_payment_milestone_at RPC, which opens the slot
  // and resequences in one transaction. Omit to append.
  after_order: z.number().int().min(0).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch schedule rows with v_payment_status aggregates
  const { data: schedule, error: schedErr } = await supabase
    .from("v_payment_status")
    .select("*")
    .eq("project_id", project_id)
    .order("sequence_order", { ascending: true });

  if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });

  if (!schedule || schedule.length === 0) {
    return NextResponse.json({ schedule: [], records: [] });
  }

  const scheduleIds = schedule.map((r) => r.schedule_id).filter(Boolean) as string[];

  // Fetch all payment records for these schedule rows
  const { data: records, error: recErr } = await supabase
    .from("payment_records")
    .select("id, payment_schedule_id, amount_paid, paid_on, method, reference, notes, recorded_by, created_at")
    .in("payment_schedule_id", scheduleIds)
    .order("paid_on", { ascending: false });

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });

  return NextResponse.json({ schedule, records: records ?? [] });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { wing, part, after_order, ...milestone } = parsed.data;

  // A design-only project has no execution wing. The DB enforces this too
  // (trigger, migration 114); this returns a usable message instead of a 500.
  const { data: project } = await supabase
    .from("projects")
    .select("scope")
    .eq("id", project_id)
    .is("deleted_at", null)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (wing === "execution" && project.scope === "design_only") {
    return NextResponse.json(
      { error: "This project is design-only. Change its scope to add execution milestones." },
      { status: 400 },
    );
  }

  // Insert at a specific position inside the wing/part group.
  if (after_order !== undefined) {
    const { data: newId, error: rpcErr } = await supabase.rpc("insert_payment_milestone_at", {
      p_project_id: project_id,
      p_wing: wing,
      p_part: part,
      p_after_order: after_order,
      p_milestone_name: milestone.milestone_name,
      p_amount_due: milestone.amount_due,
      p_due_date: milestone.due_date,
      p_notes: milestone.notes ?? null,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    const { data: created, error: readErr } = await supabase
      .from("payment_schedule")
      .select()
      .eq("id", newId as string)
      .single();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    return NextResponse.json(created, { status: 201 });
  }

  // Append: take the next free order across the whole project.
  const { data: existingOrders, error: ordersError } = await supabase
    .from("payment_schedule")
    .select("sequence_order")
    .eq("project_id", project_id)
    .order("sequence_order", { ascending: true });

  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

  const occupiedOrders = new Set((existingOrders ?? []).map((row) => row.sequence_order));
  const maxOrder = Math.max(0, ...(existingOrders ?? []).map((row) => row.sequence_order));
  const sequence_order = occupiedOrders.has(milestone.sequence_order)
    ? maxOrder + 1
    : milestone.sequence_order;

  const { data, error } = await supabase
    .from("payment_schedule")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, ...milestone, sequence_order, wing, part } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep the list in canonical wing/part order after an append.
  await supabase.rpc("resequence_payment_schedule", { p_project_id: project_id });

  return NextResponse.json(data, { status: 201 });
}
