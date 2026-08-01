import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const TASK_TAGS = ["drawing", "review", "site", "admin", "other"] as const;

const TASK_SELECT =
  "id, user_id, title, tag, status, completed, completed_at, due_date, " +
  "assigned_by, accepted_at, started_at, submitted_at, review_status, " +
  "reviewed_by, reviewed_at, created_at, updated_at";

export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = new URL(req.url).searchParams.get("scope"); // "assigned" | "review" | default own

  let query = supabase.from("member_tasks").select(TASK_SELECT);
  if (scope === "assigned") {
    // Tasks this user assigned to others (owner/PM view). RLS still scopes to tenant.
    query = query.eq("assigned_by", user.id).neq("user_id", user.id);
  } else if (scope === "review") {
    query = query.eq("status", "pending_review");
  } else {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const assignSchema = z.object({
  title: z.string().trim().min(1).max(500),
  assignee_id: z.string().uuid().optional(),
  tag: z.enum(TASK_TAGS).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const parsed = assignSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { title, assignee_id, tag, due_date } = parsed.data;

  // Self-created task (existing behaviour) unless an assignee other than self is given.
  const isAssignment = !!assignee_id && assignee_id !== user.id;

  if (isAssignment) {
    const { data: canAssign } = await supabase.rpc("has_capability", { p_capability: "tasks:assign" });
    if (!canAssign) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = {
    // assigned_by is derived from the session, never taken from the client body.
    user_id: isAssignment ? assignee_id : user.id,
    tenant_id: profile.tenant_id,
    title,
    tag: tag ?? "other",
    due_date: due_date ?? null,
    assigned_by: isAssignment ? user.id : null,
    status: "open",
  };

  const { data, error } = await supabase
    .from("member_tasks")
    .insert(row)
    .select(TASK_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isAssignment) {
    // Notify the assignee (non-fatal). RPC re-validates capability + tenant.
    supabase.rpc("emit_task_assigned_notification", {
      p_task_id: data.id,
      p_assignee: assignee_id,
      p_title: title,
    }).then(() => {}, () => {});
  }

  return NextResponse.json(data, { status: 201 });
}
