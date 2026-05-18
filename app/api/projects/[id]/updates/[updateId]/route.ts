import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EditSchema = z.object({
  body: z.string().min(1).max(2000),
});

type Ctx = { params: Promise<{ id: string; updateId: string }> };

// PATCH /api/projects/[id]/updates/[updateId] — author edits own update
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: projectId, updateId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = EditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from("updates")
    .update({ body: parsed.data.body, edited_at: new Date().toISOString() })
    .eq("id", updateId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .select("id, body, edited_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Update not found" }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE /api/projects/[id]/updates/[updateId] — author soft-deletes own update
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id: projectId, updateId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("updates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", updateId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Update not found or already deleted" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
