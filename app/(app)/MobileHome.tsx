import Link from "next/link";
import { Avatar } from "@/components/atoms";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/* ── Types ───────────────────────────────────────────────────────── */

export type MobileCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  source_type: string | null;
};

export type MobileProject = {
  id: string;
  name: string;
  status: string;
  current_stage?: string | null;
  site_location?: string | null;
  project_checkpoints: { completed_at: string | null }[];
};

export type MobileFinance = {
  due: number;
  received: number;
  outstanding: number;
  expenses: number;
};

export type MobileTeamMember = {
  id: string;
  initials: string;
  name: string;
  role: string;
  tone: "ink" | "sand" | "rust" | "mint" | "amber" | "rose" | "teal" | "indigo" | "forest";
  primary: string;
  score: string;
  scoreTone: string;
  pos: number;
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function fmtLakhs(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function computeProgress(checkpoints: { completed_at: string | null }[]): number {
  if (!checkpoints.length) return 0;
  return Math.round(checkpoints.filter(c => c.completed_at !== null).length / checkpoints.length * 100);
}

const STATUS_DOT: Record<string, string> = {
  active: "var(--color-forest)",
  completed: "var(--color-mint)",
  on_hold: "var(--color-amber)",
};

function eventTone(sourceType: string | null, index: number): "ink" | "forest" | "sand" {
  if (sourceType === "site" || sourceType === "checkpoint") return "forest";
  if (sourceType === "meeting") return "ink";
  return index % 3 === 0 ? "ink" : index % 3 === 1 ? "forest" : "sand";
}

/* ── Helper components ───────────────────────────────────────────── */

function SectionTitle({ children, href, style }: { children: React.ReactNode; href?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, ...style }}>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, letterSpacing: -0.3 }}>{children}</div>
      {href && (
        <Link href={href} style={{ fontSize: 11, color: "var(--color-tan)", textDecoration: "none", fontWeight: 500 }}>See all →</Link>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: 1, padding: "8px 10px", borderRadius: 10,
      background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(243,239,231,.55)", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

interface MobileHomeProps {
  firstName: string;
  dates: number[];
  todayIdx: number;
  calendarEvents: MobileCalendarEvent[];
  projects: MobileProject[];
  financeData: MobileFinance | null;
  teamMembers: MobileTeamMember[];
  totalMembers: number;
}

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

export default function MobileHome({
  firstName,
  dates,
  todayIdx,
  calendarEvents,
  projects,
  financeData,
  teamMembers,
  totalMembers,
}: MobileHomeProps) {
  const initials = firstName.slice(0, 2).toUpperCase();
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const openProjects = projects.filter(p => p.status !== "completed");
  const visibleEvents = calendarEvents.slice(0, 3);

  return (
    <div style={{ padding: "4px 0 120px" }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, marginBottom: 18, gap: 10, padding: "8px 20px 0" }}>
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
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <NotificationBell />
          <Avatar initials={initials} tone="forest" size={40} />
        </div>
      </div>

      {/* Collections card (dark) */}
      {financeData && (
        <Link href="/finance" style={{ textDecoration: "none", color: "inherit", display: "block", margin: "0 16px 16px" }}>
          <div style={{
            padding: 20, borderRadius: 20,
            background: "linear-gradient(135deg, #1E2530 0%, #2A3340 100%)",
            color: "#F3EFE7", position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", right: -30, top: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(45,106,79,.18)" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(243,239,231,.55)" }}>Total Received</div>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 42, lineHeight: 1, letterSpacing: -1.5, marginTop: 6 }}>{fmtLakhs(financeData.received)}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <MiniStat label="Projects" value={String(openProjects.length)} />
                <MiniStat label="Outstanding" value={fmtLakhs(financeData.outstanding)} />
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Calendar section */}
      <div style={{ padding: "0 16px" }}>
        <SectionTitle href="/calendar" style={{ marginTop: 22 }}>Schedule</SectionTitle>
      </div>
      <Link href="/calendar" style={{ textDecoration: "none", color: "inherit", display: "block", margin: "0 16px" }}>
        <div style={{
          background: "var(--color-paper-light)", borderRadius: 20, padding: 16,
          boxShadow: "0 1px 0 #FFF inset, 0 8px 20px -10px rgba(30,28,24,.1)",
        }}>
          {/* Week strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid var(--color-line)" }}>
            {days.map((d, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--color-tan)", letterSpacing: 1, textTransform: "uppercase" }}>{d}</div>
                <div style={{
                  marginTop: 4, width: 28, height: 28, borderRadius: "50%", margin: "4px auto 0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: i === todayIdx ? "var(--color-forest)" : "transparent",
                  color: i === todayIdx ? "#FBF8F2" : "var(--color-ink)",
                  fontSize: 13, fontWeight: i === todayIdx ? 600 : 400,
                }}>{dates[i]}</div>
              </div>
            ))}
          </div>

          {/* Events */}
          {visibleEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "12px 0", color: "var(--color-tan)", fontSize: 13 }}>No events today</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visibleEvents.map((e, i) => {
                const tone = eventTone(e.source_type, i);
                return (
                  <div key={e.id} style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ paddingTop: 4 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>{fmtTime(e.starts_at)}</div>
                      {e.ends_at && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>{fmtTime(e.ends_at)}</div>}
                    </div>
                    <div style={{
                      padding: "10px 12px", borderRadius: 12,
                      background: tone === "ink" ? "var(--color-ink)" : tone === "sand" ? "#EAE3D3" : "var(--color-forest)",
                      color: tone === "sand" ? "var(--color-ink)" : "#FBF8F2",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>{e.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{e.description ?? (e.source_type ? e.source_type.replace(/_/g, " ") : "Calendar event")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Link>

      {/* Active Projects */}
      <div style={{ padding: "0 16px" }}>
        <SectionTitle href="/projects" style={{ marginTop: 22 }}>Active Projects</SectionTitle>
      </div>
      {openProjects.length === 0 ? (
        <div style={{ margin: "0 16px", padding: 16, borderRadius: 16, background: "var(--color-paper-light)", color: "var(--color-tan)", fontSize: 13, textAlign: "center" }}>No active projects</div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", margin: "0 -4px", padding: "4px 16px 8px", scrollbarWidth: "none" }}>
          {openProjects.slice(0, 8).map(p => {
            const progress = computeProgress(p.project_checkpoints);
            const label = p.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            return (
              <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: "none", color: "inherit", flexShrink: 0, width: 220, display: "block" }}>
                <div style={{
                  borderRadius: 18, background: "var(--color-paper-light)",
                  boxShadow: "0 1px 0 #FFF inset, 0 8px 20px -12px rgba(30,28,24,.12)",
                  padding: 16, height: "100%",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-tan)", marginBottom: 10 }}>{p.site_location ?? "—"}</div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: "#EAE3D3", fontSize: 10, fontWeight: 500, color: "#3A3833" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS_DOT[p.status] ?? "var(--color-tan)", flexShrink: 0 }} />
                      {label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: "var(--color-line)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: progress + "%", height: "100%", background: "var(--color-ink)" }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{progress}%</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Team */}
      {teamMembers.length > 0 && (
        <>
          <div style={{ padding: "0 16px" }}>
            <SectionTitle href="/team" style={{ marginTop: 22 }}>Team</SectionTitle>
          </div>
          <Link href="/team" style={{ textDecoration: "none", color: "inherit", display: "block", margin: "0 16px" }}>
            <div style={{
              background: "var(--color-paper-light)", borderRadius: 20, padding: 16,
              boxShadow: "0 1px 0 #FFF inset, 0 8px 20px -10px rgba(30,28,24,.1)",
            }}>
              <div style={{ fontSize: 11, color: "var(--color-tan)", marginBottom: 12 }}>{totalMembers} member{totalMembers === 1 ? "" : "s"} · live snapshot</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {teamMembers.map(m => (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center" }}>
                    <div style={{ position: "relative" }}>
                      <Avatar initials={m.initials} tone={m.tone} size={36} />
                      <div style={{
                        position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%",
                        background: "var(--color-paper-light)", border: "2px solid var(--color-paper-light)",
                        boxShadow: "0 0 0 1px var(--color-line)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)",
                      }}>{m.pos}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-tan)" }}>{m.primary}</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: m.scoreTone, fontWeight: 600 }}>{m.score}</div>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        </>
      )}


    </div>
  );
}
