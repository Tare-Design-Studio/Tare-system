import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ id: string }> };

const TASK_SELECT =
  "id, user_id, title, tag, status, completed, completed_at, due_date, project_id, " +
  "assigned_by, accepted_at, started_at, submitted_at, review_status, " +
  "reviewed_by, reviewed_at, drawing_role, review_requested_to, created_at, updated_at";

const TASK_TAGS = ["drawing", "review", "site", "admin", "other"] as const;
const DRAWING_ROLES = ["design", "detailing", "technical", "checked"] as const;

const patchSchema = z.object({
  // legacy fields (self-set tick + rename) — preserved
  title: z.string().trim().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  // members may tag / date their own tasks (parity with assigned tasks)
  tag: z.enum(TASK_TAGS).optional(),
  // which part of the drawing they did (091) — self-declared on own work
  drawing_role: z.enum(DRAWING_ROLES).nullable().optional(),
  // lifecycle actions
  action: z.enum(["accept", "set_due", "start", "submit", "review"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  review_status: z.enum(["clean", "revision", "error"]).optional(),
  // Re-point a task at a different project (or unlink it). Null = personal chore.
  project_id: z.string().uuid().nullable().optional(),
  // Who the member wants to review this task (096). Null = no one named, which
  // keeps 083's routing (assigner, falling back to the owners).
  review_requested_to: z.string().uuid().nullable().optional(),
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
  if (body.drawing_role !== undefined) update.drawing_role = body.drawing_role;
  if (body.project_id !== undefined) update.project_id = body.project_id;
  if (body.review_requested_to !== undefined) update.review_requested_to = body.review_requested_to;
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

  // Same gap as POST: member_tasks RLS keys on user_id and ignores project_id,
  // so a foreign project UUID would be accepted. projects is tenant-scoped by
  // RLS (013), so a miss means it is not ours.
  if (body.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", body.project_id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 400 });
  }

  // A named reviewer must be able to act on the verdict, or the member has sent
  // their task into a hole. `tasks:assign` is the pool the reviewer picker offers
  // (see /api/member-tasks/reviewers); re-checked here because the picker is the
  // UI and this is the boundary. Read through the service client for the same
  // reason that route does: user_capabilities RLS hides other members' rows.
  if (body.review_requested_to) {
    if (body.review_requested_to === user.id) {
      return NextResponse.json({ error: "You cannot send a task to yourself for review" }, { status: 400 });
    }
    const { data: profile } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

    const service = createServiceClient();
    const { data: holder } = await service
      .from("user_capabilities")
      .select("user_id")
      .eq("user_id", body.review_requested_to)
      .eq("capability", "tasks:assign")
      .eq("granted", true)
      .is("scope_project_id", null)
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();
    if (!holder) {
      return NextResponse.json({ error: "That person cannot review tasks" }, { status: 400 });
    }
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
      .select("user_id, assigned_by, review_requested_to")
      .eq("id", id)
      .maybeSingle();
    if (target?.user_id === user.id) {
      return NextResponse.json({ error: "You cannot review your own task" }, { status: 403 });
    }

    // When the member named a reviewer, only that person may return a verdict.
    // RLS cannot express this: owner_review_tasks (095) authorises every
    // tasks:assign holder tenant-wide, and narrowing it would break the unnamed
    // path where the assigner or owner reviews. See migration 096 §2 — this is
    // the API half of a deliberate split, not a missing policy.
    //
    // Only applies when a reviewer WAS named; an unnamed task stays reviewable by
    // the assigner or any owner exactly as before.
    if (target?.review_requested_to && target.review_requested_to !== user.id) {
      return NextResponse.json(
        { error: "This task was sent to someone else for review" },
        { status: 403 }
      );
    }
  }

  // Status before the write, so the notification below fires on the transition
  // into pending_review rather than on every later edit of a task already there.
  const { data: before } = await supabase
    .from("member_tasks")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  // An assigner may re-point the task they handed out at a different project —
  // they chose the project when assigning, so they own that decision afterwards
  // too. Narrow on purpose: project_id is the ONLY field this path may touch, so
  // an assigner cannot rename, tick, or re-date someone else's task. Anything
  // else in the same body falls back to the self-scoped write below and 404s.
  const isAssignerProjectEdit =
    !isReview &&
    body.project_id !== undefined &&
    Object.keys(update).length === 1;

  let assignerOwnsTask = false;
  if (isAssignerProjectEdit) {
    const { data: target } = await supabase
      .from("member_tasks")
      .select("user_id, assigned_by")
      .eq("id", id)
      .maybeSingle();
    if (target && target.assigned_by === user.id && target.user_id !== user.id) {
      // owner_review_tasks (083/095) is the policy that authorises writing to
      // someone else's task row, and it gates on tasks:assign — so the API must
      // require the same capability rather than relying on assigned_by alone.
      const { data: canAssign } = await supabase.rpc("has_capability", { p_capability: "tasks:assign" });
      assignerOwnsTask = canAssign === true;
    }
  }

  // Owner review targets any tenant task (RLS owner_review_tasks); member actions
  // are scoped to their own rows (RLS member_own_tasks + this eq filter).
  let query = supabase.from("member_tasks").update(update).eq("id", id);
  if (isReview) {
    // unscoped — owner_review_tasks authorises it
  } else if (assignerOwnsTask) {
    query = query.eq("assigned_by", user.id);
  } else {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query.select(TASK_SELECT).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A project-linked task ticked complete is turned into pending_review by the
  // 095 trigger, not by an explicit "submit" action — so read the row we got
  // back rather than the request to decide whether a review is now waiting.
  if (data.status === "pending_review" && before?.status !== "pending_review") {
    // Routes to the named reviewer when the member picked one (096), else the
    // assigner, else the owners. Read from the row we got back so a reviewer set
    // in this same PATCH is honoured. Non-fatal.
    supabase.rpc("emit_task_review_notification", {
      p_task_id: id,
      p_title: data.title,
      p_reviewer: data.review_requested_to ?? null,
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
