import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Unread counts for the Bridge project list, and the mark-as-read write.
//
// Both directions run through the caller's own client, never the service
// client: `bridge_select` (021) already scopes messages to threads this user
// may read, and `bridge_reads_own_rows` (098) scopes read state to the user.
// An elevated read here would hand every caller the same counts regardless of
// project access.

const MarkReadSchema = z.object({
  project_id: z.string().uuid(),
});

type UnreadRow = { project_id: string; created_at: string };

export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: reads }, { data: messages }] = await Promise.all([
    supabase.from("bridge_reads").select("project_id, last_read_at"),
    // created_at only — this is a counting scan over threads the caller can
    // read, so message bodies would be pure payload weight.
    supabase
      .from("bridge_messages")
      .select("project_id, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const readAt = new Map<string, string>(
    (reads ?? []).map((r) => [r.project_id as string, r.last_read_at as string]),
  );

  const unread: Record<string, number> = {};
  const latest: Record<string, string> = {};

  for (const m of (messages ?? []) as UnreadRow[]) {
    // Rows arrive newest-first, so the first sighting of a project is its
    // latest message.
    if (!latest[m.project_id]) latest[m.project_id] = m.created_at;

    const seenAt = readAt.get(m.project_id);
    // A thread never opened counts as fully unread — that is the state a new
    // member is in, and showing zero there would hide every existing thread.
    if (!seenAt || m.created_at > seenAt) {
      unread[m.project_id] = (unread[m.project_id] ?? 0) + 1;
    }
  }

  return NextResponse.json({ unread, latest });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = MarkReadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // tenant_id is session-derived, never taken from the body. bridge_reads has
  // no BEFORE INSERT trigger to fill it (the 094 lesson), and the column is
  // NOT NULL, so omitting it fails the constraint.
  const { error } = await supabase
    .from("bridge_reads")
    .upsert(
      {
        user_id: user.id,
        project_id: parsed.data.project_id,
        tenant_id: profile.tenant_id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "user_id,project_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Opening the thread also clears its bell notification (099). The RPC keys on
  // auth.uid() internally and takes no user id, so it can only ever clear the
  // caller's own row. Failure here must not fail the read-state write — the
  // thread is still legitimately read.
  await supabase.rpc("clear_bridge_notification", { p_project_id: parsed.data.project_id });

  return NextResponse.json({ ok: true });
}
