import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

const TASK_SELECT =
  "id, user_id, title, tag, status, completed, completed_at, due_date, " +
  "assigned_by, accepted_at, started_at, submitted_at, review_status, " +
  "reviewed_by, reviewed_at, created_at, updated_at";

const TASK_TAGS = ["drawing", "review", "site", "admin", "other"] as const;

const patchSchema = z.object({
  // legacy fields (self-set tick + rename) — preserved
  title: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  // members may tag / date their own tasks (parity with assigned tasks)
  tag: z.enum(TASK_TAGS).optional(),
  // lifecycle actions
  action: z.enum(["accept", "set_due", "start", "submit", "review"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  review_status: z.enum(["clean", "revision", "error"]).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;
  const update: Record<string, unknown> = {};

  if (typeof body.title === "string") update.title = body.title;
  if (typeof body.completed === "boolean") update.completed = body.completed;
  if (body.tag) update.tag = body.tag;
  // Bare due_date edit (no action) — members dating their own task.
  if (!body.action && body.due_date !== undefined) update.due_date = body.due_date;

  switch (body.action) {
    case "accept":
      update.status = "accepted";
      if (body.due_date !== undefined) update.due_date = body.due_date; // member may set if unset
      break;
    case "set_due":
      update.due_date = body.due_date ?? null;
      break;
    case "start":
      update.status = "in_progress";
      break;
    case "submit":
      update.status = "pending_review";
      break;
    case "review":
      // Owner review verdict — capability-gated below.
      if (!body.review_status) {
        return NextResponse.json({ error: "review_status required" }, { status: 400 });
      }
      update.review_status = body.review_status;
      update.reviewed_by = user.id;
      update.status = "completed";
      break;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const isReview = body.action === "review";
  if (isReview) {
    const { data: canAssign } = await supabase.rpc("has_capability", { p_capability: "tasks:assign" });
    if (!canAssign) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Nobody signs off their own assigned work. `tasks:assign` is held by tagged
    // members (project_manager/accountant/admin), not just the owner, and RLS
    // cannot stop this alone: member_own_tasks is a permissive FOR ALL policy on
    // the member's own row, so it OR-authorises the update. Migration 086 enforces
    // the same rule in guard_member_task_review(); this is the API half.
    const { data: target } = await supabase
      .from("member_tasks")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    if (target?.user_id === user.id) {
      return NextResponse.json({ error: "You cannot review your own task" }, { status: 403 });
    }
  }

  // Owner review targets any tenant task (RLS owner_review_tasks); member actions
  // are scoped to their own rows (RLS member_own_tasks + this eq filter).
  let query = supabase.from("member_tasks").update(update).eq("id", id);
  if (!isReview) query = query.eq("user_id", user.id);

  const { data, error } = await query.select(TASK_SELECT).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "submit") {
    // Notify the assigner / owner (non-fatal).
    supabase.rpc("emit_task_review_notification", {
      p_task_id: id,
      p_title: data.title,
    }).then(() => {}, () => {});
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("member_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
