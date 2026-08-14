import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverNowMs } from "@/lib/serverNow";
import { localDate } from "@/lib/attendance/day";
import SiteTeamClient, { type TrackedEngineer, type TrackedUpdate } from "./SiteTeamClient";

export const metadata = { title: "Team — ArchitectOS" };

/**
 * Supervisor view for a site engineer who is also a project manager.
 *
 * The capabilities this page reads (member_tasks:view_all,
 * site_check_in:view_all, office_attendance:view_all) are already conferred by
 * the project_manager tag — they were simply unreachable, because
 * `layout.tsx` routes every site engineer into SiteEngineerChrome, whose tabs
 * are all single-project. This page is the missing screen, not a new grant.
 */
export default async function SiteTeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, full_name, role, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  // member_tasks:view_all is the gate — it is what makes "who is doing what"
  // legible at all. Without it the page would render an empty roster rather
  // than an error, so it is refused up front.
  const [capTasks, capCheckIns, capAssign, capAssignProject] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "member_tasks:view_all" }),
    supabase.rpc("has_capability", { p_capability: "site_check_in:view_all" }),
    supabase.rpc("has_capability", { p_capability: "tasks:assign" }),
    supabase.rpc("has_capability", { p_capability: "team:assign_to_project" }),
  ]);
  if (capTasks.data !== true) redirect("/site");

  const canViewCheckIns = capCheckIns.data === true;
  const canAssignTask = capAssign.data === true;
  const canAssignToProject = capAssignProject.data === true;

  const nowMs = serverNowMs();
  const todayStr = localDate(new Date(nowMs));
  const since = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Every site engineer in the tenant, self excluded — he is tracking the
  // others, and his own day already fills the Today tab.
  const { data: memberRows } = await supabase
    .from("users")
    .select("id, full_name, role, role_label, is_active, phone")
    .eq("role", "site_engineer")
    .is("deleted_at", null)
    .order("full_name");

  const engineers = (memberRows ?? []).filter((m) => m.id !== user.id);
  const engineerIds = engineers.map((m) => m.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Active projects for the pickers, and his own current assignments so the
  // picker can mark what he is already on. Both are needed even when he has no
  // peers, so they run ahead of the roster fan-out.
  const [activeProjectsRes, myAssignmentsRes] = await Promise.all([
    canAssignToProject || canAssignTask
      ? db
        .from("projects")
        .select("id, name, current_stage")
        .is("deleted_at", null)
        .eq("status", "active")
        .order("name")
      : Promise.resolve({ data: null }),
    db
      .from("project_assignments")
      .select("project_id")
      .eq("user_id", user.id),
  ]);

  const activeProjects = (activeProjectsRes.data ?? []) as {
    id: string; name: string; current_stage: string | null;
  }[];
  const selfProjectIds = ((myAssignmentsRes.data ?? []) as { project_id: string }[])
    .map((r) => r.project_id);

  if (engineerIds.length === 0) {
    return (
      <SiteTeamClient
        engineers={[]}
        updates={[]}
        projects={activeProjects}
        nowMs={nowMs}
        canAssignTask={false}
        canAssignToProject={canAssignToProject}
        selfId={user.id}
        selfProjectIds={selfProjectIds}
      />
    );
  }

  const [tasksRes, checkInsRes, attendanceRes, assignmentsRes] = await Promise.all([
    // Authorised by member_tasks:view_all, checked above.
    db
      .from("member_tasks")
      .select("id, user_id, title, status, completed, due_date, created_at, completed_at, project_id, projects:project_id(name)")
      .in("user_id", engineerIds)
      .order("created_at", { ascending: false }),

    // site_check_ins RLS (018) already honours site_check_in:view_all.
    canViewCheckIns
      ? db
        .from("site_check_ins")
        .select("id, user_id, project_id, checked_in_at, checked_out_at, duration_minutes, within_geofence, projects:project_id(name)")
        .in("user_id", engineerIds)
        .gte("checked_in_at", since)
        .order("checked_in_at", { ascending: false })
      : Promise.resolve({ data: null }),

    // Office attendance for today only — the roster shows presence, not payroll.
    db
      .from("attendance_logs")
      .select("user_id, work_date, check_in_at, last_check_in_at, accumulated_minutes")
      .in("user_id", engineerIds)
      .eq("work_date", todayStr),

    db
      .from("project_assignments")
      .select("user_id, project_id, projects:project_id(id, name, status)")
      .in("user_id", engineerIds),
  ]);

  type TaskRow = {
    id: string; user_id: string; title: string; status: string | null; completed: boolean;
    due_date: string | null; created_at: string; completed_at: string | null;
    project_id: string | null; projects: { name: string } | null;
  };
  type CheckInRow = {
    id: string; user_id: string; project_id: string; checked_in_at: string;
    checked_out_at: string | null; duration_minutes: number | null;
    within_geofence: boolean; projects: { name: string } | null;
  };
  type AttendanceRow = {
    user_id: string; work_date: string; check_in_at: string | null;
    last_check_in_at: string | null; accumulated_minutes: number | null;
  };
  type AssignmentRow = {
    user_id: string; project_id: string; projects: { id: string; name: string; status: string } | null;
  };

  const taskRows = (tasksRes.data ?? []) as TaskRow[];
  const checkInRows = (checkInsRes.data ?? []) as CheckInRow[];
  const attendanceRows = (attendanceRes.data ?? []) as AttendanceRow[];
  const assignmentRows = (assignmentsRes.data ?? []) as AssignmentRow[];

  const attendanceByUser = new Map(attendanceRows.map((r) => [r.user_id, r]));

  const tracked: TrackedEngineer[] = engineers.map((m) => {
    const myTasks = taskRows.filter((t) => t.user_id === m.id);
    const openTasks = myTasks.filter((t) => !t.completed && t.status !== "completed");
    const myCheckIns = checkInRows.filter((c) => c.user_id === m.id);
    const openSession = myCheckIns.find((c) => c.checked_out_at == null) ?? null;
    const att = attendanceByUser.get(m.id);

    return {
      id: m.id,
      name: m.full_name,
      roleLabel: m.role_label,
      isActive: m.is_active,
      phone: m.phone ?? null,
      onSite: openSession
        ? {
          projectName: openSession.projects?.name ?? "Unknown project",
          since: openSession.checked_in_at,
          withinGeofence: openSession.within_geofence,
        }
        : null,
      officeCheckInAt: att?.check_in_at ?? null,
      officeStillIn: !!att?.last_check_in_at,
      officeMinutes: att?.accumulated_minutes ?? 0,
      openTasks: openTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status ?? "open",
        dueDate: t.due_date,
        projectName: t.projects?.name ?? null,
      })),
      completedCount: myTasks.filter((t) => t.completed || t.status === "completed").length,
      pendingReviewCount: myTasks.filter((t) => t.status === "pending_review").length,
      recentCheckIns: myCheckIns.slice(0, 8).map((c) => ({
        id: c.id,
        projectName: c.projects?.name ?? "Unknown project",
        checkedInAt: c.checked_in_at,
        checkedOutAt: c.checked_out_at,
        durationMinutes: c.duration_minutes,
        withinGeofence: c.within_geofence,
      })),
      projects: assignmentRows
        .filter((a) => a.user_id === m.id && a.projects)
        .map((a) => ({ id: a.projects!.id, name: a.projects!.name, status: a.projects!.status })),
    };
  });

  // Site updates authored by the tracked engineers. Read through the service
  // client for the same reason the project feed does (PROJECT_STATE 2026-08-06):
  // `updates` RLS is per-viewer, so the caller's client would return a
  // different, mostly-empty feed. Scoped explicitly to this tenant and to the
  // engineers already resolved above.
  const { data: updateRows } = await createServiceClient()
    .from("updates")
    .select("id, author_id, body, update_type, created_at, project_id, projects:project_id(name), users:author_id(full_name)")
    .eq("tenant_id", profile.tenant_id)
    .in("author_id", engineerIds)
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(40);

  const updates: TrackedUpdate[] = ((updateRows ?? []) as unknown as {
    id: string; author_id: string; body: string | null; update_type: string;
    created_at: string; projects: { name: string } | null; users: { full_name: string } | null;
  }[]).map((u) => ({
    id: u.id,
    authorId: u.author_id,
    authorName: u.users?.full_name ?? "Unknown",
    body: u.body,
    updateType: u.update_type,
    createdAt: u.created_at,
    projectName: u.projects?.name ?? null,
  }));

  return (
    <SiteTeamClient
      engineers={tracked}
      updates={updates}
      projects={activeProjects}
      nowMs={nowMs}
      canAssignTask={canAssignTask}
      canAssignToProject={canAssignToProject}
      selfId={user.id}
      selfProjectIds={selfProjectIds}
    />
  );
}
