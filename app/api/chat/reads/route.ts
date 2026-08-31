import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Mark a conversation read. Replaces POST /api/bridge/reads, which keyed on a
// project id and so had no way to address a DM.

const MarkReadSchema = z.object({ conversation_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = MarkReadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Reading the conversation through the caller's own client is the access
  // check: RLS returns nothing for a thread they cannot see, so they cannot
  // create read state — or clear a notification — for someone else's DM.
  const { data: conv } = await supabase
    .from("chat_conversations")
    .select("id, tenant_id")
    .eq("id", parsed.data.conversation_id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  // tenant_id comes from the conversation row, never from the request body.
  const { error } = await supabase
    .from("chat_reads")
    .upsert(
      {
        user_id: user.id,
        conversation_id: parsed.data.conversation_id,
        tenant_id: (conv as { tenant_id: string }).tenant_id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "user_id,conversation_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Opening a thread also clears its bell entry (099 for projects, 108 for
  // DMs). The RPC keys on auth.uid() internally, so it can only ever clear the
  // caller's own. A failure here must not fail the read write — the thread was
  // still legitimately read.
  await supabase.rpc("clear_chat_notification", {
    p_conversation_id: parsed.data.conversation_id,
  });

  return NextResponse.json({ ok: true });
}
