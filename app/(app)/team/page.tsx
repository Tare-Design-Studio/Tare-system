import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { serverNowMs } from "@/lib/serverNow";
import { Avatar, Chip, Icon } from "@/components/atoms";
import { InviteForm } from "./InviteForm";
import { BroadcastsPanel } from "./BroadcastsPanel";
import { DailyTasksWidget } from "./DailyTasksWidget";
import { TagsPanel } from "./TagsPanel";
import { DownloadReportButton } from "./DownloadReportButton";
import { availableReportMonths } from "@/lib/reports/monthMeta";
import styles from "./team-access.module.css";
import { PageHeader } from "../PageHeader";

export const metadata = { title: "Team — ArchitectOS" };

const ROLE_CHIP: Record<string, { label: string; tone: "forest" | "indigo" | "amber" }> = {
  owner: { label: "Owner", tone: "forest" },
  team_member: { label: "Team Member", tone: "indigo" },
  site_engineer: { label: "Site Engineer", tone: "amber" },
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

// Pinned timezone keeps server/client render identical (no hydration drift).
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check capability
  const [capManage, capBroadcast, capTags] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "team:create_user" }),
    supabase.rpc("has_capability", { p_capability: "broadcast:create" }),
    supabase.rpc("has_capability", { p_capability: "team_member_tags:manage" }),
  ]);
  const canManage = capManage.data;
  const canBroadcast = capBroadcast.data;
  const canManageTags = capTags.data === true;

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStart = todayStr.slice(0, 7) + "-01";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  // Fetch team members, broadcasts, daily tasks, and attendance in parallel
  const [membersRes, broadcastsRes, dailyTasksRes, attendanceRes, memberTasksRes, tagRowsRes, siteCheckInsRes, projectAssignmentsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, role, role_label, is_active, last_login_at")
      .is("deleted_at", null)
      .order("full_name"),

    supabase
      .from("owner_broadcasts")
      .select(`id, body, created_at, edited_at,
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

    // Member tasks summary (owner view)
    canManage
      ? db
        .from("member_tasks")
        .select("user_id, title, completed, created_at, completed_at, users!user_id(full_name)")
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
  ]);

  // Already name-ordered by the query; re-rank owner → team members → site engineers.
  type MemberRow = { id: string; full_name: string; role: string; role_label: string | null; is_active: boolean; last_login_at: string | null };
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
  // Aggregate member tasks per user: active (unchecked) tasks + latest completed.
  type TaskRow = { user_id: string; title: string; completed: boolean; created_at: string; completed_at: string | null; users: { full_name: string } | null };
  type MemberTaskSummary = {
    activeTasks: { title: string; created_at: string }[];
    latestCompleted: { title: string; at: string } | null;
  };
  const taskRows = (memberTasksRes.data ?? []) as TaskRow[];
  const tasksByUser = new Map<string, MemberTaskSummary>();
  for (const row of taskRows) {
    const existing = tasksByUser.get(row.user_id) ?? { activeTasks: [], latestCompleted: null };
    if (!row.completed) {
      existing.activeTasks.push({ title: row.title, created_at: row.created_at });
    } else {
      const at = row.completed_at ?? row.created_at;
      if (!existing.latestCompleted || new Date(at).getTime() > new Date(existing.latestCompleted.at).getTime()) {
        existing.latestCompleted = { title: row.title, at };
      }
    }
    tasksByUser.set(row.user_id, existing);
  }
  // taskRows arrive newest-first; show active tasks oldest-first (date added order).
  for (const summary of tasksByUser.values()) {
    summary.activeTasks.reverse();
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

  return (
    <div className={styles.surface}>
      <PageHeader
        title="Team & Access"
        subtitle={`${rows.length} member${rows.length !== 1 ? "s" : ""} · Performance & Control`}
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



      <div className={styles.grid12}>
        <div className={styles.col12}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <div className={styles.cardTitleText}>
                <h2 className="font-serif">Members</h2>
                <p>Directory · roles · invite status</p>
              </div>
              {isOwner && (
                <Link href="/settings/access-matrix" className={styles.cornerButton} aria-label="Open access matrix">
                  <Icon name="arrowUR" size={15} />
                </Link>
              )}
            </div>
            <div className={styles.memberList}>
              {rows.map((m) => {
                const chip = ROLE_CHIP[m.role] ?? { label: m.role, tone: "indigo" as const };
                const attendance = attendanceByUser.get(m.id);
                const taskSummary = tasksByUser.get(m.id);
                const memberTags = tagsByUser.get(m.id) ?? [];
                const activeTasks = taskSummary?.activeTasks ?? [];
                const latestCompleted = taskSummary?.latestCompleted ?? null;
                const siteCheckIns = siteCheckInsByUser.get(m.id) ?? 0;
                const isLinkable = m.role !== "owner" && m.id !== user.id;
                return (
                  <div
                    key={m.id}
                    className={styles.memberRow}
                  >
                    <Avatar
                      initials={initials(m.full_name)}
                      tone={roleTone(m.role)}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.memberName}>
                        {isLinkable ? (
                          <Link href={`/team/${m.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                            {m.full_name}
                          </Link>
                        ) : (
                          m.full_name
                        )}
                      </div>
                      <div className={styles.memberMeta}>
                        {chip.label}
                        {memberTags.length > 0 && (
                          <span className={styles.memberTagLine}>
                            {memberTags.map((tag) => TAG_LABELS[tag] ?? tag).join(" · ")}
                          </span>
                        )}
                      </div>
                    </div>
                    {m.role !== "owner" && (
                    <div className={styles.memberStats}>
                      {m.role === "site_engineer" ? (
                        <>
                          <div className={styles.memberStat}>
                            <span>Present</span>
                            <strong>{attendance?.days ?? 0}d</strong>
                          </div>
                          <div className={styles.memberStat}>
                            <span>Hours</span>
                            <strong>{formatHours(attendance?.total_minutes ?? 0)}</strong>
                          </div>
                          <div className={styles.memberStat}>
                            <span>Check-ins</span>
                            <strong>{attendance?.check_ins ?? 0}</strong>
                          </div>
                          <div className={styles.memberStat}>
                            <span>Site visits</span>
                            <strong>{siteCheckIns}</strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.memberStat}>
                            <span>Present</span>
                            <strong>{attendance?.days ?? 0}d</strong>
                          </div>
                          <div className={styles.memberStat}>
                            <span>Hours</span>
                            <strong>{formatHours(attendance?.total_minutes ?? 0)}</strong>
                          </div>
                          <div className={styles.memberStat}>
                            <span>Check-ins</span>
                            <strong>{attendance?.check_ins ?? 0}</strong>
                          </div>
                          <div className={styles.memberTask}>
                            {activeTasks.length > 0 ? (
                              <>
                                <span>Active tasks</span>
                                <div className={styles.memberTaskList}>
                                  {activeTasks.map((t, i) => (
                                    <div key={i} className={styles.memberTaskItem}>
                                      <strong>{t.title}</strong>
                                      <em>{formatDate(t.created_at)}</em>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : latestCompleted ? (
                              <>
                                <span>Last completed</span>
                                <strong>{latestCompleted.title}</strong>
                              </>
                            ) : (
                              <>
                                <span>Tasks</span>
                                <strong>No tasks</strong>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    )}
                    <div className={styles.inlineChips}>
                      {!m.is_active && <Chip label="Pending" tone="sand" size="sm" />}
                      {canManageTags && m.role !== "owner" && (
                        <TagsPanel userId={m.id} userName={m.full_name} currentTags={memberTags} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>



        <div className={styles.col8}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <div className={styles.cardTitleText}>
                <h2 className="font-serif">Performance</h2>
                <p>Monthly snapshot</p>
              </div>
              <Link href="/performance" className={styles.cornerButton} aria-label="Open performance">
                <Icon name="arrowUR" size={15} />
              </Link>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Delivery</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter((m) => m.role !== "owner").slice(0, 5).map((m, i) => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar initials={initials(m.full_name)} tone={roleTone(m.role)} size={28} />
                          <span style={{ fontWeight: 600 }}>{m.full_name}</span>
                        </div>
                      </td>
                      <td><Chip label={i % 3 === 0 ? "A+" : "A"} tone="forest" size="sm" /></td>
                      <td><Chip label={i % 4 === 0 ? "B+" : "A"} tone={i % 4 === 0 ? "amber" : "mint"} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={styles.col4}>
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
              teamMembers={rows.filter(m => m.id !== user.id).map(m => ({ id: m.id, full_name: m.full_name }))}
              projects={broadcastProjects}
              canCompose={!!canBroadcast}
              currentUserId={user.id}
              refreshLimit={1}
              nowMs={serverNowMs()}
            />
          </div>
        </div>

        <div className={styles.col12}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <div className={styles.cardTitleText}>
                <h2 className="font-serif">My Tasks Today</h2>
                <p>{todayStr} · self-reported daily log</p>
              </div>
            </div>
            <DailyTasksWidget initial={dailyTasks} todayStr={todayStr} />
          </div>
        </div>

      </div>
    </div >
  );
}
