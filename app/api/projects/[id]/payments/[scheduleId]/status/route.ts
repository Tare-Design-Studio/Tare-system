import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const StatusSchema = z.object({
  status: z.enum(["pending", "due", "paid"]),
});

type Ctx = { params: Promise<{ id: string; scheduleId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: project_id, scheduleId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canEdit } = await supabase.rpc("has_capability", { p_capability: "customer_payments:edit" });
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const now = new Date().toISOString();
  // is_paid is NOT client-settable: migration 082 installs a BEFORE UPDATE trigger
  // that always re-derives it from payment_records. Only triggered_at is written here.
  const update: Record<string, unknown> =
    parsed.data.status === "pending" ? { triggered_at: null } : { triggered_at: now };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("payment_schedule")
    .update(update)
    .eq("id", scheduleId)
    .eq("project_id", project_id)
    .is("deleted_at", null)
    .select("id, is_paid")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Report the persisted truth, not the requested status — a caller asking for
  // "paid" without covering payment_records will see is_paid:false here.
  return NextResponse.json({ ok: true, is_paid: data.is_paid });
}
