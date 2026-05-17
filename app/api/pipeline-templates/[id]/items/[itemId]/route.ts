import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const UpdateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  default_offset_days: z.number().int().nullable().optional(),
  requires_approval: z.boolean().optional(),
  default_payment_pct: z.number().nullable().optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", { p_capability: "project:create" });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = UpdateItemSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }
  if (Object.keys(result.data).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  const { data: item, error } = await supabase
    .from("checkpoint_template_items")
    .update(result.data)
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", { p_capability: "project:create" });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("checkpoint_template_items").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
