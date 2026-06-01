"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Avatar, Chip, Icon } from "@/components/atoms";
import styles from "./member-detail.module.css";

type Range = "month" | "3m" | "6m" | "year";

const RANGE_LABELS: Record<Range, string> = {
  month: "Month",
  "3m": "3M",
  "6m": "6M",
  year: "Year",
};

function fmtHours(minutes: number | null) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// Humanised time-to-complete for a persistent task (created_at → completed_at).
function fmtDuration(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return "<1h";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

type Member = {
  id: string;
  full_name: string;
  role: string;
  role_label: string | null;
  is_active: boolean;
  last_login_at: string | null;
  phone: string | null;
  experience_years: number | null;
  skill_score: number | null;
  salary_inr: number | null;
};

type Tag = { tag: string };

type Project = {
  contribution_pct: number | null;
  projects: { id: string; name: string; status: string; current_stage: string } | null;
};

type DailyTask = {
  id: string;
  description: string;
  task_date: string;
  is_done: boolean;
  done_at: string | null;
  project_id: string | null;
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
  check_in_within_geofence: boolean | null;
  check_out_within_geofence: boolean | null;
};

type PerfRow = {
  period_month: string;
  drawings_completed: number;
  errors: number;
  revisions: number;
  deadline_met_pct: number | null;
  client_rating: number | null;
  site_delay_days: number;
  notes: string | null;
};

type BroadcastRecipient = {
  broadcast_id: string;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  owner_broadcasts: { created_at: string; body: string } | null;
};

type CheckIn = {
  id: string;
  project_id: string | null;
  checked_in_at: string;
  within_geofence: boolean | null;
  projects: { name: string } | null;
};

type MemberData = {
  member: Member;
  tags: Tag[];
  // Site engineer
  checkIns?: CheckIn[];
  // Team member
  projects?: Project[];
  dailyTasks?: DailyTask[];
  memberTasks?: MemberTask[];
  attendance?: AttendanceLog[];
  performance?: PerfRow[];
  broadcasts?: BroadcastRecipient[];
};

const TAG_LABELS: Record<string, string> = {
  accountant: "Accountant",
  admin: "Admin",
  project_manager: "Project Manager",
};

const ROLE_CHIP: Record<string, { label: string; tone: "forest" | "indigo" | "amber" }> = {
  owner:         { label: "Owner",        tone: "forest" },
  team_member:   { label: "Team Member",  tone: "indigo" },
  site_engineer: { label: "Site Engineer", tone: "amber" },
};

const STATUS_TONE: Record<string, "forest" | "amber" | "rose" | "sand" | "mint"> = {
  active: "forest",
  on_hold: "amber",
  completed: "mint",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
}

function roleTone(role: string): "forest" | "amber" | "indigo" {
  return role === "owner" ? "forest" : role === "site_engineer" ? "amber" : "indigo";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatTile({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className={styles.statTile}>
      <div className={styles.statTileLabel}>{label}</div>
      <div className={styles.statTileValue}>
        {value}
        {unit && <span className={styles.statTileUnit}>{unit}</span>}
      </div>
    </div>
  );
}

function ProjectsCard({ projects }: { projects: Project[] }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Active Projects</h2>
          <p>{projects.length} assignment{projects.length !== 1 ? "s" : ""}</p>
        </div>
      </div>
      {projects.length === 0 ? (
        <div className={styles.empty}>No project assignments.</div>
      ) : (
        <div className={styles.projectList}>
          {projects.map((pa, i) => {
            const p = pa.projects;
            if (!p) return null;
            return (
              <Link key={p.id ?? i} href={`/projects/${p.id}`} className={styles.projectRow}>
                <span className={styles.projectName}>{p.name}</span>
                {pa.contribution_pct != null && (
                  <span className={styles.projectContrib}>{pa.contribution_pct}%</span>
                )}
                <Chip label={p.current_stage ?? "—"} tone="sand" size="sm" />
                <Chip label={p.status} tone={STATUS_TONE[p.status] ?? "sand"} size="sm" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttendanceCard({ attendance }: { attendance: AttendanceLog[] }) {
  const daysPresent = attendance.length;
  const totalMinutes = attendance.reduce((s, r) => s + (r.total_minutes ?? 0), 0);
  const avgMinutes = daysPresent > 0 ? Math.round(totalMinutes / daysPresent) : 0;
  const geofenceViolations = attendance.filter(
    (r) => r.check_in_within_geofence === false || r.check_out_within_geofence === false
  ).length;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Attendance</h2>
          <p>Office check-in / check-out logs</p>
        </div>
      </div>
      <div className={styles.statTiles}>
        <StatTile label="Days Present" value={daysPresent} unit="d" />
        <StatTile label="Total Hours" value={fmtHours(totalMinutes)} />
        <StatTile label="Avg / Day" value={fmtHours(avgMinutes)} />
        <StatTile label="Geofence Flags" value={geofenceViolations} />
      </div>
      {attendance.length > 0 && (
        <div className={styles.attendanceStrip}>
          {attendance.slice(0, 60).map((row) => {
            const day = new Date(row.work_date).getDate();
            const hasCheckout = !!row.check_out_at;
            return (
              <div
                key={row.id}
                className={`${styles.attendanceDay} ${hasCheckout ? styles.attendanceDayPresent : styles.attendanceDayPartial}`}
                title={`${row.work_date} · ${fmtHours(row.total_minutes)}`}
              >
                {day}
              </div>
            );
          })}
        </div>
      )}
      {attendance.length === 0 && <div className={styles.empty}>No attendance records in range.</div>}
    </div>
  );
}

function TasksCard({ dailyTasks, memberTasks }: { dailyTasks: DailyTask[]; memberTasks: MemberTask[] }) {
  const totalDaily = dailyTasks.length;
  const doneDaily = dailyTasks.filter((t) => t.is_done).length;
  const totalPersistent = memberTasks.length;
  const donePersistent = memberTasks.filter((t) => t.completed).length;
  const completionPct = (totalDaily + totalPersistent) > 0
    ? Math.round(((doneDaily + donePersistent) / (totalDaily + totalPersistent)) * 100)
    : 0;

  const [showAll, setShowAll] = useState(false);
  const visibleDaily = showAll ? dailyTasks : dailyTasks.slice(0, 10);

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Tasks</h2>
          <p>Daily log + persistent tasks in range</p>
        </div>
      </div>
      <div className={styles.statTiles}>
        <StatTile label="Daily Tasks" value={totalDaily} />
        <StatTile label="Completed" value={doneDaily} />
        <StatTile label="Persistent" value={`${donePersistent}/${totalPersistent}`} />
        <StatTile label="Completion" value={completionPct} unit="%" />
      </div>

      {dailyTasks.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Daily Log</div>
          <div className={styles.taskList}>
            {visibleDaily.map((t) => (
              <div key={t.id} className={styles.taskRow}>
                <div className={`${styles.taskCheck} ${t.is_done ? styles.taskCheckDone : ""}`}>
                  {t.is_done && <Icon name="check" size={10} />}
                </div>
                <div className={`${styles.taskTitle} ${t.is_done ? styles.taskDone : ""}`}>{t.description}</div>
                <div className={styles.taskDate}>{fmtDate(t.task_date)}</div>
              </div>
            ))}
          </div>
          {dailyTasks.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              style={{ marginTop: 10, fontSize: 12, color: "var(--color-forest)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
            >
              {showAll ? "Show less" : `Show all ${dailyTasks.length} tasks`}
            </button>
          )}
        </>
      )}

      {memberTasks.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "16px 0 8px" }}>Persistent Tasks</div>
          <div className={styles.taskList}>
            {memberTasks.slice(0, 20).map((t) => (
              <div key={t.id} className={styles.taskRow}>
                <div className={`${styles.taskCheck} ${t.completed ? styles.taskCheckDone : ""}`}>
                  {t.completed && <Icon name="check" size={10} />}
                </div>
                <div className={`${styles.taskTitle} ${t.completed ? styles.taskDone : ""}`}>{t.title}</div>
                {t.completed && t.completed_at && (
                  <span
                    title={`Completed in ${fmtDuration(t.created_at, t.completed_at)}`}
                    style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--color-forest)18", color: "var(--color-forest)", whiteSpace: "nowrap" }}
                  >
                    {fmtDuration(t.created_at, t.completed_at)}
                  </span>
                )}
                <div className={styles.taskDate}>{t.completed && t.completed_at ? fmtDate(t.completed_at) : fmtDate(t.created_at)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {dailyTasks.length === 0 && memberTasks.length === 0 && (
        <div className={styles.empty}>No tasks in this range.</div>
      )}
    </div>
  );
}

function PerformanceCard({ performance }: { performance: PerfRow[] }) {
  const totals = performance.reduce(
    (acc, row) => {
      acc.drawings += row.drawings_completed;
      acc.errors += row.errors;
      acc.revisions += row.revisions;
      return acc;
    },
    { drawings: 0, errors: 0, revisions: 0 }
  );

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Performance</h2>
          <p>Drawings, revisions, errors by month</p>
        </div>
      </div>
      <div className={styles.statTiles}>
        <StatTile label="Drawings" value={totals.drawings} />
        <StatTile label="Revisions" value={totals.revisions} />
        <StatTile label="Errors" value={totals.errors} />
        <StatTile label="Months" value={performance.length} />
      </div>
      {performance.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Drawings</th>
                <th>Revisions</th>
                <th>Errors</th>
                <th>Deadline %</th>
                <th>Rating</th>
                <th>Site Delay</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((row) => (
                <tr key={row.period_month}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{row.period_month.slice(0, 7)}</td>
                  <td>{row.drawings_completed}</td>
                  <td>{row.revisions}</td>
                  <td>
                    {row.errors > 0 ? (
                      <span style={{ color: "var(--color-rose)", fontWeight: 600 }}>{row.errors}</span>
                    ) : row.errors}
                  </td>
                  <td>{row.deadline_met_pct != null ? `${row.deadline_met_pct}%` : "—"}</td>
                  <td>{row.client_rating != null ? row.client_rating : "—"}</td>
                  <td>{row.site_delay_days > 0 ? `${row.site_delay_days}d` : "—"}</td>
                  <td style={{ color: "var(--color-tan)", fontSize: 11 }}>{row.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>No performance records in range.</div>
      )}
    </div>
  );
}

function BroadcastsCard({ broadcasts }: { broadcasts: BroadcastRecipient[] }) {
  const total = broadcasts.length;
  const acked = broadcasts.filter((b) => b.is_acknowledged).length;
  const ackRate = total > 0 ? Math.round((acked / total) * 100) : 0;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Broadcast Acknowledgements</h2>
          <p>Owner broadcast read rate</p>
        </div>
      </div>
      <div className={styles.statTiles} style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <StatTile label="Received" value={total} />
        <StatTile label="Acknowledged" value={acked} />
        <StatTile label="Ack Rate" value={ackRate} unit="%" />
      </div>
      {total === 0 && <div className={styles.empty}>No broadcasts received.</div>}
    </div>
  );
}

function CheckInsCard({ checkIns }: { checkIns: CheckIn[] }) {
  const total = checkIns.length;
  const withinGeo = checkIns.filter((c) => c.within_geofence).length;
  const projects = new Set(checkIns.map((c) => c.project_id).filter(Boolean)).size;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Site Check-Ins</h2>
          <p>All check-ins in selected range</p>
        </div>
      </div>
      <div className={styles.statTiles}>
        <StatTile label="Total Check-Ins" value={total} />
        <StatTile label="Within Geofence" value={withinGeo} />
        <StatTile label="Outside Geofence" value={total - withinGeo} />
        <StatTile label="Projects Visited" value={projects} />
      </div>
      {checkIns.length > 0 ? (
        <div className={styles.checkinList}>
          {checkIns.map((c) => (
            <div key={c.id} className={styles.checkinRow}>
              <div>
                <div className={styles.checkinTime}>{fmtTime(c.checked_in_at)}</div>
                <div className={styles.checkinDate}>{fmtDate(c.checked_in_at)}</div>
              </div>
              <div className={styles.checkinProject}>
                {(c.projects as { name: string } | null)?.name ?? "Unknown project"}
              </div>
              <Chip
                label={c.within_geofence ? "In Zone" : "Out of Zone"}
                tone={c.within_geofence ? "forest" : "rose"}
                size="sm"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>No check-ins in range.</div>
      )}
    </div>
  );
}

// ─── Export menu ─────────────────────────────────────────────────────────────

function ExportMenu({ memberId, range, isSiteEngineer }: { memberId: string; range: Range; isSiteEngineer: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const base = `/api/team/${memberId}/export?range=${range}`;

  const items = isSiteEngineer
    ? [{ label: "Check-Ins", href: `${base}&section=all` }]
    : [
        { label: "All Data", href: `${base}&section=all` },
        { label: "Attendance", href: `${base}&section=attendance` },
        { label: "Tasks", href: `${base}&section=tasks` },
        { label: "Performance", href: `${base}&section=performance` },
      ];

  return (
    <div className={styles.exportBtn} ref={ref}>
      <button className={styles.exportBtnToggle} onClick={() => setOpen((v) => !v)}>
        <Icon name="download" size={13} />
        Export CSV
      </button>
      {open && (
        <div className={styles.exportMenu}>
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={styles.exportMenuItem}
              download
              onClick={() => setOpen(false)}
            >
              <Icon name="file" size={13} />
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export default function MemberDetailClient({
  memberId,
  initialData,
  initialRange,
}: {
  memberId: string;
  initialData: MemberData;
  initialRange: Range;
}) {
  const [range, setRange] = useState<Range>(initialRange);
  const [data, setData] = useState<MemberData>(initialData);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (r: Range) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/team/${memberId}?range=${r}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  function handleRange(r: Range) {
    setRange(r);
    fetchData(r);
  }

  const { member, tags } = data;
  const isSiteEngineer = member.role === "site_engineer";
  const chip = ROLE_CHIP[member.role] ?? { label: member.role, tone: "indigo" as const };

  return (
    <div className={styles.surface}>
      <Link href="/team" className={styles.backLink}>
        <Icon name="arrowLeft" size={13} />
        Team
      </Link>

      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <Avatar initials={initials(member.full_name)} tone={roleTone(member.role)} size={56} />
          <div className={styles.headerInfo}>
            <div className={styles.eyebrow}>
              <Chip label={chip.label} tone={chip.tone} size="sm" />
              {tags.map((t) => (
                <Chip key={t.tag} label={TAG_LABELS[t.tag] ?? t.tag} tone="indigo" size="sm" />
              ))}
              {!member.is_active && <Chip label="Inactive" tone="sand" size="sm" />}
            </div>
            <h1 className={`font-serif ${styles.title}`}>{member.full_name}</h1>
            <div className={styles.metaRow}>
              {member.phone && (
                <span className={styles.metaItem}>
                  <Icon name="phone" size={11} />
                  <span className={styles.metaValue}>{member.phone}</span>
                </span>
              )}
              {member.experience_years != null && (
                <span className={styles.metaItem}>
                  <Icon name="star" size={11} />
                  <span className={styles.metaValue}>{member.experience_years} yrs exp</span>
                </span>
              )}
              {member.skill_score != null && (
                <span className={styles.metaItem}>
                  Skill:&nbsp;<span className={styles.metaValue}>{member.skill_score}</span>
                </span>
              )}
              {member.last_login_at && (
                <span className={styles.metaItem}>
                  Last seen:&nbsp;<span className={styles.metaValue}>{fmtDate(member.last_login_at)}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.rangeFilter}>
            {(["month", "3m", "6m", "year"] as Range[]).map((r) => (
              <button
                key={r}
                className={`${styles.rangePill} ${range === r ? styles.rangePillActive : ""}`}
                onClick={() => handleRange(r)}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <ExportMenu memberId={memberId} range={range} isSiteEngineer={isSiteEngineer} />
        </div>
      </div>

      {loading && <div className={styles.loading}>Loading…</div>}

      {!loading && (
        <div className={styles.grid12}>
          {isSiteEngineer ? (
            <div className={styles.col12}>
              <CheckInsCard checkIns={data.checkIns ?? []} />
            </div>
          ) : (
            <>
              <div className={styles.col4}>
                <ProjectsCard projects={data.projects ?? []} />
              </div>
              <div className={styles.col8}>
                <AttendanceCard attendance={data.attendance ?? []} />
              </div>
              <div className={styles.col12}>
                <TasksCard dailyTasks={data.dailyTasks ?? []} memberTasks={data.memberTasks ?? []} />
              </div>
              <div className={styles.col8}>
                <PerformanceCard performance={data.performance ?? []} />
              </div>
              <div className={styles.col4}>
                <BroadcastsCard broadcasts={data.broadcasts ?? []} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
