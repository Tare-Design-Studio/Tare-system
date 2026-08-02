import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  decision_note: z.string().trim().max(1000).optional(),
});

type Context = { params: Promise<{ id: string }> };

// PATCH /api/leave/[id] — approve / reject (approver) or cancel (own request).
//
// The database is the real gate: guard_leave_decision() (088) rejects deciding
// your own request and rewriting decision fields, and RLS restricts who can
// touch which row. The checks here exist to return clean HTTP errors rather
// than surfacing a raw trigger exception.
export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { action, decision_note } = parsed.data;

  const { data: existing } = await supabase
    .from("leave_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "cancel") {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "You can only cancel your own leave" }, { status: 403 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Only a pending request can be cancelled" }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data: can } = await supabase.rpc("has_capability", { p_capability: "leave:approve" });
  if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Defence in depth — the DB trigger enforces this too.
  if (existing.user_id === user.id) {
    return NextResponse.json({ error: "You cannot decide your own leave request" }, { status: 403 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: "That request has already been decided" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      decision_note: decision_note ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
