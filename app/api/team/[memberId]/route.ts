import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const EditSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role_label: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  experience_years: z.number().int().min(0).max(80).nullable().optional(),
  salary_inr: z.number().min(0).nullable().optional(),
});

// PATCH — edit a team member / site engineer's details (owner / team:edit_user).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canEdit } = await supabase.rpc("has_capability", { p_capability: "team:edit_user" });
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await params;
  if (memberId === user.id) return NextResponse.json({ error: "Cannot edit your own record here" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const admin = createServiceClient();
  // Caller's tenant, derived from session (service role bypasses RLS, so scope here).
  const { data: caller } = await admin.from("users").select("tenant_id").eq("id", user.id).maybeSingle();
  if (!caller?.tenant_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Guard against editing the owner, a deleted record, or a member in another tenant.
  const { data: target } = await admin.from("users").select("role, deleted_at, tenant_id").eq("id", memberId).maybeSingle();
  if (!target || target.deleted_at || target.tenant_id !== caller.tenant_id) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "owner") return NextResponse.json({ error: "Cannot edit the owner" }, { status: 403 });

  const { data, error } = await admin
    .from("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", memberId)
    .select("id, full_name, role, role_label, phone, experience_years, salary_inr")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — soft-delete a member and revoke all access (owner / team:deactivate_user).
// Phrase-gated on the client; we re-check the capability here.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canDeactivate } = await supabase.rpc("has_capability", { p_capability: "team:deactivate_user" });
  if (!canDeactivate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await params;
  if (memberId === user.id) return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  const admin = createServiceClient();
  // Caller's tenant, derived from session (service role bypasses RLS, so scope here).
  const { data: caller } = await admin.from("users").select("tenant_id").eq("id", user.id).maybeSingle();
  if (!caller?.tenant_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: target } = await admin.from("users").select("role, deleted_at, tenant_id").eq("id", memberId).maybeSingle();
  if (!target || target.deleted_at || target.tenant_id !== caller.tenant_id) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "owner") return NextResponse.json({ error: "Cannot delete the owner" }, { status: 403 });

  // Soft-delete the profile + deactivate so they vanish from directories and lose access.
  const { error: delErr } = await admin
    .from("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ deleted_at: new Date().toISOString(), is_active: false } as any)
    .eq("id", memberId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Revoke capabilities so RLS denies any lingering session immediately.
  await admin.from("user_capabilities").delete().eq("user_id", memberId);

  // Ban the auth user so existing sessions cannot refresh (24855 days ≈ permanent).
  await admin.auth.admin.updateUserById(memberId, { ban_duration: "876000h" }).catch(() => {});

  return NextResponse.json({ success: true });
}

function rangeStart(range: string): string {
  const now = new Date();
  if (range === "3m") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }
  if (range === "6m") {
    const d = new Date(now);
    d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  }
  if (range === "year") {
    return `${now.getFullYear()}-01-01`;
  }
  // default: month
  return now.toISOString().slice(0, 7) + "-01";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "office_attendance:view_all" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await params;
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "month";
  const start = rangeStart(range);
  const today = new Date().toISOString().slice(0, 10);

  // Fetch member profile
  const { data: member, error: memberErr } = await supabase
    .from("users")
    .select("id, full_name, role, role_label, is_active, last_login_at, phone, experience_years, skill_score, salary_inr")
    .eq("id", memberId)
    .is("deleted_at", null)
    .single();

  if (memberErr || !member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch tags
  const { data: tags } = await supabase
    .from("team_member_tags")
    .select("tag")
    .eq("user_id", memberId);

  const isSiteEngineer = member.role === "site_engineer";

  if (isSiteEngineer) {
    // Site engineers: same panels as team members minus drawing-centric performance.
    const [checkInsRes, projectsRes, dailyTasksRes, memberTasksRes, attendanceRes, broadcastsRes] = await Promise.all([
      supabase
        .from("site_check_ins")
        .select("id, project_id, checked_in_at, checked_out_at, duration_minutes, gps_lat, gps_lng, within_geofence, projects:project_id(name)")
        .eq("user_id", memberId)
        .gte("checked_in_at", `${start}T00:00:00.000Z`)
        .lte("checked_in_at", `${today}T23:59:59.999Z`)
        .order("checked_in_at", { ascending: false }),

      supabase
        .from("project_assignments")
        .select("contribution_pct, projects:project_id(id, name, status, current_stage)")
        .eq("user_id", memberId),

      supabase
        .from("team_daily_tasks")
        .select("id, description, task_date, is_done, done_at, project_id")
        .eq("user_id", memberId)
        .gte("task_date", start)
        .lte("task_date", today)
        .order("task_date", { ascending: false }),

      supabase
        .from("member_tasks")
        .select("id, title, completed, completed_at, created_at")
        .eq("user_id", memberId)
        .order("created_at", { ascending: false }),

      supabase
        .from("attendance_logs")
        .select("id, work_date, check_in_at, check_out_at, total_minutes, check_in_within_geofence, check_out_within_geofence")
        .eq("user_id", memberId)
        .gte("work_date", start)
        .lte("work_date", today)
        .order("work_date", { ascending: false }),

      supabase
        .from("owner_broadcast_recipients")
        .select("broadcast_id, is_acknowledged, acknowledged_at, owner_broadcasts:broadcast_id(created_at, body)")
        .eq("user_id", memberId)
        .order("broadcast_id", { ascending: false }),
    ]);

    return NextResponse.json({
      member,
      tags: tags ?? [],
      checkIns: checkInsRes.data ?? [],
      projects: projectsRes.data ?? [],
      dailyTasks: dailyTasksRes.data ?? [],
      memberTasks: memberTasksRes.data ?? [],
      attendance: attendanceRes.data ?? [],
      broadcasts: broadcastsRes.data ?? [],
    });
  }

  // Team members: full data set
  const perfMonthStart = start.slice(0, 7) + "-01";

  // Month boundaries for performance: need all months in range
  const perfMonths: string[] = [];
  const startDate = new Date(perfMonthStart);
  const endDate = new Date();
  const cur = new Date(startDate);
  while (cur <= endDate) {
    perfMonths.push(cur.toISOString().slice(0, 7) + "-01");
    cur.setMonth(cur.getMonth() + 1);
  }

  const [
    projectsRes,
    dailyTasksRes,
    memberTasksRes,
    attendanceRes,
    perfRes,
    broadcastsRes,
  ] = await Promise.all([
    supabase
      .from("project_assignments")
      .select("contribution_pct, projects:project_id(id, name, status, current_stage)")
      .eq("user_id", memberId),

    supabase
      .from("team_daily_tasks")
      .select("id, description, task_date, is_done, done_at, project_id")
      .eq("user_id", memberId)
      .gte("task_date", start)
      .lte("task_date", today)
      .order("task_date", { ascending: false }),

    supabase
      .from("member_tasks")
      .select("id, title, completed, completed_at, created_at")
      .eq("user_id", memberId)
      .order("created_at", { ascending: false }),

    supabase
      .from("attendance_logs")
      .select("id, work_date, check_in_at, check_out_at, total_minutes, check_in_within_geofence, check_out_within_geofence")
      .eq("user_id", memberId)
      .gte("work_date", start)
      .lte("work_date", today)
      .order("work_date", { ascending: false }),

    supabase
      .from("team_performance_monthly")
      .select("period_month, drawings_completed, errors, revisions, deadline_met_pct, client_rating, site_delay_days, notes")
      .eq("user_id", memberId)
      .gte("period_month", perfMonthStart)
      .order("period_month", { ascending: false }),

    supabase
      .from("owner_broadcast_recipients")
      .select("broadcast_id, is_acknowledged, acknowledged_at, owner_broadcasts:broadcast_id(created_at, body)")
      .eq("user_id", memberId)
      .order("broadcast_id", { ascending: false }),
  ]);

  return NextResponse.json({
    member,
    tags: tags ?? [],
    projects: projectsRes.data ?? [],
    dailyTasks: dailyTasksRes.data ?? [],
    memberTasks: memberTasksRes.data ?? [],
    attendance: attendanceRes.data ?? [],
    performance: perfRes.data ?? [],
    broadcasts: broadcastsRes.data ?? [],
  });
}
