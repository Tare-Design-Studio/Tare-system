import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const TASK_TAGS = ["drawing", "review", "site", "admin", "other"] as const;
// Which part of a drawing the member handled (091). Only meaningful on
// drawing-tagged work; recorded so the split shows on their profile.
const DRAWING_ROLES = ["design", "detailing", "technical", "checked"] as const;

const TASK_SELECT =
  "id, user_id, title, tag, drawing_role, status, completed, completed_at, due_date, project_id, " +
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
  drawing_role: z.enum(DRAWING_ROLES).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Optional project the task belongs to. Null/absent = personal chore, which
  // stays a one-tap todo; a linked task routes through owner review (095).
  project_id: z.string().uuid().nullable().optional(),
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
  const { title, assignee_id, tag, due_date, drawing_role, project_id } = parsed.data;

  // Self-created task (existing behaviour) unless an assignee other than self is given.
  const isAssignment = !!assignee_id && assignee_id !== user.id;

  if (isAssignment) {
    const { data: canAssign } = await supabase.rpc("has_capability", { p_capability: "tasks:assign" });
    if (!canAssign) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // member_tasks RLS keys on user_id alone and says nothing about project_id, so
  // a project UUID from another tenant would otherwise be written straight in.
  // The projects SELECT policy (013) is tenant-scoped, so a miss here means the
  // project is not ours.
  if (project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 400 });
  }

  const row = {
    // assigned_by is derived from the session, never taken from the client body.
    user_id: isAssignment ? assignee_id : user.id,
    tenant_id: profile.tenant_id,
    title,
    tag: tag ?? "other",
    drawing_role: drawing_role ?? null,
    due_date: due_date ?? null,
    project_id: project_id ?? null,
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
