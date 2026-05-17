import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreateItemSchema = z.object({
  name: z.string().min(1).max(200),
  sequence_order: z.number().int().min(1),
  default_offset_days: z.number().int().nullable().optional(),
  requires_approval: z.boolean().optional(),
  default_payment_pct: z.number().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", { p_capability: "project:create" });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = CreateItemSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!profile?.tenant_id) return NextResponse.json({ error: "User profile not found" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: item, error: insertError } = await supabase
    .from("checkpoint_template_items")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ ...result.data, template_id: id, tenant_id: profile.tenant_id } as any)
    .select()
    .single();

  if (insertError || !item) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to add stage" }, { status: 500 });
  }

  return NextResponse.json({ item }, { status: 201 });
}
