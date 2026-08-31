import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Read and post messages in a conversation, project thread or DM alike.
//
// No capability check runs in this file. That is deliberate: bridge_select /
// bridge_insert (rewritten in 107) already gate both directions — project
// threads on bridge:read / bridge:write or assignment, DMs on being one of the
// two participants. Re-implementing that here would be a second copy of the
// rule to keep in step, and the copy in SQL is the one that cannot be bypassed.

const SELECT = `
  id, message_type, body, structured_payload, created_at, author_id,
  reply_to_id, attachment_id,
  users:author_id (id, full_name, role),
  reply_to:reply_to_id (id, body, message_type, users:author_id (full_name)),
  attachment:attachment_id (id, storage_path, webp_path, mime_type, scan_status)
`;

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const conversation_id = url.searchParams.get("conversation_id");
  if (!conversation_id) {
    return NextResponse.json({ error: "conversation_id required" }, { status: 400 });
  }
  const before = url.searchParams.get("before");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);

  let query = supabase
    .from("bridge_messages")
    .select(SELECT)
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Newest-first off the index, oldest-first for the thread view.
  return NextResponse.json({ messages: (data ?? []).reverse() });
}

const PostSchema = z.object({
  conversation_id: z.string().uuid(),
  message_type: z
    .enum(["text", "image", "drawing_ref", "material_request", "clarification"])
    .default("text"),
  body: z.string().min(1).max(2000).optional(),
  structured_payload: z.record(z.string(), z.unknown()).optional(),
  reply_to_id: z.string().uuid().optional(),
  attachment_id: z.string().uuid().optional(),
}).refine((d) => d.body || d.structured_payload || d.attachment_id, {
  message: "body, structured_payload or attachment_id required",
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The conversation read is itself the authorization probe: RLS returns no
  // row for a thread this user cannot see, so a caller cannot post into one.
  const { data: conv } = await supabase
    .from("chat_conversations")
    .select("id, kind, project_id, tenant_id")
    .eq("id", parsed.data.conversation_id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  // A quoted message must live in the same conversation. Without this check a
  // caller could quote a message out of a thread they cannot read, and the
  // quote preview would render its body back to them.
  if (parsed.data.reply_to_id) {
    const { data: quoted } = await supabase
      .from("bridge_messages")
      .select("id")
      .eq("id", parsed.data.reply_to_id)
      .eq("conversation_id", parsed.data.conversation_id)
      .maybeSingle();
    if (!quoted) {
      return NextResponse.json({ error: "Quoted message not in this conversation" }, { status: 400 });
    }
  }

  // Likewise an attachment: only the uploader may attach their own upload, and
  // only once. chat_attachments has no INSERT policy for authenticated, so the
  // row can only have come from the upload route.
  if (parsed.data.attachment_id) {
    const { data: att } = await supabase
      .from("chat_attachments")
      .select("id, uploaded_by")
      .eq("id", parsed.data.attachment_id)
      .maybeSingle();
    if (!att || (att as { uploaded_by: string }).uploaded_by !== user.id) {
      return NextResponse.json({ error: "Attachment not available" }, { status: 400 });
    }
  }

  const row = {
    conversation_id: parsed.data.conversation_id,
    // NULL for a DM. Project messages keep it: the material-request trigger
    // (020) reads project_id, and bridge_select's project branch gates on it.
    project_id: (conv as { project_id: string | null }).project_id,
    tenant_id: (conv as { tenant_id: string }).tenant_id,
    author_id: user.id,
    message_type: parsed.data.message_type,
    body: parsed.data.body ?? null,
    structured_payload: (parsed.data.structured_payload ?? null) as
      import("@/lib/supabase/types").Json | null,
    reply_to_id: parsed.data.reply_to_id ?? null,
    attachment_id: parsed.data.attachment_id ?? null,
  };

  const { data, error } = await supabase
    .from("bridge_messages")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(row as any)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
