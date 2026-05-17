import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const MessageSchema = z.object({
  message_type: z.enum(["text", "image", "drawing_ref", "material_request", "clarification"]).default("text"),
  body: z.string().min(1).max(2000).optional(),
  structured_payload: z.record(z.string(), z.unknown()).optional(),
}).refine(d => d.body || d.structured_payload, {
  message: "body or structured_payload required",
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);

  let query = supabase
    .from("bridge_messages")
    .select(`
      id, message_type, body, structured_payload, created_at,
      users:author_id (id, full_name, role)
    `)
    .eq("project_id", project_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = MessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from("bridge_messages")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      project_id,
      author_id: user.id,
      message_type: parsed.data.message_type,
      body: parsed.data.body ?? null,
      structured_payload: (parsed.data.structured_payload ?? null) as import("@/lib/supabase/types").Json | null,
    } as any)
    .select(`id, message_type, body, structured_payload, created_at,
      users:author_id (id, full_name, role)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
