import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverNowMs } from "@/lib/serverNow";
import { localDate } from "@/lib/attendance/day";
import MobileHome from "./MobileHome";
import TeamMemberHome from "./TeamMemberHome";
import TeamMemberMobileHome, { type MemberProject } from "./TeamMemberMobileHome";
import { BroadcastsPanel } from "./team/BroadcastsPanel";
import PresenceCard from "./team-member/PresenceCard";
import ChatDock from "@/components/chat/ChatDock";
import ShowMoreList from "./ShowMoreList";
import TeamPerformanceCard from "./TeamPerformanceCard";
import styles from "./overview.module.css";

// ── Helpers ────────────────────────────────────────────────────────────
function computeDayLabel(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-IN", { weekday: "long" });
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${day} · ${date} · Overview`;
}

// ── Sub-components ─────────────────────────────────────────────────────

function CardHead({ title, subtitle, href }: { title: string; subtitle: string; href?: string }) {
  const arrowStyle: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 12, background: "rgba(30,28,24,.04)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "var(--color-ink)", flexShrink: 0,
  };
  const arrow = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7" /><path d="M8 7h9v9" />
    </svg>
  );
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
      <div>
        <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 6 }}>{subtitle}</div>
      </div>
      {href
        ? <Link href={href} aria-label={`Open ${title}`} style={arrowStyle}>{arrow}</Link>
        : <div style={arrowStyle}>{arrow}</div>}
    </div>
  );
}

type DashProject = {
  id: string;
  name: string;
  slug: string;
  project_type: string | null;
  status: string;
  current_stage: string | null;
  site_location: string | null;
  project_checkpoints: { completed_at: string | null }[];
};

function computeProgress(checkpoints: { completed_at: string | null }[]): number {
  if (!checkpoints.length) return 0;
  return Math.round(checkpoints.filter(c => c.completed_at !== null).length / checkpoints.length * 100);
}

const STATUS_DOT: Record<string, string> = {
  active: "var(--color-forest)",
  completed: "var(--color-mint)",
  on_hold: "var(--color-amber)",
};

function PCard({ p }: { p: DashProject }) {
  const progress = computeProgress(p.project_checkpoints);
  const label = p.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const type = p.project_type ? p.project_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : null;
  return (
    <Link href={`/projects/${p.id}`} title={p.name} style={{ textDecoration: "none", color: "inherit", width: 260, height: 140, boxSizing: "border-box", padding: 16, borderRadius: 16, border: "1px solid rgba(255,255,255,.6)", background: "rgba(255,255,255,.9)", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
      <div style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.site_location ?? "—"}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflow: "hidden", whiteSpace: "nowrap" }}>
        {type && (
          <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 999, background: "#EAE3D3", color: "#3A3833", fontSize: 11, fontWeight: 500 }}>{type}</span>
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, background: "#EAE3D3", color: "#3A3833", fontSize: 11, fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT[p.status] ?? "var(--color-tan)", flexShrink: 0 }} />
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        <div style={{ flex: 1, height: 6, background: "var(--color-line)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: progress + "%", height: "100%", background: "var(--color-ink)" }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{progress}%</span>
      </div>
    </Link>
  );
}

function ProjectsCard({ projects }: { projects: DashProject[] }) {
  const open = projects.filter(p => p.status !== "completed");
  const execution = open.filter(p => p.current_stage === "execution");
  const design = open.filter(p => p.current_stage === "design");

  return (
    <div className={styles.card} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <CardHead title="Projects" href="/projects" subtitle={`${execution.length} in execution · ${design.length} in design`} />
      {open.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-tan)", fontSize: 13 }}>
          No projects yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, overflowY: "auto", paddingBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Execution Stage</div>
            {execution.length > 0 ? (
              <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
                {execution.map(p => <PCard key={p.id} p={p} />)}
              </div>
            ) : (
              <div style={{ color: "var(--color-tan)", fontSize: 12, fontStyle: "italic", paddingBottom: 8 }}>No projects in execution stage</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Design Stage</div>
            {design.length > 0 ? (
              <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
                {design.map(p => <PCard key={p.id} p={p} />)}
              </div>
            ) : (
              <div style={{ color: "var(--color-tan)", fontSize: 12, fontStyle: "italic", paddingBottom: 8 }}>No projects in design stage</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type DashUpdate = {
  id: string;
  update_type: string;
  body: string;
  created_at: string;
  project_id: string;
  users: { id: string; full_name: string; role: string } | { id: string; full_name: string; role: string }[] | null;
  projects: { id: string; name: string } | { id: string; name: string }[] | null;
};

function updateIcon(updateType: string): string {
  switch (updateType) {
    case "progress": return "M20 6 9 17l-5-5";
    case "note": return "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8";
    case "material_request": return "m12 2 10 6-10 6L2 8z|m2 14 10 6 10-6";
    case "site_photo": return "M3 3h18v18H3z|M8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3|m21 15-5-5L5 21";
    case "payment": return "M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6";
    case "check_in": return "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z|M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
    default: return "M12 20h9|M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z";
  }
}

function updateTimeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} mins`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? "s" : ""}`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)} days`;
}

function UpdatesCard({ updates }: { updates: DashUpdate[] }) {
  const hasItems = updates.length > 0;

  return (
    <div className={styles.card} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardHead title="Updates" href="/updates" subtitle={hasItems ? `${updates.length} today` : "Today"} />
      {!hasItems ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-tan)", fontSize: 13 }}>
          No updates yet today
        </div>
      ) : (
        <ShowMoreList initial={5}>
        {updates.map((e) => {
          const authorRaw = e.users;
          const author = Array.isArray(authorRaw) ? authorRaw[0]?.full_name : authorRaw?.full_name;
          const projectRaw = e.projects;
          const projectName = Array.isArray(projectRaw) ? projectRaw[0]?.name : projectRaw?.name;
          const isMint = e.update_type === "payment";
          const title = e.body?.split("\n")[0]?.slice(0, 60) || capitaliseType(e.update_type);
          const sub = [projectName, author].filter(Boolean).join(" · ");

          return (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "flex-start" }}>
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>{updateTimeAgo(e.created_at)}</div>
              </div>
              <div style={{
                padding: "12px 14px", borderRadius: 14,
                // Near-white so items lift off the card surface.
                background: "rgba(255,255,255,.9)", border: "1px solid rgba(255,255,255,.6)",
                color: isMint ? "var(--color-forest)" : "var(--color-ink)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {updateIcon(e.update_type).split("|").map((p, j) => <path key={j} d={p} />)}
                  </svg>
                  {title}
                </div>
                {sub && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{sub}</div>}
              </div>
            </div>
          );
        })}
        </ShowMoreList>
      )}
    </div>
  );
}

function capitaliseType(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Page ───────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  // Site Engineers go to their dedicated dashboard
  if (profile?.role === "site_engineer") {
    redirect("/site");
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  // Team Member — fetch their scoped data
  if (profile?.role === "team_member") {
    // IST work_date, matching /api/attendance — a UTC date here would read
    // yesterday's row before 05:30 IST and render the wrong check-in state.
    const today = localDate();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [assignedProjects, tasks, broadcastRows, memberTasksRes, attendanceRes, remindersRes, allProjectsRes, namesRes] = await Promise.all([
      supabase
        .from("project_assignments")
        .select("project_id, projects(id, name, status, project_type, project_checkpoints(completed_at))")
        .eq("user_id", user.id)
        .limit(12),
      supabase
        .from("team_daily_tasks")
        .select("id, description, is_done, task_date")
        .eq("user_id", user.id)
        .gte("task_date", today)
        .order("task_date", { ascending: false })
        .limit(20),
      // Use service client to bypass RLS chain issue on owner_broadcasts join
      createServiceClient()
        .from("owner_broadcast_recipients")
        .select("broadcast_id, is_acknowledged, owner_broadcasts!broadcast_id(id, body, created_at, users!author_id(full_name))")
        .eq("user_id", user.id)
        .order("broadcast_id", { ascending: false })
        .limit(10),
      db
        .from("member_tasks")
        .select("id, title, completed, completed_at, created_at, project_id, status, reviewed_by, assigned_by, due_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("attendance_logs")
        .select("id, work_date, check_in_at, check_out_at, check_in_within_geofence, check_out_within_geofence, total_minutes, accumulated_minutes, last_check_in_at, check_in_count")
        .eq("user_id", user.id)
        .eq("work_date", today)
        .maybeSingle(),
      db
        .from("personal_reminders")
        .select("id, title, reminder_at, type, is_done")
        .eq("user_id", user.id)
        .eq("is_done", false)
        .order("reminder_at", { ascending: true })
        .limit(10),
      // Task/update project pickers list every active project in the tenant, not
      // just the member's assignments — members hold project:view_all (089), so
      // RLS already scopes this to their tenant.
      db
        .from("projects")
        .select("id, name")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(200),
      // Names for "From <assigner>" on the task card. `users` RLS is
      // tenant-scoped, and this reads id + name only.
      db
        .from("users")
        .select("id, full_name")
        .is("deleted_at", null),
    ]);

    const pickerProjects = (allProjectsRes.data ?? []) as { id: string; name: string }[];
    const memberNames = Object.fromEntries(
      ((namesRes.data ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name])
    );

    const projects = (assignedProjects.data ?? [])
      .map((r) => r.projects)
      .filter(Boolean)
      .flat() as unknown as MemberProject[];

    type OBRow = { body: string; created_at: string; users: { full_name: string } | { full_name: string }[] | null };
    const broadcasts = (broadcastRows.data ?? []).map((r) => {
      const raw = r.owner_broadcasts;
      const ob: OBRow | null = Array.isArray(raw) ? (raw[0] as OBRow ?? null) : (raw as OBRow | null);
      const senderRaw = ob?.users;
      const sender_name = Array.isArray(senderRaw)
        ? (senderRaw[0]?.full_name ?? "Owner")
        : (senderRaw as { full_name: string } | null)?.full_name ?? "Owner";
      return {
        id: r.broadcast_id as string,
        body: ob?.body ?? "",
        created_at: ob?.created_at ?? "",
        sender_name,
        is_acknowledged: r.is_acknowledged ?? false,
      };
    });

    const memberTasks = (memberTasksRes.data ?? []) as {
      id: string; title: string; completed: boolean; completed_at: string | null; created_at: string;
      assigned_by?: string | null; due_date?: string | null;
    }[];
    const memberReminders = (remindersRes.data ?? []) as { id: string; title: string; reminder_at: string; type: string; is_done: boolean }[];

    return (
      <>
        <div className="mobile-only">
          <TeamMemberMobileHome
            firstName={firstName}
            projects={projects}
            broadcasts={broadcasts}
            memberTasks={memberTasks}
            pickerProjects={pickerProjects}
            memberNames={memberNames}
            todayAttendance={attendanceRes.data ?? null}
            reminders={memberReminders}
          />
        </div>
        <div className="desktop-only">
          <TeamMemberHome
            firstName={firstName}
            projects={projects}
            tasks={tasks.data ?? []}
            broadcasts={broadcasts}
            memberTasks={memberTasks}
            pickerProjects={pickerProjects}
            memberNames={memberNames}
            todayAttendance={attendanceRes.data ?? null}
            reminders={memberReminders}
          />
        </div>
      </>
    );
  }

  // Owner — full dashboard (existing view)

  const [canBroadcastRes, capFinanceRes, capTeamRes] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "broadcast:create" }),
    supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" }),
    supabase.rpc("has_capability", { p_capability: "team:edit_user" }),
  ]);
  const canBroadcast = canBroadcastRes.data === true;
  // Same gate as /api/team-performance.
  const canViewPerformance = capFinanceRes.data === true || capTeamRes.data === true;
  // Updates card lists the tenant's (IST) day, not the server's UTC day.
  const istToday = localDate();
  const overviewNowMs = serverNowMs();

  const [projectsRes, membersRes, todayUpdatesRes, broadcastsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, slug, project_type, status, current_stage, site_location, project_checkpoints(completed_at)")
      .is("deleted_at", null)
      .neq("status", "completed")
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, full_name, role, is_active")
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("updates")
      .select(`id, update_type, body, created_at, project_id,
        users:author_id (id, full_name, role),
        projects:project_id (id, name)`)
      .gte("created_at", `${istToday}T00:00:00+05:30`)
      .lte("created_at", `${istToday}T23:59:59.999+05:30`)
      .order("created_at", { ascending: false }),
    supabase
      .from("owner_broadcasts")
      .select(`id, body, voice_path, voice_duration_s, created_at, edited_at,
        users:author_id (id, full_name),
        owner_broadcast_recipients (user_id, is_acknowledged, users:user_id (id, full_name))`)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const projects: DashProject[] = (projectsRes.data ?? []) as DashProject[];
  const todayUpdates = (todayUpdatesRes.data ?? []) as DashUpdate[];

  type MemberRow = { id: string; full_name: string; role: string; is_active: boolean };
  const teamRows = ((membersRes.data ?? []) as MemberRow[]).filter((m) => m.is_active !== false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastsForPanel = (broadcastsRes.data ?? []) as any;
  const broadcastTeamMembers = teamRows
    .filter((m) => m.id !== user.id)
    .map((m) => ({ id: m.id, full_name: m.full_name, role: m.role }));

  return (
    <>
      <div className="mobile-only">
        <MobileHome firstName={firstName} />
      </div>
      <div className="desktop-only">
        {/* Hero strip */}
        <div style={{ padding: "8px 4px 28px" }}>
          <div style={{ fontSize: 13, color: "var(--color-tan)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            {computeDayLabel()}
          </div>
          <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 64, letterSpacing: -1.5, lineHeight: 1 }}>
            Hey,{" "}
            <em style={{ color: "var(--color-forest)", fontStyle: "italic" }}>{firstName}</em>
          </h1>
        </div>
      </div>

      {/* Same cards on desktop and phone; overview.module.css stacks them in
          one column below 768px. */}
      <div className={styles.grid}>
        <div className={styles.topRow}>
          <ProjectsCard projects={projects} />
          <UpdatesCard updates={todayUpdates} />
        </div>
        <div className={styles.half}>
          <div className={styles.card} style={{ height: "100%" }}>
            <CardHead title="Broadcasts" subtitle={canBroadcast ? "Compose & latest updates" : "Latest owner updates"} />
            <BroadcastsPanel
              broadcasts={broadcastsForPanel}
              teamMembers={broadcastTeamMembers}
              canCompose={canBroadcast}
              currentUserId={user.id}
              refreshLimit={1}
              nowMs={overviewNowMs}
            />
          </div>
        </div>
        {/* Who is at work today. The board API scopes itself to the caller's
            own tenant and returns presence only. Grid wrapper stretches the
            card to the row height. */}
        <div className={styles.half} style={{ display: "grid" }}><PresenceCard /></div>
        {canViewPerformance && <div className={styles.full}><TeamPerformanceCard /></div>}
      </div>
      {/* DM-only chat drawer. Reads the conversation list from
          ChatBadgeProvider in the app layout, so mounting it costs no extra
          request; project threads stay on /bridge.

          Mounted once for both breakpoints: the launcher and panel size
          themselves from .chat-dock-launcher / .chat-dock-panel in globals.css
          — a right-hand drawer on desktop, a full-screen sheet on mobile with
          the launcher raised clear of MobileNav. Rendering it twice behind
          .mobile-only / .desktop-only would mount two live subscriptions. */}
      <ChatDock userId={user.id} />
    </>
  );
}
