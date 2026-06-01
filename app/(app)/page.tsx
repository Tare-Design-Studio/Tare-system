import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverNowMs } from "@/lib/serverNow";
import { Avatar } from "@/components/atoms";
import MobileHome, { type MobileProject } from "./MobileHome";
import TeamMemberHome from "./TeamMemberHome";
import { BroadcastsPanel } from "./team/BroadcastsPanel";

// ── Helpers ────────────────────────────────────────────────────────────
function computeGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function computeDayLabel(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-IN", { weekday: "long" });
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${day} · ${date} · Overview`;
}

function computeWeek(): { dates: number[]; todayIdx: number } {
  const today = new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.getDate();
  });
  return { dates, todayIdx: dow === 0 ? 6 : dow - 1 };
}

// ── Shared card style ──────────────────────────────────────────────────
const C = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
} as React.CSSProperties;

// ── Sub-components ─────────────────────────────────────────────────────

function CardHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
      <div>
        <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 6 }}>{subtitle}</div>
      </div>
      <div style={{
        width: 34, height: 34, borderRadius: 12, background: "rgba(30,28,24,.04)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "var(--color-ink)",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17 17 7" /><path d="M8 7h9v9" />
        </svg>
      </div>
    </div>
  );
}

function Pillar({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: "ink" | "forest" | "teal" | "pattern" }) {
  const bg = tone === "ink" ? "var(--color-ink)" : tone === "forest" ? "var(--color-forest)" : tone === "teal" ? "var(--color-teal)" : "transparent";
  const fg = tone === "pattern" ? "var(--color-ink)" : "#FBF8F2";
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>{label}</div>
      <div style={{
        position: "relative", height: 38, borderRadius: 999,
        background: tone === "pattern" ? "transparent" : "#E5DEC8",
        border: tone === "pattern" ? "1px solid var(--line-2, #D6CDBA)" : "none",
        overflow: "hidden", display: "flex", alignItems: "center",
      }}>
        {tone === "pattern" && (
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(135deg, transparent 0 5px, rgba(30,28,24,.12) 5px 6px)" }} />
        )}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: pct + "%",
          background: bg, borderRadius: 999, display: "flex", alignItems: "center", padding: "0 14px",
          color: fg, fontSize: 12, fontWeight: 600,
        }}>{tone !== "pattern" ? value : null}</div>
        {tone === "pattern" && (
          <span style={{ position: "relative", marginLeft: 14, fontSize: 12, fontWeight: 600, color: "var(--color-ink)" }}>{value}</span>
        )}
      </div>
    </div>
  );
}

type DashCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  source_type: string | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function eventTone(sourceType: string | null, index: number): "ink" | "forest" | "sand" {
  if (sourceType === "site" || sourceType === "checkpoint") return "forest";
  if (sourceType === "meeting") return "ink";
  return index % 3 === 0 ? "ink" : index % 3 === 1 ? "forest" : "sand";
}

function CalendarCard({ dates, todayIdx, events }: { dates: number[]; todayIdx: number; events: DashCalendarEvent[] }) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  type EventTone = "ink" | "forest" | "sand";
  const visibleEvents = events.slice(0, 3).map((e, i) => ({
    time: fmtTime(e.starts_at),
    end: e.ends_at ? fmtTime(e.ends_at) : "",
    title: e.title,
    sub: e.description ?? (e.source_type ? e.source_type.replace(/_/g, " ") : "Calendar event"),
    tone: eventTone(e.source_type, i) as EventTone,
  }));

  return (
    <Link href="/calendar" style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
      <div style={{ ...C, height: "100%", display: "flex", flexDirection: "column" }}>
        <CardHead title="Calendar" subtitle={`Today · ${events.length} ${events.length === 1 ? "event" : "events"}`} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 18, padding: "8px 4px", borderTop: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }}>
          {days.map((d, i) => (
            <div key={i} style={{ textAlign: "center", padding: "4px 0" }}>
              <div style={{ fontSize: 10, color: "var(--color-tan)", letterSpacing: 1, textTransform: "uppercase" }}>{d}</div>
              <div style={{
                marginTop: 6, width: 30, height: 30, borderRadius: "50%", margin: "6px auto 0",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: i === todayIdx ? "var(--color-forest)" : "transparent",
                color: i === todayIdx ? "#FBF8F2" : "var(--color-ink)",
                fontSize: 14, fontWeight: i === todayIdx ? 600 : 400,
              }}>{dates[i]}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          {visibleEvents.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-tan)", fontSize: 13 }}>
              No events today
            </div>
          ) : visibleEvents.map((e, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "flex-start" }}>
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>{e.time}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>{e.end}</div>
              </div>
              <div style={{
                padding: "12px 14px", borderRadius: 14,
                background: e.tone === "ink" ? "var(--color-ink)" : e.tone === "sand" ? "#EAE3D3" : "var(--color-forest)",
                color: e.tone === "sand" ? "var(--color-ink)" : "#FBF8F2",
                boxShadow: e.tone === "ink" ? "0 10px 24px -14px rgba(27,26,23,.4)" : "none",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>{e.title}</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{e.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, padding: 10, borderRadius: 12, border: "1px dashed var(--line-2, #D6CDBA)", color: "var(--color-tan)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", width: "100%" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Open calendar
        </div>
      </div>
    </Link>
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
    <Link href={`/projects/${p.id}`} style={{ textDecoration: "none", color: "inherit", minWidth: 260, padding: 16, borderRadius: 16, border: "1px solid var(--color-line)", background: "var(--bg-2, #EDE7DB)", flexShrink: 0, display: "block" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
      <div style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 12 }}>{p.site_location ?? "—"}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {type && (
          <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 999, background: "#EAE3D3", color: "#3A3833", fontSize: 11, fontWeight: 500 }}>{type}</span>
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, background: "#EAE3D3", color: "#3A3833", fontSize: 11, fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT[p.status] ?? "var(--color-tan)", flexShrink: 0 }} />
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
    <div style={{ ...C, display: "flex", flexDirection: "column", height: "100%" }}>
      <CardHead title="Projects" subtitle={`${execution.length} in execution · ${design.length} in design`} />
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
  const items = updates.slice(0, 5);
  const hasItems = items.length > 0;

  return (
    <div style={{ ...C, height: "100%", display: "flex", flexDirection: "column" }}>
      <CardHead title="Updates" subtitle={hasItems ? `${updates.length} recent updates` : "Recent activity"} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {!hasItems ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-tan)", fontSize: 13 }}>
            No recent updates
          </div>
        ) : items.map((e) => {
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
                background: isMint ? "#D6E0CF" : "#EAE3D3",
                color: isMint ? "#3E5A41" : "var(--color-ink)",
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
      </div>
      <Link href="/updates" style={{ marginTop: 14, padding: 10, borderRadius: 12, border: "1px dashed var(--line-2, #D6CDBA)", color: "var(--color-tan)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", cursor: "pointer", width: "100%", textDecoration: "none" }}>
        View all updates
      </Link>
    </div>
  );
}

function capitaliseType(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

type AvatarTone = "ink" | "sand" | "rust" | "mint" | "amber" | "rose" | "teal" | "indigo" | "forest";

type TeamCardMember = {
  id: string;
  initials: string;
  name: string;
  role: string;
  tone: AvatarTone;
  primary: string;
  secondary: string;
  score: string;
  scoreTone: string;
  pos: number;
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
}

function roleTone(role: string): AvatarTone {
  if (role === "owner") return "forest";
  if (role === "site_engineer") return "amber";
  return "indigo";
}

function formatHours(minutes: number) {
  if (minutes <= 0) return "0h";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function AgentsCard({ members, totalMembers }: { members: TeamCardMember[]; totalMembers: number }) {
  return (
    <Link href="/team" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div style={{ ...C }}>
        <CardHead title="Team" subtitle={`${totalMembers} member${totalMembers === 1 ? "" : "s"} · live snapshot`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {members.length === 0 ? (
            <div style={{ color: "var(--color-tan)", fontSize: 13, padding: "8px 0" }}>No team members yet</div>
          ) : members.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <Avatar initials={a.initials} tone={a.tone} size={38} />
                <div style={{
                  position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%",
                  background: "var(--color-paper-light)", border: "2px solid var(--color-paper-light)",
                  boxShadow: "0 0 0 1px var(--color-line)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)",
                }}>{a.pos}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-tan)" }}>{a.primary}</div>
                <div style={{ fontSize: 10, color: "var(--color-tan)", marginTop: 2 }}>{a.secondary}</div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: a.scoreTone, fontWeight: 600, textAlign: "right" }}>{a.score}</div>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
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
    const today = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [assignedProjects, tasks, broadcastRows, memberTasksRes, attendanceRes, remindersRes] = await Promise.all([
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
        .select("id, title, completed, completed_at, created_at")
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
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projects = (assignedProjects.data ?? [])
      .map((r) => r.projects)
      .filter(Boolean)
      .flat() as any[];

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

    const { dates, todayIdx } = computeWeek();
    return (
      <>
        <div className="mobile-only">
          <MobileHome
            firstName={firstName}
            dates={dates}
            todayIdx={todayIdx}
            calendarEvents={[]}
            projects={projects}
            financeData={null}
            teamMembers={[]}
            totalMembers={0}
            updates={[]}
          />
        </div>
        <div className="desktop-only">
          <TeamMemberHome
            firstName={firstName}
            projects={projects}
            tasks={tasks.data ?? []}
            broadcasts={broadcasts}
            memberTasks={(memberTasksRes.data ?? []) as { id: string; title: string; completed: boolean; completed_at: string | null; created_at: string }[]}
            todayAttendance={attendanceRes.data ?? null}
            reminders={(remindersRes.data ?? []) as { id: string; title: string; reminder_at: string; type: string; is_done: boolean }[]}
          />
        </div>
      </>
    );
  }

  // Owner — full dashboard (existing view)
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayStart = `${todayStr}T00:00:00.000Z`;
  const todayEnd = `${todayStr}T23:59:59.999Z`;
  const currentMonthStart = `${todayStr.slice(0, 7)}-01`;
  const currentMonthStartIso = `${currentMonthStart}T00:00:00.000Z`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const canBroadcastRes = await supabase.rpc("has_capability", { p_capability: "broadcast:create" });
  const canBroadcast = canBroadcastRes.data === true;
  const overviewNowMs = serverNowMs();

  const [projectsRes, scheduleRes, expensesRes, calendarRes, membersRes, attendanceRes, memberTasksRes, tagsRes, siteCheckInsRes, dashUpdatesRes, enquiriesCountRes, updatesTodayCountRes, activeProjectsCountRes, broadcastsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, slug, project_type, status, current_stage, site_location, project_checkpoints(completed_at)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("v_payment_status")
      .select("amount_due, amount_received"),
    supabase
      .from("expenses")
      .select("amount")
      .eq("approval_status", "approved")
      .is("deleted_at", null),
    supabase
      .from("calendar_events")
      .select("id, title, description, starts_at, ends_at, source_type")
      .gte("starts_at", todayStart)
      .lte("starts_at", todayEnd)
      .order("starts_at", { ascending: true }),
    supabase
      .from("users")
      .select("id, full_name, role, is_active")
      .is("deleted_at", null)
      .order("full_name"),
    db
      .from("attendance_logs")
      .select("user_id, work_date, check_in_at, total_minutes")
      .gte("work_date", currentMonthStart)
      .lte("work_date", todayStr)
      .not("check_in_at", "is", null),
    db
      .from("member_tasks")
      .select("user_id, completed, created_at")
      .order("created_at", { ascending: false }),
    db
      .from("team_member_tags")
      .select("user_id, tag"),
    db
      .from("site_check_ins")
      .select("user_id, checked_in_at")
      .gte("checked_in_at", currentMonthStartIso),
    supabase
      .from("updates")
      .select(`id, update_type, body, created_at, project_id,
        users:author_id (id, full_name, role),
        projects:project_id (id, name)`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("enquiries")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("updates")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase
      .from("owner_broadcasts")
      .select(`id, body, created_at, edited_at,
        users:author_id (id, full_name),
        owner_broadcast_recipients (user_id, is_acknowledged, users:user_id (id, full_name))`)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const projects: DashProject[] = (projectsRes.data ?? []) as DashProject[];
  const calendarEvents = (calendarRes.data ?? []) as DashCalendarEvent[];
  const recentUpdates = (dashUpdatesRes.data ?? []) as DashUpdate[];

  let grandDue = 0;
  let grandReceived = 0;
  for (const row of scheduleRes.data ?? []) {
    grandDue += Number(row.amount_due);
    grandReceived += Number(row.amount_received);
  }
  let grandExpenses = 0;
  for (const row of (expensesRes.data ?? []) as { amount: number | string }[]) {
    grandExpenses += Number(row.amount);
  }
  const financeData = {
    due: grandDue,
    received: grandReceived,
    outstanding: grandDue - grandReceived,
    expenses: grandExpenses,
  };

  const activeProjectsCount = activeProjectsCountRes.count ?? 0;
  const totalEnquiriesCount = enquiriesCountRes.count ?? 0;
  const updatesTodayCount = updatesTodayCountRes.count ?? 0;

  type MemberRow = { id: string; full_name: string; role: string; is_active: boolean };
  type AttendanceRow = { user_id: string; work_date: string; check_in_at: string | null; total_minutes: number | null };
  type MemberTaskRow = { user_id: string; completed: boolean; created_at: string };
  type TagRow = { user_id: string; tag: string };
  type SiteCheckInRow = { user_id: string; checked_in_at: string };

  const attendanceByUser = new Map<string, { days: number; total_minutes: number }>();
  for (const row of (attendanceRes.data ?? []) as AttendanceRow[]) {
    const existing = attendanceByUser.get(row.user_id) ?? { days: 0, total_minutes: 0 };
    existing.days += 1;
    existing.total_minutes += row.total_minutes ?? 0;
    attendanceByUser.set(row.user_id, existing);
  }

  const tasksByUser = new Map<string, { total: number; completed: number }>();
  for (const row of (memberTasksRes.data ?? []) as MemberTaskRow[]) {
    const existing = tasksByUser.get(row.user_id) ?? { total: 0, completed: 0 };
    existing.total += 1;
    if (row.completed) existing.completed += 1;
    tasksByUser.set(row.user_id, existing);
  }

  const tagsByUser = new Map<string, string[]>();
  for (const row of (tagsRes.data ?? []) as TagRow[]) {
    const existing = tagsByUser.get(row.user_id) ?? [];
    existing.push(row.tag);
    tagsByUser.set(row.user_id, existing);
  }

  const siteCheckInsByUser = new Map<string, number>();
  for (const row of (siteCheckInsRes.data ?? []) as SiteCheckInRow[]) {
    siteCheckInsByUser.set(row.user_id, (siteCheckInsByUser.get(row.user_id) ?? 0) + 1);
  }

  const teamRows = ((membersRes.data ?? []) as MemberRow[]).filter((m) => m.is_active !== false);
  const teamMembers = teamRows
    .map((m) => {
      const attendance = attendanceByUser.get(m.id) ?? { days: 0, total_minutes: 0 };
      const tasks = tasksByUser.get(m.id) ?? { total: 0, completed: 0 };
      const tags = tagsByUser.get(m.id) ?? [];
      const checkIns = siteCheckInsByUser.get(m.id) ?? 0;
      const completion = tasks.total > 0 ? Math.round((tasks.completed / tasks.total) * 100) : 0;
      const rankScore = m.role === "site_engineer"
        ? checkIns
        : attendance.days * 10 + Math.round(attendance.total_minutes / 60) + completion;
      return {
        id: m.id,
        initials: initials(m.full_name),
        name: m.full_name,
        role: m.role,
        tone: roleTone(m.role),
        primary: m.role === "site_engineer"
          ? `${checkIns} site check-in${checkIns === 1 ? "" : "s"} this month`
          : `${attendance.days} present day${attendance.days === 1 ? "" : "s"} · ${formatHours(attendance.total_minutes)}`,
        secondary: tags.length > 0
          ? tags.map((tag) => formatRole(tag)).join(" · ")
          : formatRole(m.role),
        score: m.role === "site_engineer" ? `${checkIns}` : tasks.total > 0 ? `${completion}%` : "New",
        scoreTone: m.role === "site_engineer" ? "var(--color-amber)" : completion >= 70 ? "var(--color-mint)" : "var(--color-tan)",
        rankScore,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map((m, index) => ({ ...m, pos: index + 1 }));

  const { dates, todayIdx } = computeWeek();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastsForPanel = (broadcastsRes.data ?? []) as any;
  const broadcastTeamMembers = teamRows
    .filter((m) => m.id !== user.id)
    .map((m) => ({ id: m.id, full_name: m.full_name }));

  return (
    <>
      <div className="mobile-only">
        <MobileHome
          firstName={firstName}
          dates={dates}
          todayIdx={todayIdx}
          calendarEvents={calendarEvents}
          projects={projects}
          financeData={financeData}
          teamMembers={teamMembers}
          totalMembers={teamRows.length}
          updates={recentUpdates}
        />
      </div>
      <div className="desktop-only">
        {/* Hero strip */}
        <div style={{ padding: "8px 4px 28px" }}>
          <div style={{ fontSize: 13, color: "var(--color-tan)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            {computeDayLabel()}
          </div>
          <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 64, letterSpacing: -1.5, lineHeight: 1 }}>
            Good {computeGreeting()},{" "}
            <em style={{ color: "var(--color-forest)", fontStyle: "italic" }}>{firstName}</em>
          </h1>
          <div style={{ fontSize: 14, color: "var(--ink-2, #3A3833)", marginTop: 12 }}>
            <b>Your practice overview.</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginTop: 26, maxWidth: 620 }}>
            <Pillar label="Active Projects" value={String(activeProjectsCount)} pct={62} tone="ink" />
            <Pillar label="Total Enquiries" value={String(totalEnquiriesCount)} pct={58} tone="forest" />
            <Pillar label="Updates Today" value={String(updatesTodayCount)} pct={70} tone="teal" />
          </div>
        </div>

        {/* 12-col grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 18 }}>
          <div style={{ gridColumn: "span 3" }}><CalendarCard dates={dates} todayIdx={todayIdx} events={calendarEvents} /></div>
          <div style={{ gridColumn: "span 6" }}><ProjectsCard projects={projects} /></div>
          <div style={{ gridColumn: "span 3" }}><UpdatesCard updates={recentUpdates} /></div>
          <div style={{ gridColumn: "span 8" }}>
            <div style={{ ...C, height: "100%" }}>
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
          <div style={{ gridColumn: "span 4" }}><AgentsCard members={teamMembers} totalMembers={teamRows.length} /></div>
        </div>
      </div>
    </>
  );
}
