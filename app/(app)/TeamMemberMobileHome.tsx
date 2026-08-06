import Link from "next/link";
import { Avatar } from "@/components/atoms";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { signOut } from "@/app/(auth)/actions";
import BroadcastsCard from "./team-member/BroadcastsCard";
import TasksCard from "./team-member/TasksCard";
import AttendanceCard from "./team-member/AttendanceCard";
import LeaveCard from "./team-member/LeaveCard";
import PresenceCard from "./team-member/PresenceCard";
import RemindersCard from "./team-member/RemindersCard";
import AddUpdateCard from "./team-member/AddUpdateCard";

/* ── Types ───────────────────────────────────────────────────────── */

export type MemberProject = {
  id: string;
  name: string;
  status: string;
  project_type: string | null;
  project_checkpoints: { completed_at: string | null }[];
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

/* ── Helpers ─────────────────────────────────────────────────────── */

function computeGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

function computeDateLabel(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-IN", { weekday: "short" });
  const month = d.toLocaleDateString("en-IN", { month: "short" });
  return `${day} · ${month} ${d.getDate()}`;
}

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

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, padding: "0 16px" }}>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, letterSpacing: -0.3 }}>{children}</div>
      {href && (
        <Link href={href} style={{ fontSize: 11, color: "var(--color-tan)", textDecoration: "none", fontWeight: 500 }}>See all →</Link>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

interface TeamMemberMobileHomeProps {
  firstName: string;
  projects: MemberProject[];
  broadcasts: Broadcast[];
  memberTasks: MemberTask[];
  todayAttendance: AttendanceLog | null;
  reminders: PersonalReminder[];
  pickerProjects?: { id: string; name: string }[];
  /** id → full name, so an assigned task can name who sent it. */
  memberNames?: Record<string, string>;
}

export default function TeamMemberMobileHome({
  firstName,
  projects,
  broadcasts,
  memberTasks,
  todayAttendance,
  reminders,
  pickerProjects = [],
  memberNames = {},
}: TeamMemberMobileHomeProps) {
  const initials = firstName.slice(0, 2).toUpperCase();
  const active = projects.filter((p) => p.status === "active");
  const pendingTasks = memberTasks.filter((t) => !t.completed);

  return (
    <div style={{ padding: "4px 0 120px" }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 10, padding: "8px 16px 0" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--color-tan)", letterSpacing: 0.6, textTransform: "uppercase" }}>
            {computeDateLabel()}
          </div>
          <div style={{
            fontFamily: "'Instrument Serif', serif", fontSize: 30, lineHeight: 1.05,
            marginTop: 2, letterSpacing: -0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {computeGreeting()},{" "}
            <em style={{ color: "var(--color-forest)", fontStyle: "italic" }}>{firstName}</em>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 4 }}>
            {active.length} active project{active.length !== 1 ? "s" : ""} · {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""} pending
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          <NotificationBell />
          <Avatar initials={initials} tone="forest" size={40} />
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              style={{
                width: 40, height: 40, borderRadius: 999, background: "rgba(30,28,24,.05)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "none", cursor: "pointer", color: "var(--color-tan)",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Attendance first — the one thing a member opens the phone to do. */}
      <div style={{ padding: "0 16px", marginBottom: 18 }}>
        <AttendanceCard todayAttendance={todayAttendance} />
      </div>

      {/* Tasks */}
      <div style={{ padding: "0 16px", marginBottom: 18 }}>
        <TasksCard initialTasks={memberTasks} projects={pickerProjects} memberNames={memberNames} />
      </div>

      {/* Projects — horizontal rail, same pattern as the owner view */}
      <SectionTitle href="/projects">My Projects</SectionTitle>
      {projects.length === 0 ? (
        <div style={{ margin: "0 16px 18px", padding: 16, borderRadius: 16, background: "var(--color-paper-light)", color: "var(--color-tan)", fontSize: 13, textAlign: "center" }}>
          No projects assigned yet
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 16px 18px", scrollbarWidth: "none" }}>
          {projects.slice(0, 8).map((p) => {
            const pct = computeProgress(p.project_checkpoints);
            const type = p.project_type?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            return (
              <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: "none", color: "inherit", flexShrink: 0, width: 210, display: "block" }}>
                <div style={{
                  borderRadius: 18, background: "var(--color-paper-light)",
                  boxShadow: "0 1px 0 #FFF inset, 0 8px 20px -12px rgba(30,28,24,.12)",
                  padding: 16, height: "100%",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-tan)", marginBottom: 14 }}>{type ?? "—"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: "var(--color-line)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: pct + "%", height: "100%", background: STATUS_DOT[p.status] ?? "var(--color-tan)" }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Post an update — assigned projects only, same constraint as desktop */}
      <div style={{ padding: "0 16px", marginBottom: 18 }}>
        <AddUpdateCard projects={active} />
      </div>

      {/* Leave */}
      <div style={{ padding: "0 16px", marginBottom: 18 }}>
        <LeaveCard />
      </div>

      {/* Reminders */}
      <div style={{ padding: "0 16px", marginBottom: 18 }}>
        <RemindersCard initialReminders={reminders} />
      </div>

      {/* Who's in today */}
      <div style={{ padding: "0 16px", marginBottom: 18 }}>
        <PresenceCard />
      </div>

      {/* Broadcasts */}
      <div style={{ padding: "0 16px", marginBottom: 18 }}>
        <BroadcastsCard broadcasts={broadcasts} />
      </div>

      {/* Bridge */}
      <div style={{ padding: "0 16px" }}>
        <div style={{
          background: "var(--color-paper-light)", borderRadius: 22, padding: 20,
          boxShadow: "0 1px 0 #FFF inset, 0 8px 20px -10px rgba(30,28,24,.1)",
          border: "1px solid rgba(30,28,24,.04)",
        }}>
          <div style={{ fontSize: 20, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3, marginBottom: 8 }}>Bridge</div>
          <div style={{ fontSize: 13, color: "var(--color-tan)" }}>
            Your project coordination channels. Post updates, request materials, and collaborate with the site team.
          </div>
          <Link href="/bridge" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, padding: "10px 18px", borderRadius: 10, background: "var(--color-forest)", color: "#FFF", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Open Bridge
          </Link>
        </div>
      </div>
    </div>
  );
}
