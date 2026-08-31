import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// The sidebar and the nav badge in one call.
//
// chat_unread_counts() (108) counts in Postgres and returns ~20 small rows.
// The predecessor, GET /api/bridge/reads, pulled up to 2000 message rows into
// Node to count them in JavaScript — affordable on one page, not as an
// app-wide badge.
//
// SECURITY INVOKER on the RPC means it sees exactly what the caller can see,
// so no filtering happens here. Running it through the service client would
// hand every caller counts for other people's DMs.

export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("chat_unread_counts");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ conversations: data ?? [] });
}

const OpenDmSchema = z.object({ peer_id: z.string().uuid() });

// Open (or create) a DM with someone. The lo/hi ordering that makes "A to B"
// and "B to A" the same row lives in the RPC, not here — a client computing
// the pair itself would get it wrong half the time and trip the CHECK.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = OpenDmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // The RPC validates that the peer is a live user in the caller's own tenant
  // and refuses self-DMs; both surface here as a thrown error.
  const { data, error } = await supabase.rpc("open_dm", { p_peer: parsed.data.peer_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ conversation_id: data }, { status: 201 });
}
