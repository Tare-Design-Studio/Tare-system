import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const ExpenseSchema = z.object({
  amount: z.number().positive(),
  category: z.enum(["labour", "transport", "materials", "misc"]),
  description: z.string().max(500).optional(),
  is_miscellaneous: z.boolean().optional(),
  receipt_url: z.string().url().max(2000).optional(),
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  linked_material_consumption_id: z.string().uuid().optional(),
  linked_material_plan_id: z.string().uuid().optional(),
  linked_checkpoint_id: z.string().uuid().optional(),
  corrects_expense_id: z.string().uuid().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = supabase
    .from("expenses")
    .select(`
      id, amount, category, description, is_miscellaneous, receipt_url,
      spent_on, approval_status, approved_by, approved_at, rejection_reason,
      linked_material_consumption_id, linked_checkpoint_id,
      corrects_expense_id, is_corrected, recorded_by,
      created_at, deleted_at,
      recorder:users!expenses_recorded_by_fkey(id, full_name),
      approver:users!expenses_approved_by_fkey(id, full_name)
    `)
    .eq("project_id", project_id)
    .is("deleted_at", null)
    .order("spent_on", { ascending: false });

  if (status) {
    query = query.eq("approval_status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Totals for current (non-corrected) rows
  const current = (data ?? []).filter(e => !e.is_corrected);
  const totalByStatus = current.reduce(
    (acc, e) => {
      acc[e.approval_status] = (acc[e.approval_status] ?? 0) + Number(e.amount);
      return acc;
    },
    {} as Record<string, number>
  );

  return NextResponse.json({ expenses: data, totals: totalByStatus });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ExpenseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: canCreate } = await supabase.rpc("has_capability", {
    p_capability: "expenses:create",
    p_project_id: project_id,
  });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const { data: assignment } = await service
    .from("project_assignments")
    .select("id")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!assignment) return NextResponse.json({ error: "Forbidden — project is not assigned to you" }, { status: 403 });

  const { data, error } = await service
    .from("expenses")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, recorded_by: user.id, ...parsed.data } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
