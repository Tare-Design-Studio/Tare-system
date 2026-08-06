import Link from "next/link";
import BroadcastsCard from "./team-member/BroadcastsCard";
import TasksCard from "./team-member/TasksCard";
import AttendanceCard from "./team-member/AttendanceCard";
import LeaveCard from "./team-member/LeaveCard";
import PresenceCard from "./team-member/PresenceCard";
import RemindersCard from "./team-member/RemindersCard";
import AddUpdateCard from "./team-member/AddUpdateCard";

function computeGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function computeDayLabel(): string {
  const d = new Date();
  const day  = d.toLocaleDateString("en-IN", { weekday: "long" });
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${day} · ${date}`;
}

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

type Project = {
  id: string;
  name: string;
  status: string;
  project_type: string | null;
  project_checkpoints: { completed_at: string | null }[];
};

type DailyTask = {
  id: string;
  description: string;
  is_done: boolean;
  task_date: string;
};

type Broadcast = {
  id: string;
  body: string;
  created_at: string;
  sender_name: string;
  is_acknowledged: boolean;
};

type MemberTask = {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

type AttendanceLog = {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_minutes: number | null;
  accumulated_minutes: number | null;
  last_check_in_at: string | null;
  check_in_count: number;
};

type PersonalReminder = {
  id: string;
  title: string;
  reminder_at: string;
  type: string;
  is_done: boolean;
};

function computeProgress(checkpoints: { completed_at: string | null }[]): number {
  if (!checkpoints.length) return 0;
  return Math.round(
    checkpoints.filter((c) => c.completed_at !== null).length / checkpoints.length * 100
  );
}

const STATUS_DOT: Record<string, string> = {
  active:    "var(--color-forest)",
  completed: "var(--color-mint)",
  on_hold:   "var(--color-amber)",
};

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7"/><path d="M8 7h9v9"/>
  </svg>
);

export default function TeamMemberHome({
  firstName,
  projects,
  tasks,
  broadcasts,
  memberTasks,
  todayAttendance,
  reminders,
  pickerProjects = [],
  memberNames = {},
}: {
  firstName: string;
  projects: Project[];
  tasks: DailyTask[];
  broadcasts: Broadcast[];
  memberTasks: MemberTask[];
  todayAttendance: AttendanceLog | null;
  reminders: PersonalReminder[];
  // Every active project in the tenant — what the task and update pickers list.
  // `projects` above stays the member's own assignments (the My Projects card).
  pickerProjects?: { id: string; name: string }[];
  /** id → full name, so an assigned task can name who sent it. */
  memberNames?: Record<string, string>;
}) {
  const active = projects.filter((p) => p.status === "active");
  const unacknowledged = broadcasts.filter((b) => !b.is_acknowledged);
  const pendingTasks = memberTasks.filter((t) => !t.completed);

  return (
    <div>
      {/* Hero strip */}
      <div style={{ padding: "8px 4px 28px" }}>
        <div style={{ fontSize: 13, color: "var(--color-tan)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
          {computeDayLabel()} · Your workspace
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 64, letterSpacing: -1.5, lineHeight: 1 }}>
          Good {computeGreeting()},{" "}
          <em style={{ color: "var(--color-forest)", fontStyle: "italic" }}>{firstName}</em>
        </h1>
        <div style={{ fontSize: 14, color: "var(--color-tan)", marginTop: 10 }}>
          {active.length} active project{active.length !== 1 ? "s" : ""} · {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending
        </div>
      </div>

      {/* Attendance runs the full width directly under the hero: it is the one
          time-critical action on the page, and pulling the tallest card out of a
          side rail is what stops the neighbouring cards being stretched to match it. */}
      <div style={{ marginBottom: 18 }}>
        <AttendanceCard todayAttendance={todayAttendance} layout="wide" />
      </div>

      {/* Two columns, not three: one seam instead of two, so the page has a
          single ragged edge rather than a hole in the middle. The wide left side
          is the work surface (what Zahra does); the narrow right rail is status
          she only glances at. Inside the left column the small cards pair up in
          rows so the two sides run out of content at roughly the same depth. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 18, alignItems: "start" }}>

        {/* Work surface */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div style={{ ...C }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>My Projects</div>
                <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 6 }}>{active.length} active</div>
              </div>
              <Link href="/projects" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 12, background: "rgba(30,28,24,.04)", color: "var(--color-ink)", textDecoration: "none" }}>
                <ArrowIcon />
              </Link>
            </div>
            {projects.length === 0 ? (
              <div style={{ color: "var(--color-tan)", fontSize: 13, padding: "24px 0" }}>No projects assigned yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {projects.slice(0, 6).map((p) => {
                  const pct = computeProgress(p.project_checkpoints);
                  const type = p.project_type?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: "none", display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center", padding: "12px 14px", borderRadius: 14, background: "var(--color-bg)", color: "var(--color-ink)" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>{type}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 120 }}>
                        <div style={{ flex: 1, height: 5, background: "var(--color-line)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ width: pct + "%", height: "100%", background: STATUS_DOT[p.status] ?? "var(--color-tan)" }} />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, width: 32, textAlign: "right" }}>{pct}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tasks run the full width of the work surface — it is the card a
              member actually works in, and the extra width lets a task title,
              its project and its due date sit on one line instead of wrapping. */}
          <TasksCard initialTasks={memberTasks} projects={pickerProjects} memberNames={memberNames} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
            <RemindersCard initialReminders={reminders} />

            <div style={{ ...C }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>Bridge</div>
              <Link href="/bridge" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 12, background: "rgba(30,28,24,.04)", color: "var(--color-ink)", textDecoration: "none" }}>
                <ArrowIcon />
              </Link>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-tan)" }}>
              Your project coordination channels. Post updates, request materials, and collaborate with the site team.
            </div>
              <Link href="/bridge" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, padding: "9px 16px", borderRadius: 10, background: "var(--color-forest)", color: "#FFF", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                Open Bridge
              </Link>
            </div>
          </div>
        </div>

        {/* Status rail — glanceable, not acted on */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <PresenceCard />
          <LeaveCard />
          <BroadcastsCard broadcasts={broadcasts} />
          {/* Assigned projects only, unlike the task picker: posting an update
              writes to the project, and the image upload route requires a
              project_assignments row. Listing more would mean a 403 mid-post. */}
          <AddUpdateCard projects={active} />
        </div>

      </div>
    </div>
  );
}
