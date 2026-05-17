import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const RecordPaymentSchema = z.object({
  amount_paid: z.number().positive(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(["bank", "neft", "upi", "cheque", "cash"]).optional(),
  reference: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

type Ctx = { params: Promise<{ id: string; scheduleId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id, scheduleId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = RecordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify schedule row exists for this project
  const { data: sched, error: schedErr } = await supabase
    .from("payment_schedule")
    .select("id")
    .eq("id", scheduleId)
    .eq("project_id", project_id)
    .is("deleted_at", null)
    .single();

  if (schedErr || !sched) {
    return NextResponse.json({ error: "Schedule row not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("payment_records")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, payment_schedule_id: scheduleId, ...parsed.data } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
