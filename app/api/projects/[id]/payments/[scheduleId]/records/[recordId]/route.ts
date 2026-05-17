import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EditRecordSchema = z.object({
  amount_paid: z.number().positive().optional(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.enum(["bank", "neft", "upi", "cheque", "cash"]).optional().nullable(),
  reference: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

type Ctx = { params: Promise<{ id: string; scheduleId: string; recordId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: project_id, scheduleId, recordId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = EditRecordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("payment_records")
    .update(parsed.data)
    .eq("id", recordId)
    .eq("payment_schedule_id", scheduleId)
    .eq("project_id", project_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id: project_id, scheduleId, recordId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("payment_records")
    .delete({ count: "exact" })
    .eq("id", recordId)
    .eq("payment_schedule_id", scheduleId)
    .eq("project_id", project_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
