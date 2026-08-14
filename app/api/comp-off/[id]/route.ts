import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  decision_note: z.string().trim().max(1000).optional(),
});

type Context = { params: Promise<{ id: string }> };

// PATCH /api/comp-off/[id] — approve / reject (approver) or withdraw (own claim).
//
// As with /api/leave/[id], the database is the real gate: guard_comp_off_decision()
// (103) blocks deciding your own claim and re-deciding a settled one, and RLS
// restricts which rows are visible at all. These checks return clean HTTP errors
// instead of raw trigger exceptions.
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
    .from("comp_off_credits")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "cancel") {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: "You can only withdraw your own claim" }, { status: 403 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Only a pending claim can be withdrawn" }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("comp_off_credits")
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
    return NextResponse.json({ error: "You cannot decide your own comp-off claim" }, { status: 403 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: "That claim has already been decided" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("comp_off_credits")
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
