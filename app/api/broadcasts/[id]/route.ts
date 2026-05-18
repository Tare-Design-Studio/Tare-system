import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EditSchema = z.object({
  body: z.string().min(1).max(2000),
  attachment_url: z.string().url().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/broadcasts/[id] — author (owner) edits own broadcast
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = EditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const patch: { body: string; edited_at: string; attachment_url?: string | null } = {
    body: parsed.data.body,
    edited_at: new Date().toISOString(),
  };
  if (parsed.data.attachment_url !== undefined) patch.attachment_url = parsed.data.attachment_url;

  const { data, error } = await supabase
    .from("owner_broadcasts")
    .update(patch)
    .eq("id", id)
    .select("id, body, attachment_url, edited_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  return NextResponse.json(data);
}
