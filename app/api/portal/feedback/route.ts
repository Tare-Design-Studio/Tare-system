import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

const Schema = z.object({
  portal_hash: z.string().min(16).max(64),
  checkpoint_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

// POST /api/portal/feedback — customer rates a completed stage of work.
//
// Client request #8: feedback after each level of work (slab completion, etc.)
// rather than only at handover.
//
// This route is UNAUTHENTICATED by design — the customer portal is reached by a
// hashed URL, not a login (048). It therefore never accepts a customer_id or
// project_id: it passes the portal hash to submit_client_feedback() (091),
// which re-derives the customer server-side and refuses a checkpoint that does
// not belong to that customer's project. Trusting an id from the body here
// would let anyone rate any project.
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid feedback" }, { status: 400 });
  }
  const { portal_hash, checkpoint_id, rating, comment } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;

  const { data, error } = await service.rpc("submit_client_feedback", {
    p_portal_hash: portal_hash,
    p_checkpoint_id: checkpoint_id,
    p_rating: rating,
    p_comment: comment ?? null,
  });

  if (error) {
    // The function raises for a bad hash or a checkpoint on someone else's
    // project. Both are client errors, and the message is safe to surface —
    // it names no ids.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
