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

  const { data: canEdit } = await supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" });
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> =
    parsed.data.status === "paid"
      ? { is_paid: true, triggered_at: now }
      : parsed.data.status === "due"
        ? { is_paid: false, triggered_at: now }
        : { is_paid: false, triggered_at: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("payment_schedule")
    .update(update)
    .eq("id", scheduleId)
    .eq("project_id", project_id)
    .is("deleted_at", null)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
