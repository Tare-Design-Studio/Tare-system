import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CAPABILITY = "images:select_for_customer";

const PatchSchema = z.object({
  body: z.string().trim().min(1).max(2000).optional(),
  is_visible: z.boolean().optional(),
}).refine(v => v.body !== undefined || v.is_visible !== undefined, {
  message: "Nothing to update",
});

type Ctx = { params: Promise<{ id: string; updateId: string }> };

// PATCH /api/customers/[id]/updates/[updateId] — edit text or unpublish.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, updateId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: CAPABILITY });
  if (!canManage) return NextResponse.json({ error: `Forbidden — requires ${CAPABILITY}` }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { ...parsed.data };
  // Only a text change is an edit; unpublishing is not, so the client is not
  // shown an "edited" marker for a visibility toggle.
  if (parsed.data.body !== undefined) patch.edited_at = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("customer_updates")
    .update(patch)
    .eq("id", updateId)
    .eq("customer_id", id)
    .is("deleted_at", null)
    .select("id, body, project_id, is_visible, created_at, edited_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Update not found" }, { status: 404 });
  return NextResponse.json({ data });
}

// DELETE /api/customers/[id]/updates/[updateId] — soft delete.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, updateId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: CAPABILITY });
  if (!canManage) return NextResponse.json({ error: `Forbidden — requires ${CAPABILITY}` }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("customer_updates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", updateId)
    .eq("customer_id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Update not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
