import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ApproveSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejection_reason: z.string().min(1).max(500).optional(),
}).refine(
  d => d.action === "approve" || (d.action === "reject" && !!d.rejection_reason),
  { message: "rejection_reason required when action is reject" }
);

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: project_id, expenseId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bug fix (Phase 10): enforce expenses:approve capability
  const { data: canApprove } = await supabase.rpc("has_capability", {
    p_capability: "expenses:approve",
  });
  if (!canApprove) {
    return NextResponse.json({ error: "Forbidden — requires expenses:approve" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action, rejection_reason } = parsed.data;

  const update =
    action === "approve"
      ? { approval_status: "approved" as const }
      : { approval_status: "rejected" as const, rejection_reason };

  const { data, error } = await supabase
    .from("expenses")
    .update(update)
    .eq("id", expenseId)
    .eq("project_id", project_id)
    .eq("approval_status", "pending")
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Expense not found or already actioned" }, { status: 404 });

  return NextResponse.json({ data });
}
