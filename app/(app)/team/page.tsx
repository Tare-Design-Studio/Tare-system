import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { serverNowMs } from "@/lib/serverNow";
import { Icon } from "@/components/atoms";
import { InviteForm } from "./InviteForm";
import { BroadcastsPanel } from "./BroadcastsPanel";
import { DailyTasksWidget } from "./DailyTasksWidget";
import { DownloadReportButton } from "./DownloadReportButton";
import { TeamBoard, type BoardMember, type LeaderRow } from "./TeamBoard";
import { scoreToGrade, type MemberTaskMetrics } from "./taskTime";
import LeaveApprovalCard from "./LeaveApprovalCard";
import { availableReportMonths } from "@/lib/reports/monthMeta";
import styles from "./team-access.module.css";
import { PageHeader } from "../PageHeader";

export const metadata = { title: "Team — ArchitectOS" };

const ROLE_BASE: Record<string, string> = {
  owner: "Owner",
  team_member: "Team Member",
  site_engineer: "Site Engineer",
};

const roleTone = (role: string): "forest" | "amber" | "indigo" =>
  role === "owner" ? "forest" : role === "site_engineer" ? "amber" : "indigo";

// Members card order: owner → team members → site engineers, then by name.
const ROLE_RANK: Record<string, number> = { owner: 0, team_member: 1, site_engineer: 2 };

const TAG_LABELS: Record<string, string> = {
  accountant: "Accountant",
  admin: "Admin",
  project_manager: "Project Manager",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
}

function formatHours(minutes: number) {
  if (minutes <= 0) return "0h";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check capability
  const [capManage, capBroadcast, capTags, capAssign, capLeave, capCoordinate, capAssignProject] =
    await Promise.all([
      supabase.rpc("has_capability", { p_capability: "team:create_user" }),
      supabase.rpc("has_capability", { p_capability: "broadcast:create" }),
      supabase.rpc("has_capability", { p_capability: "team_member_tags:manage" }),
      supabase.rpc("has_capability", { p_capability: "tasks:assign" }),
      supabase.rpc("has_capability", { p_capability: "leave:approve" }),
      supabase.rpc("has_capability", { p_capability: "team:coordinate" }),
      supabase.rpc("has_capability", { p_capability: "team:assign_to_project" }),
    ]);
  const canManage = capManage.data;
  const canBroadcast = capBroadcast.data;
  const canManageTags = capTags.data === true;
  const canAssign = capAssign.data === true;
  const canApproveLeave = capLeave.data === true;
  const canAssignToProject = capAssignProject.data === true;

  // A coordinator (096) reaches this page without team:create_user and sees a
  // redacted version: members, who is on what, and the project assignment panel.
  // `canManage` still gates every pay / attendance / KPI query below, so their
  // payload never contains those figures — the redaction is in the queries, not
  // only in the markup.
  const canCoordinate = capCoordinate.data === true;
  if (!canManage && !canCoordinate) redirect("/");

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStart = todayStr.slice(0, 7) + "-01";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  // Fetch team members, broadcasts, daily tasks, and attendance in parallel
  const [membersRes, broadcastsRes, dailyTasksRes, attendanceRes, memberTasksRes, tagRowsRes, siteCheckInsRes, projectAssignmentsRes, assignableProjectsRes] = await Promise.all([
    // Pay and personal details are selected only for a manager. A coordinator's
    // response body must not carry salary_inr at all — hiding it in the client
    // would still ship it over the wire. Two literal selects rather than one
    // conditional string: the typed client parses the select at compile time and
    // cannot infer a row type from a ternary.
    canManage
      ? supabase
        .from("users")
        .select("id, full_name, role, role_label, is_active, last_login_at, phone, experience_years, salary_inr")
        .is("deleted_at", null)
        .order("full_name")
      : supabase
        .from("users")
        .select("id, full_name, role, role_label, is_active, last_login_at")
        .is("deleted_at", null)
        .order("full_name"),

    supabase
      .from("owner_broadcasts")
      .select(`id, body, voice_path, voice_duration_s, created_at, edited_at,
        users:author_id (id, full_name),
        owner_broadcast_recipients (user_id, is_acknowledged, users:user_id (id, full_name))`)
      .order("created_at", { ascending: false })
      .limit(1),

    supabase
      .from("team_daily_tasks")
      .select("id, description, project_id, task_date, is_done, done_at, created_at")
      .eq("user_id", user.id)
      .eq("task_date", todayStr)
      .order("created_at", { ascending: true }),

    // Attendance summary for current month (owner view)
    canManage
      ? db
        .from("attendance_logs")
        .select("user_id, work_date, check_in_at, total_minutes, check_in_count, users!user_id(full_name)")
        .gte("work_date", currentMonthStart)
        .lte("work_date", todayStr)
        .not("check_in_at", "is", null)
      : Promise.resolve({ data: null, error: null }),

    // Member tasks summary. Lifecycle columns come from migration 083;
    // review_status feeds the quality half of the derived score.
    //
    // A coordinator gets this too — "who is doing what" is the whole point of
    // their view — but without the review verdicts, which are KPI inputs and
    // belong to the performance half they cannot see. RLS still applies:
    // reading other members' tasks needs member_tasks:view_all, so a coordinator
    // without it simply sees fewer rows rather than an error.
    canManage || canCoordinate
      ? db
        .from("member_tasks")
        .select(
          "user_id, title, completed, created_at, completed_at, tag, due_date, status, " +
          (canManage ? "review_status, " : "") +
          "assigned_by, accepted_at, submitted_at, users!user_id(full_name)"
        )
        .order("created_at", { ascending: false })
      : Promise.resolve({ data: null, error: null }),

    canManage
      ? db
        .from("team_member_tags")
        .select("user_id, tag")
      : Promise.resolve({ data: null, error: null }),

    canManage
      ? db
        .from("site_check_ins")
        .select("user_id, checked_in_at")
        .gte("checked_in_at", `${currentMonthStart}T00:00:00.000Z`)
      : Promise.resolve({ data: null, error: null }),

    // Project → assigned members, for broadcast-by-project targeting (owner compose).
    canBroadcast
      ? db
        .from("project_assignments")
        .select("user_id, projects:project_id(id, name, status)")
      : Promise.resolve({ data: null, error: null }),

    // Active projects, used by BOTH the "add to a project" panel and the assign-task
    // modal's project select. RLS (013 + 089's category restriction) already
    // scopes this to what the caller may see, so no extra filter is needed
    // beyond dropping finished work.
    canAssignToProject || canAssign
      ? db
        .from("projects")
        .select("id, name")
        .is("deleted_at", null)
        .not("status", "in", "(completed,cancelled)")
        .order("name")
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Already name-ordered by the query; re-rank owner → team members → site engineers.
  // phone / experience_years / salary_inr are absent from a coordinator's select
  // (see the query above), so they are optional here rather than nullable.
  type MemberRow = { id: string; full_name: string; role: string; role_label: string | null; is_active: boolean; last_login_at: string | null; phone?: string | null; experience_years?: number | null; salary_inr?: number | null };
  const rows = [...((membersRes.data ?? []) as MemberRow[])].sort(
    (a, b) => (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99)
  );
  const broadcasts = broadcastsRes.data ?? [];
  const dailyTasks = dailyTasksRes.data ?? [];
  // Access Matrix is owner-only.
  const isOwner = rows.find((m) => m.id === user.id)?.role === "owner";

  // Aggregate attendance per user for current month
  type AttRow = { user_id: string; work_date: string; check_in_at: string | null; total_minutes: number | null; check_in_count: number | null; users: { full_name: string } | null };
  const attendanceRows = (attendanceRes.data ?? []) as AttRow[];
  const attendanceByUser = new Map<string, { full_name: string; days: number; total_minutes: number; check_ins: number }>();
  for (const row of attendanceRows) {
    const name = row.users?.full_name ?? "Unknown";
    const existing = attendanceByUser.get(row.user_id) ?? { full_name: name, days: 0, total_minutes: 0, check_ins: 0 };
    existing.days += 1;
    existing.total_minutes += row.total_minutes ?? 0;
    existing.check_ins += row.check_in_count ?? 1;
    attendanceByUser.set(row.user_id, existing);
  }
  // Aggregate member tasks per user: active tasks, completed tasks with the time
  // actually taken, plus the quality signals (review verdicts, on-time %) that
  // the derived score reads.
  type TaskRow = {
    user_id: string; title: string; completed: boolean; created_at: string; completed_at: string | null;
    tag: string | null; due_date: string | null; status: string | null; review_status: string | null;
    assigned_by: string | null; accepted_at: string | null; submitted_at: string | null;
    users: { full_name: string } | null;
  };
  type TaskSummary = MemberTaskMetrics & { dueCompleted: number; onTimeCompleted: number };
  const taskRows = (memberTasksRes.data ?? []) as TaskRow[];
  const tasksByUser = new Map<string, TaskSummary>();
  for (const row of taskRows) {
    const existing = tasksByUser.get(row.user_id) ?? {
      activeTasks: [], completedTasks: [], completedCount: 0, avgTakenMs: null,
      tagCounts: {}, onTimePct: null, errorCount: 0, revisionCount: 0,
      dueCompleted: 0, onTimeCompleted: 0,
    };
    const tag = row.tag ?? "other";
    const assigned = !!row.assigned_by;
    if (!row.completed) {
      existing.activeTasks.push({
        title: row.title, createdAt: row.created_at,
        tag, dueDate: row.due_date, assigned, status: row.status ?? "open",
      });
    } else {
      const at = row.completed_at ?? row.created_at;
      // Assigned tasks log time from acceptance; self-set tasks from creation.
      const startedAt = assigned && row.accepted_at ? row.accepted_at : row.created_at;
      const takenMs = Math.max(0, new Date(at).getTime() - new Date(startedAt).getTime());
      const late = !!row.due_date && new Date(at) > new Date(`${row.due_date}T23:59:59`);
      existing.completedTasks.push({
        title: row.title, takenMs, tag,
        review: row.review_status as MemberTaskMetrics["completedTasks"][number]["review"],
        late, assigned,
      });
      existing.completedCount += 1;
      existing.tagCounts![tag] = (existing.tagCounts![tag] ?? 0) + 1;
      if (row.review_status === "error") existing.errorCount! += 1;
      if (row.review_status === "revision") existing.revisionCount! += 1;
      if (row.due_date) {
        existing.dueCompleted += 1;
        if (!late) existing.onTimeCompleted += 1;
      }
    }
    tasksByUser.set(row.user_id, existing);
  }
  // taskRows arrive newest-first; show active tasks oldest-first (date added order).
  for (const summary of tasksByUser.values()) {
    summary.activeTasks.reverse();
    if (summary.completedTasks.length) {
      const sum = summary.completedTasks.reduce((s, t) => s + t.takenMs, 0);
      summary.avgTakenMs = Math.round(sum / summary.completedTasks.length);
    }
    summary.onTimePct = summary.dueCompleted > 0
      ? Math.round((summary.onTimeCompleted / summary.dueCompleted) * 100)
      : null;
  }

  type TagRow = { user_id: string; tag: string };
  const tagsByUser = new Map<string, string[]>();
  for (const row of (tagRowsRes.data ?? []) as TagRow[]) {
    const existing = tagsByUser.get(row.user_id) ?? [];
    existing.push(row.tag);
    tagsByUser.set(row.user_id, existing);
  }

  type SiteCheckInRow = { user_id: string; checked_in_at: string };
  const siteCheckInsByUser = new Map<string, number>();
  for (const row of (siteCheckInsRes.data ?? []) as SiteCheckInRow[]) {
    siteCheckInsByUser.set(row.user_id, (siteCheckInsByUser.get(row.user_id) ?? 0) + 1);
  }

  // Group project assignments → { id, name, memberIds[] } for broadcast targeting.
  // Self (owner) is excluded so the recipient list matches the compose pills.
  type AssignmentRow = { user_id: string; projects: { id: string; name: string; status: string } | null };
  const projectMembersMap = new Map<string, { id: string; name: string; memberIds: string[] }>();
  for (const row of (projectAssignmentsRes.data ?? []) as AssignmentRow[]) {
    const p = row.projects;
    if (!p || p.status === "completed" || row.user_id === user.id) continue;
    const existing = projectMembersMap.get(p.id) ?? { id: p.id, name: p.name, memberIds: [] };
    if (!existing.memberIds.includes(row.user_id)) existing.memberIds.push(row.user_id);
    projectMembersMap.set(p.id, existing);
  }
  const broadcastProjects = [...projectMembersMap.values()]
    .filter((p) => p.memberIds.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const assignableProjects = (assignableProjectsRes.data ?? []) as { id: string; name: string }[];

  // ── Derived scores ──────────────────────────────────────────────────────
  // This deployment has NOT ported v_kpi_scores (upstream 087) or login_streaks
  // (088), so the score is computed here from what migrations 083/084 do give
  // us: task quality + on-time delivery, blended with attendance consistency.
  // Nothing is fabricated — a member with no completed tasks scores on
  // consistency alone.
  const ownerRow = rows.find((m) => m.role === "owner");
  const nonOwnerRows = rows.filter((m) => m.role !== "owner");

  // Consistency (0–100): presence + check-ins, capped. Office-based only — a
  // member working from site simply has no attendance rows and isn't penalised.
  function consistencyScore(id: string): number {
    const att = attendanceByUser.get(id);
    const checkIns = siteCheckInsByUser.get(id) ?? 0;
    const days = att?.days ?? 0;
    const raw = days * 4 + Math.round((att?.total_minutes ?? 0) / 60) + checkIns * 2;
    return Math.max(0, Math.min(100, raw));
  }

  // Delivery (0–100) from completed work: volume credit, on-time bonus, and
  // penalties for owner-flagged revisions and errors. Mirrors the weighting in
  // v_task_performance_monthly (084).
  function deliveryScore(id: string): number | null {
    const t = tasksByUser.get(id);
    if (!t || t.completedCount === 0) return null;
    const volume = Math.min(60, t.completedCount * 6);
    const onTime = t.onTimePct != null ? Math.round((t.onTimePct / 100) * 30) : 20;
    const penalty = (t.errorCount ?? 0) * 8 + (t.revisionCount ?? 0) * 4;
    return Math.max(0, Math.min(100, volume + onTime + 10 - penalty));
  }

  function memberScore(id: string): number {
    const consistency = consistencyScore(id);
    const delivery = deliveryScore(id);
    if (delivery === null) return consistency;
    return Math.max(0, Math.min(100, Math.round(delivery * 0.85 + consistency * 0.15)));
  }

  const emptyMetrics: MemberTaskMetrics = {
    activeTasks: [], completedTasks: [], completedCount: 0, avgTakenMs: null,
    tagCounts: {}, onTimePct: null, errorCount: 0, revisionCount: 0,
  };

  const boardMembers: BoardMember[] = nonOwnerRows.map((m) => {
    const att = attendanceByUser.get(m.id);
    const memberTags = tagsByUser.get(m.id) ?? [];
    const siteVisits = siteCheckInsByUser.get(m.id) ?? 0;
    const score = memberScore(m.id);
    const t = tasksByUser.get(m.id);
    const tasks: MemberTaskMetrics = t
      ? {
          activeTasks: t.activeTasks.slice(0, 5),
          completedTasks: t.completedTasks.slice(0, 5),
          completedCount: t.completedCount,
          avgTakenMs: t.avgTakenMs,
          tagCounts: t.tagCounts,
          onTimePct: t.onTimePct,
          errorCount: t.errorCount,
          revisionCount: t.revisionCount,
        }
      : emptyMetrics;
    // Quality grade leans on review verdicts alone, so it reads differently from
    // the blended delivery grade.
    const qualityPenalty = (t?.errorCount ?? 0) * 10 + (t?.revisionCount ?? 0) * 5;
    return {
      id: m.id,
      name: m.full_name,
      roleLabel: [ROLE_BASE[m.role] ?? m.role, ...memberTags.map((tag) => TAG_LABELS[tag] ?? tag)].join(" · "),
      initials: initials(m.full_name),
      tone: roleTone(m.role),
      presentDays: att?.days ?? 0,
      hours: formatHours(att?.total_minutes ?? 0),
      checkIns: att?.check_ins ?? 0,
      siteVisits,
      grade: scoreToGrade(score),
      score,
      quality: scoreToGrade(Math.max(0, score - qualityPenalty)),
      tasks,
      role: m.role,
      role_label: m.role_label,
      phone: m.phone ?? null,
      experience_years: m.experience_years ?? null,
      salary_inr: m.salary_inr ?? null,
      tags: memberTags,
      isActive: m.is_active,
      isSelf: m.id === user.id,
      linkable: m.id !== user.id,
    };
  });

  // Leaderboard is a performance surface — empty for a coordinator, whose scores
  // are computed from queries that returned nothing anyway.
  const leaders: LeaderRow[] = (canManage ? boardMembers : [])
    .map((m) => ({ m, score: m.score }))
    .sort((a, b) => b.score - a.score || a.m.name.localeCompare(b.m.name))
    .slice(0, 5)
    .map(({ m, score }, _i, arr) => {
      const top = arr[0]?.score || 1;
      return {
        id: m.id,
        name: m.name,
        initials: m.initials,
        tone: m.tone,
        score,
        grade: scoreToGrade(score),
        pct: Math.max(6, Math.round((score / (top || 1)) * 100)),
      };
    });

  return (
    <div className={styles.surface}>
      <PageHeader
        title={canManage ? "Team & Access" : "Team"}
        subtitle={`${rows.length} member${rows.length !== 1 ? "s" : ""} · ${
          canManage ? "Performance & Control" : "Who is on what"
        }`}
        actions={
          <>
            {canManage && <DownloadReportButton months={availableReportMonths()} />}
            {isOwner && (
              <Link href="/settings/access-matrix" className={styles.button}>
                <Icon name="shield" size={14} />
                Access Matrix
              </Link>
            )}
            {canManage && (
              <details className={styles.headerInviteDisclosure}>
                <summary
                  className={`${styles.button} ${styles.buttonPrimary} ${styles.iconOnlyButton}`}
                  aria-label="Invite a team member"
                  title="Invite a team member"
                >
                  <Icon name="plus" size={14} />
                </summary>
                <div className={styles.headerInvitePanel}>
                  <InviteForm />
                </div>
              </details>
            )}
          </>
        }
      />



      {canApproveLeave && <LeaveApprovalCard />}

      <TeamBoard
        ownerName={ownerRow?.full_name ?? "You"}
        ownerInitials={initials(ownerRow?.full_name ?? "You")}
        members={boardMembers}
        leaders={leaders}
        canManage={!!canManage}
        canManageTags={canManageTags}
        canAssign={canAssign}
        canSeePerformance={!!canManage}
        canAssignToProject={canAssignToProject}
        projects={assignableProjects}
        currentUserId={user.id}
        nowMs={serverNowMs()}
      >
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <div className={styles.cardTitleText}>
              <h2 className="font-serif">Broadcasts</h2>
              <p>{canBroadcast ? "Compose & latest update" : "Latest owner update"}</p>
            </div>
            <Link href="/broadcasts" className={styles.cornerButton} aria-label="Open broadcasts">
              <Icon name="arrowUR" size={15} />
            </Link>
          </div>
          <BroadcastsPanel
            broadcasts={broadcasts as Parameters<typeof BroadcastsPanel>[0]["broadcasts"]}
            teamMembers={rows.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, full_name: m.full_name }))}
            projects={broadcastProjects}
            canCompose={!!canBroadcast}
            currentUserId={user.id}
            refreshLimit={1}
            nowMs={serverNowMs()}
          />
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <div className={styles.cardTitleText}>
              <h2 className="font-serif">My tasks today</h2>
              <p>{todayStr} · self-reported daily log</p>
            </div>
          </div>
          <DailyTasksWidget initial={dailyTasks} todayStr={todayStr} />
        </div>
      </TeamBoard>
    </div>
  );
}
