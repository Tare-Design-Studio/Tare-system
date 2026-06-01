import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MemberDetailClient from "./MemberDetailClient";

type Range = "month" | "3m" | "6m" | "year";

const VALID_RANGES: Range[] = ["month", "3m", "6m", "year"];

function rangeStart(range: Range): string {
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
  return now.toISOString().slice(0, 7) + "-01";
}

export async function generateMetadata({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", memberId)
    .is("deleted_at", null)
    .single();
  return { title: data ? `${data.full_name} — Team` : "Team Member" };
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only users with office_attendance:view_all (Owner + tagged admins) may access this page
  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "office_attendance:view_all" });
  if (!cap) redirect("/");

  const { memberId } = await params;
  const sp = await searchParams;
  const rawRange = sp.range ?? "month";
  const range: Range = VALID_RANGES.includes(rawRange as Range) ? (rawRange as Range) : "month";

  // Don't allow viewing the owner's own detail page (owner viewing themselves)
  // Allow owner to view any team_member or site_engineer
  const { data: currentUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();

  // Redirect if owner tries to access their own detail page
  if (currentUser?.id === memberId) redirect("/team");

  const start = rangeStart(range);
  const today = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: member, error: memberErr } = await supabase
    .from("users")
    .select("id, full_name, role, role_label, is_active, last_login_at, phone, experience_years, skill_score, salary_inr")
    .eq("id", memberId)
    .is("deleted_at", null)
    .single();

  if (memberErr || !member) notFound();

  // Redirect if trying to view owner profile
  if (member.role === "owner") redirect("/team");

  const { data: tags } = await supabase
    .from("team_member_tags")
    .select("tag")
    .eq("user_id", memberId);

  const isSiteEngineer = member.role === "site_engineer";

  if (isSiteEngineer) {
    // Site engineers get the same panels as team members minus drawing-centric
    // performance: assignments, office attendance, tasks, site check-ins, broadcasts.
    const [checkInsRes, projectsRes, dailyTasksRes, memberTasksRes, attendanceRes, broadcastsRes] = await Promise.all([
      db
        .from("site_check_ins")
        .select("id, project_id, checked_in_at, gps_lat, gps_lng, within_geofence, projects:project_id(name)")
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

    return (
      <MemberDetailClient
        memberId={memberId}
        initialRange={range}
        initialData={{
          member,
          tags: tags ?? [],
          checkIns: checkInsRes.data ?? [],
          projects: projectsRes.data ?? [],
          dailyTasks: dailyTasksRes.data ?? [],
          memberTasks: memberTasksRes.data ?? [],
          attendance: attendanceRes.data ?? [],
          broadcasts: broadcastsRes.data ?? [],
        }}
      />
    );
  }

  // Team member — full data
  const perfMonthStart = start.slice(0, 7) + "-01";

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

  return (
    <MemberDetailClient
      memberId={memberId}
      initialRange={range}
      initialData={{
        member,
        tags: tags ?? [],
        projects: projectsRes.data ?? [],
        dailyTasks: dailyTasksRes.data ?? [],
        memberTasks: memberTasksRes.data ?? [],
        attendance: attendanceRes.data ?? [],
        performance: perfRes.data ?? [],
        broadcasts: broadcastsRes.data ?? [],
      }}
    />
  );
}
