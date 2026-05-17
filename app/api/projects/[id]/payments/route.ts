import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreateScheduleSchema = z.object({
  milestone_name: z.string().min(1).max(200),
  amount_due: z.number().positive(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sequence_order: z.number().int().min(1),
  notes: z.string().max(1000).optional(),
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

  const { data: existingOrders, error: ordersError } = await supabase
    .from("payment_schedule")
    .select("sequence_order")
    .eq("project_id", project_id)
    .order("sequence_order", { ascending: true });

  if (ordersError) return NextResponse.json({ error: ordersError.message }, { status: 500 });

  const occupiedOrders = new Set((existingOrders ?? []).map((row) => row.sequence_order));
  const maxOrder = Math.max(0, ...(existingOrders ?? []).map((row) => row.sequence_order));
  const sequence_order = occupiedOrders.has(parsed.data.sequence_order)
    ? maxOrder + 1
    : parsed.data.sequence_order;

  const { data, error } = await supabase
    .from("payment_schedule")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, ...parsed.data, sequence_order } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
