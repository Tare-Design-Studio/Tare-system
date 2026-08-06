"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

// Weekday + date, for the shift ribbon's hover. "Mon, 04 Aug" reads faster than
// a bare ISO string when you are scanning which day a short shift landed on.
function fmtDayLong(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short",
  });
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
  overtime_minutes: number | null;
  is_late: boolean | null;
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
  checked_out_at: string | null;
  duration_minutes: number | null;
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
  owner:         { label: "Owner",         tone: "forest" },
  team_member:   { label: "Team Member",   tone: "indigo" },
  site_engineer: { label: "Site Engineer", tone: "amber"  },
};

const STATUS_TONE: Record<string, "forest" | "amber" | "rose" | "sand" | "mint"> = {
  active: "forest",
  on_hold: "amber",
  completed: "mint",
};

// The widest range — offered when a range-scoped panel comes back empty.
const WIDEST_RANGE: Range = "year";

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
}

function roleTone(role: string): "forest" | "amber" | "indigo" {
  return role === "owner" ? "forest" : role === "site_engineer" ? "amber" : "indigo";
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function EmptyState({ message, actionLabel, onAction, href }: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
}) {
  return (
    <div className={styles.empty}>
      <div>{message}</div>
      {actionLabel && href && (
        <Link href={href} className={styles.emptyAction}>{actionLabel}</Link>
      )}
      {actionLabel && onAction && !href && (
        <button type="button" onClick={onAction} className={styles.emptyAction}>{actionLabel}</button>
      )}
    </div>
  );
}

function Card({ title, subtitle, note, children }: {
  title: string;
  subtitle?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {note && <span className={styles.cardNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

// Secondary numbers live here as inline label/value pairs rather than tiles, so
// they read as supporting detail instead of competing with the headline band.
function Facts({ items }: { items: { label: string; value: string | number; muted?: boolean }[] }) {
  return (
    <div className={styles.facts}>
      {items.map((f) => (
        <div key={f.label} className={styles.fact}>
          <span className={styles.factLabel}>{f.label}</span>
          <span className={`${styles.factValue} ${f.muted ? styles.factValueMuted : ""}`}>{f.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Headline band ───────────────────────────────────────────────────────────

function Headline({ cells }: {
  cells: {
    label: string;
    value: string | number;
    unit?: string;
    foot?: string;
    meterPct?: number;
    tone?: "clear" | "raised";
  }[];
}) {
  return (
    <div className={styles.headline}>
      {cells.map((c) => (
        <div key={c.label} className={styles.headlineCell}>
          <div className={styles.headlineLabel}>{c.label}</div>
          <div
            className={`${styles.headlineValue} ${
              c.tone === "clear" ? styles.flagClear : c.tone === "raised" ? styles.flagRaised : ""
            }`}
          >
            {c.value}
            {c.unit && <span className={styles.headlineUnit}>{c.unit}</span>}
          </div>
          {c.meterPct != null && (
            <div className={styles.meter}>
              <div className={styles.meterFill} style={{ width: `${Math.min(100, Math.max(0, c.meterPct))}%` }} />
            </div>
          )}
          {c.foot && <div className={styles.headlineFoot}>{c.foot}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Shift ribbon — the signature element ────────────────────────────────────
// One column per worked day, ordered oldest → newest. Bar height encodes hours
// worked against the tallest day in range, with overtime stacked on top in
// amber. A month of attendance reads as a skyline: short days, long days and
// gaps are visible at a glance instead of hiding inside a grid of day numbers.

function ShiftRibbon({ attendance }: { attendance: AttendanceLog[] }) {
  const days = useMemo(() => [...attendance].reverse(), [attendance]);
  const peak = useMemo(
    () => Math.max(...days.map((d) => d.total_minutes ?? 0), 60),
    [days]
  );
  // Which column's readout is showing. Hover and keyboard focus both set it, so
  // the ribbon is not mouse-only.
  const [hovered, setHovered] = useState<number | null>(null);

  if (days.length === 0) return null;

  return (
    <>
      <div className={styles.ribbonWrap}>
      <div className={styles.ribbon} role="img" aria-label={`Hours worked across ${days.length} days`}>
        {days.map((d, i) => {
          const total = d.total_minutes ?? 0;
          const ot = d.overtime_minutes ?? 0;
          const base = Math.max(0, total - ot);
          const open = !d.check_out_at;
          const delay = `${Math.min(i * 12, 400)}ms`;
          // Day, then the clock times behind the bar's height, then the
          // exceptions. A day with no check-in recorded omits the span rather
          // than showing an empty dash.
          const span = d.check_in_at
            ? `${fmtTime(d.check_in_at)}${d.check_out_at ? ` – ${fmtTime(d.check_out_at)}` : ""}`
            : null;
          const meta = [
            open ? "Still on the clock" : fmtHours(total),
            ot > 0 ? `+${fmtHours(ot)} overtime` : null,
          ].filter(Boolean).join(" · ");
          // Native title kept as the accessible/print fallback.
          const flat = [fmtDayLong(d.work_date), span, meta, d.is_late ? "late in" : null]
            .filter(Boolean).join(" · ");

          return (
            <div
              key={d.id}
              className={styles.ribbonCol}
              title={flat}
              tabIndex={0}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
            >
              {open ? (
                <div
                  className={`${styles.ribbonBar} ${styles.ribbonBarOpen}`}
                  style={{ height: "38%", animationDelay: delay }}
                />
              ) : (
                <>
                  {ot > 0 && (
                    <div
                      className={styles.ribbonBarOvertime}
                      style={{ height: `${(ot / peak) * 100}%`, animationDelay: delay }}
                    />
                  )}
                  <div
                    className={styles.ribbonBar}
                    style={{ height: `${(base / peak) * 100}%`, animationDelay: delay }}
                  />
                </>
              )}
              {hovered === i && (
                <div
                  className={styles.ribbonTip}
                  style={{
                    // Keep the card inside the ribbon at both ends instead of
                    // letting it hang off the edge.
                    left: i < 2 ? 0 : i > days.length - 3 ? "auto" : "50%",
                    right: i > days.length - 3 ? 0 : "auto",
                    transform: i < 2 || i > days.length - 3 ? "none" : "translateX(-50%)",
                  }}
                >
                  <div className={styles.ribbonTipDay}>{fmtDayLong(d.work_date)}</div>
                  {span && <div className={styles.ribbonTipSpan}>{span}</div>}
                  <div className={styles.ribbonTipMeta}>
                    {meta}
                    {d.is_late && <span className={styles.ribbonTipFlag}> · late in</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
      <div className={styles.ribbonFoot}>
        <span>{fmtDate(days[0].work_date)}</span>
        <span className={styles.ribbonLegend}>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: "rgba(45,106,79,0.55)" }} />
            Worked
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: "var(--color-amber)" }} />
            Overtime
          </span>
        </span>
        <span>{fmtDate(days[days.length - 1].work_date)}</span>
      </div>
    </>
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

function ProjectsCard({ projects }: { projects: Project[] }) {
  return (
    <Card
      title="Assignments"
      subtitle={projects.length > 0 ? `${projects.length} project${projects.length !== 1 ? "s" : ""}` : undefined}
    >
      {projects.length === 0 ? (
        <EmptyState message="Not assigned to a project yet." actionLabel="Assign from a project" href="/projects" />
      ) : (
        <div className={styles.rows}>
          {projects.map((pa, i) => {
            const p = pa.projects;
            if (!p) return null;
            return (
              <Link key={p.id ?? i} href={`/projects/${p.id}`} className={styles.row}>
                <span className={styles.rowStack}>
                  <span className={styles.rowName} style={{ display: "block" }}>{p.name}</span>
                  <span className={styles.rowSub}>
                    <Chip label={p.current_stage ?? "—"} tone="sand" size="sm" />
                    <Chip label={p.status} tone={STATUS_TONE[p.status] ?? "sand"} size="sm" />
                    {pa.contribution_pct != null && (
                      <>
                        <span className={styles.rowBar}>
                          <span className={styles.rowBarFill} style={{ width: `${pa.contribution_pct}%` }} />
                        </span>
                        <span className={styles.rowMeta}>{pa.contribution_pct}%</span>
                      </>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AttendancePanel({ attendance, range, onWiden }: {
  attendance: AttendanceLog[];
  range: Range;
  onWiden: () => void;
}) {
  const daysPresent = attendance.length;
  const totalMinutes = attendance.reduce((s, r) => s + (r.total_minutes ?? 0), 0);
  const avgMinutes = daysPresent > 0 ? Math.round(totalMinutes / daysPresent) : 0;
  const overtimeMinutes = attendance.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0);
  const otDays = attendance.filter((r) => (r.overtime_minutes ?? 0) > 0).length;
  const lateDays = attendance.filter((r) => r.is_late).length;
  const geofenceViolations = attendance.filter(
    (r) => r.check_in_within_geofence === false || r.check_out_within_geofence === false
  ).length;

  return (
    <Card
      title="Attendance"
      subtitle="Office hours, overtime and exceptions"
      note={daysPresent > 0 ? `${daysPresent} day${daysPresent !== 1 ? "s" : ""} logged` : undefined}
    >
      {daysPresent === 0 ? (
        <EmptyState
          message="No attendance logged in this range."
          actionLabel={range !== WIDEST_RANGE ? "Look at the full year" : undefined}
          onAction={onWiden}
        />
      ) : (
        <>
          <ShiftRibbon attendance={attendance} />
          <Facts
            items={[
              { label: "Total", value: fmtHours(totalMinutes) },
              { label: "Average day", value: fmtHours(avgMinutes) },
              { label: "Overtime", value: fmtHours(overtimeMinutes) },
              { label: "OT days", value: otDays, muted: otDays === 0 },
              { label: "Late in", value: lateDays, muted: lateDays === 0 },
              { label: "Geofence flags", value: geofenceViolations, muted: geofenceViolations === 0 },
            ]}
          />
        </>
      )}
    </Card>
  );
}

function TasksPanel({ dailyTasks, memberTasks, range, onWiden }: {
  dailyTasks: DailyTask[];
  memberTasks: MemberTask[];
  range: Range;
  onWiden: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleDaily = showAll ? dailyTasks : dailyTasks.slice(0, 12);

  const doneDaily = dailyTasks.filter((t) => t.is_done).length;
  const donePersistent = memberTasks.filter((t) => t.completed).length;

  if (dailyTasks.length === 0 && memberTasks.length === 0) {
    return (
      <Card title="Tasks" subtitle="Daily log and assigned tasks">
        <EmptyState
          message="No tasks in this range."
          actionLabel={range !== WIDEST_RANGE ? "Look at the full year" : undefined}
          onAction={onWiden}
        />
      </Card>
    );
  }

  return (
    <Card title="Tasks" subtitle="Daily log and assigned tasks">
      {dailyTasks.length > 0 && (
        <>
          <div className={styles.taskGroupLabel}>
            Daily log · {doneDaily} of {dailyTasks.length} done
          </div>
          <div className={styles.rows}>
            {visibleDaily.map((t) => (
              <div key={t.id} className={styles.row}>
                <span className={`${styles.taskCheck} ${t.is_done ? styles.taskCheckDone : ""}`}>
                  {t.is_done && <Icon name="check" size={9} />}
                </span>
                <span className={`${styles.rowName} ${t.is_done ? styles.taskDone : ""}`}>{t.description}</span>
                <span className={styles.rowMeta}>{fmtDate(t.task_date)}</span>
              </div>
            ))}
          </div>
          {dailyTasks.length > 12 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className={styles.linkBtn}>
              {showAll ? "Show fewer" : `Show all ${dailyTasks.length}`}
            </button>
          )}
        </>
      )}

      {memberTasks.length > 0 && (
        <>
          <div className={styles.taskGroupLabel}>
            Assigned · {donePersistent} of {memberTasks.length} done
          </div>
          <div className={styles.rows}>
            {memberTasks.slice(0, 20).map((t) => (
              <div key={t.id} className={styles.row}>
                <span className={`${styles.taskCheck} ${t.completed ? styles.taskCheckDone : ""}`}>
                  {t.completed && <Icon name="check" size={9} />}
                </span>
                <span className={`${styles.rowName} ${t.completed ? styles.taskDone : ""}`}>{t.title}</span>
                {t.completed && t.completed_at && (
                  <span className={styles.durationTag} title={`Took ${fmtDuration(t.created_at, t.completed_at)}`}>
                    {fmtDuration(t.created_at, t.completed_at)}
                  </span>
                )}
                <span className={styles.rowMeta}>
                  {t.completed && t.completed_at ? fmtDate(t.completed_at) : fmtDate(t.created_at)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function PerformancePanel({ performance, range, onWiden }: {
  performance: PerfRow[];
  range: Range;
  onWiden: () => void;
}) {
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
    <Card
      title="Performance"
      subtitle="Drawings, revisions and errors by month"
      note={performance.length > 0 ? `${performance.length} month${performance.length !== 1 ? "s" : ""}` : undefined}
    >
      {performance.length === 0 ? (
        <EmptyState
          message="No performance recorded in this range."
          actionLabel={range !== WIDEST_RANGE ? "Look at the full year" : undefined}
          onAction={onWiden}
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Drawings</th>
                  <th>Revisions</th>
                  <th>Errors</th>
                  <th>Deadline</th>
                  <th>Rating</th>
                  <th>Site delay</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((row) => (
                  <tr key={row.period_month}>
                    <td className={styles.tableMonth}>{row.period_month.slice(0, 7)}</td>
                    <td>{row.drawings_completed}</td>
                    <td>{row.revisions}</td>
                    <td className={row.errors > 0 ? styles.cellBad : undefined}>{row.errors}</td>
                    <td>{row.deadline_met_pct != null ? `${row.deadline_met_pct}%` : "—"}</td>
                    <td>{row.client_rating != null ? row.client_rating : "—"}</td>
                    <td className={row.site_delay_days > 0 ? styles.cellBad : undefined}>
                      {row.site_delay_days > 0 ? `${row.site_delay_days}d` : "—"}
                    </td>
                    <td className={styles.tableNote}>{row.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Facts
            items={[
              { label: "Drawings", value: totals.drawings },
              { label: "Revisions", value: totals.revisions },
              { label: "Errors", value: totals.errors, muted: totals.errors === 0 },
            ]}
          />
        </>
      )}
    </Card>
  );
}

function SiteHoursCard({ checkIns, range, onWiden }: {
  checkIns: CheckIn[];
  range: Range;
  onWiden: () => void;
}) {
  // Aggregate worked minutes per project. Open sessions have no duration yet, so
  // they count as a visit but add no time.
  const rows = useMemo(() => {
    const perProject = new Map<string, { name: string; minutes: number; sessions: number }>();
    for (const c of checkIns) {
      const key = c.project_id ?? "unknown";
      const name = c.projects?.name ?? "Unknown project";
      const entry = perProject.get(key) ?? { name, minutes: 0, sessions: 0 };
      entry.sessions += 1;
      if (c.duration_minutes != null) entry.minutes += c.duration_minutes;
      perProject.set(key, entry);
    }
    return [...perProject.values()].sort((a, b) => b.minutes - a.minutes);
  }, [checkIns]);

  const peak = Math.max(...rows.map((r) => r.minutes), 1);

  return (
    <Card title="Time on site" subtitle="Hours split across sites">
      {rows.length === 0 ? (
        <EmptyState
          message="No site time logged in this range."
          actionLabel={range !== WIDEST_RANGE ? "Look at the full year" : undefined}
          onAction={onWiden}
        />
      ) : (
        <div className={styles.rows}>
          {rows.map((r) => (
            <div key={r.name} className={styles.row}>
              <span className={styles.rowStack}>
                <span className={styles.rowName} style={{ display: "block" }}>{r.name}</span>
                <span className={styles.rowSub}>
                  <span className={styles.rowBar}>
                    <span className={styles.rowBarFill} style={{ width: `${(r.minutes / peak) * 100}%` }} />
                  </span>
                  <span className={styles.rowMeta}>
                    {fmtHours(r.minutes)} · {r.sessions} visit{r.sessions !== 1 ? "s" : ""}
                  </span>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CheckInsPanel({ checkIns, range, onWiden }: {
  checkIns: CheckIn[];
  range: Range;
  onWiden: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? checkIns : checkIns.slice(0, 15);
  const outsideZone = checkIns.filter((c) => !c.within_geofence).length;

  return (
    <Card
      title="Check-ins"
      subtitle="Every site visit in this range"
      note={checkIns.length > 0 ? `${checkIns.length} visit${checkIns.length !== 1 ? "s" : ""}` : undefined}
    >
      {checkIns.length === 0 ? (
        <EmptyState
          message="No check-ins in this range."
          actionLabel={range !== WIDEST_RANGE ? "Look at the full year" : undefined}
          onAction={onWiden}
        />
      ) : (
        <>
          <div className={styles.rows}>
            {visible.map((c) => (
              <div key={c.id} className={styles.row}>
                <span className={styles.checkinCol}>
                  <span className={styles.checkinTime}>
                    {fmtTime(c.checked_in_at)}{c.checked_out_at ? `–${fmtTime(c.checked_out_at)}` : ""}
                  </span>
                  <span className={styles.checkinDate}>
                    {fmtDate(c.checked_in_at)}
                    {c.checked_out_at ? ` · ${fmtHours(c.duration_minutes)}` : " · on site"}
                  </span>
                </span>
                <span className={styles.rowName}>{c.projects?.name ?? "Unknown project"}</span>
                {!c.within_geofence && <Chip label="Out of zone" tone="rose" size="sm" />}
              </div>
            ))}
          </div>
          {checkIns.length > 15 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className={styles.linkBtn}>
              {showAll ? "Show fewer" : `Show all ${checkIns.length}`}
            </button>
          )}
          <Facts
            items={[
              { label: "Visits", value: checkIns.length },
              { label: "Outside zone", value: outsideZone, muted: outsideZone === 0 },
            ]}
          />
        </>
      )}
    </Card>
  );
}

function BroadcastsCard({ broadcasts }: { broadcasts: BroadcastRecipient[] }) {
  const total = broadcasts.length;
  const acked = broadcasts.filter((b) => b.is_acknowledged).length;
  const ackRate = total > 0 ? Math.round((acked / total) * 100) : 0;

  return (
    <Card title="Broadcasts" subtitle="Owner announcements read">
      {total === 0 ? (
        <EmptyState message="No broadcasts sent to this person." actionLabel="Send a broadcast" href="/team" />
      ) : (
        <>
          <div className={styles.meter} style={{ marginTop: 4 }}>
            <div className={styles.meterFill} style={{ width: `${ackRate}%` }} />
          </div>
          <Facts
            items={[
              { label: "Acknowledged", value: `${acked}/${total}` },
              { label: "Read rate", value: `${ackRate}%`, muted: ackRate === 0 },
            ]}
          />
        </>
      )}
    </Card>
  );
}

// ─── Export menu ─────────────────────────────────────────────────────────────

function ExportMenu({ memberId, range, isSiteEngineer }: {
  memberId: string;
  range: Range;
  isSiteEngineer: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const base = `/api/team/${memberId}/export?range=${range}`;

  const items = isSiteEngineer
    ? [{ label: "Check-ins", href: `${base}&section=all` }]
    : [
        { label: "Everything", href: `${base}&section=all` },
        { label: "Attendance", href: `${base}&section=attendance` },
        { label: "Tasks", href: `${base}&section=tasks` },
        { label: "Performance", href: `${base}&section=performance` },
      ];

  return (
    <div className={styles.exportBtn} ref={ref}>
      <button
        type="button"
        className={styles.exportBtnToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon name="download" size={13} />
        Export
      </button>
      {open && (
        <div className={styles.exportMenu} role="menu">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={styles.exportMenuItem}
              role="menuitem"
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

// ─── Main client component ───────────────────────────────────────────────────

type TabKey = "overview" | "attendance" | "tasks" | "record";

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
  const [tab, setTab] = useState<TabKey>("overview");

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

  // Offered by empty range-scoped panels so "nothing here" has a next step.
  const widenRange = useCallback(() => {
    setRange(WIDEST_RANGE);
    fetchData(WIDEST_RANGE);
  }, [fetchData]);

  const { member, tags } = data;
  const isSiteEngineer = member.role === "site_engineer";
  const chip = ROLE_CHIP[member.role] ?? { label: member.role, tone: "indigo" as const };

  const attendance = data.attendance ?? [];
  const dailyTasks = data.dailyTasks ?? [];
  const memberTasks = data.memberTasks ?? [];
  const checkIns = data.checkIns ?? [];
  const performance = data.performance ?? [];

  // ── Headline figures ──────────────────────────────────────────────────────
  // Three numbers that answer "is this person doing well?". Everything else on
  // the page is supporting detail.
  const totalMinutes = attendance.reduce((s, r) => s + (r.total_minutes ?? 0), 0);
  const siteMinutes = checkIns.reduce((s, c) => s + (c.duration_minutes ?? 0), 0);
  const hoursValue = isSiteEngineer ? siteMinutes : totalMinutes;
  const daysCounted = isSiteEngineer
    ? new Set(checkIns.map((c) => c.checked_in_at.slice(0, 10))).size
    : attendance.length;

  const totalTasks = dailyTasks.length + memberTasks.length;
  const doneTasks = dailyTasks.filter((t) => t.is_done).length + memberTasks.filter((t) => t.completed).length;
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const lateDays = attendance.filter((r) => r.is_late).length;
  const geoFlags = isSiteEngineer
    ? checkIns.filter((c) => !c.within_geofence).length
    : attendance.filter(
        (r) => r.check_in_within_geofence === false || r.check_out_within_geofence === false
      ).length;
  const flags = lateDays + geoFlags;

  const headlineCells = [
    {
      label: isSiteEngineer ? "Hours on site" : "Hours worked",
      value: hoursValue > 0 ? Math.floor(hoursValue / 60) : "—",
      unit: hoursValue > 0 ? "h" : undefined,
      foot: daysCounted > 0 ? `across ${daysCounted} day${daysCounted !== 1 ? "s" : ""}` : "nothing logged yet",
    },
    {
      label: "Tasks completed",
      value: totalTasks > 0 ? completionPct : "—",
      unit: totalTasks > 0 ? "%" : undefined,
      meterPct: totalTasks > 0 ? completionPct : undefined,
      foot: totalTasks > 0 ? `${doneTasks} of ${totalTasks} done` : "no tasks in range",
    },
    {
      label: "Flags",
      value: flags,
      tone: (flags === 0 ? "clear" : "raised") as "clear" | "raised",
      foot:
        flags === 0
          ? "clean record this range"
          : [lateDays > 0 ? `${lateDays} late` : null, geoFlags > 0 ? `${geoFlags} out of zone` : null]
              .filter(Boolean)
              .join(" · "),
    },
  ];

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "attendance", label: isSiteEngineer ? "Site visits" : "Attendance", count: isSiteEngineer ? checkIns.length : attendance.length },
    { key: "tasks", label: "Tasks", count: totalTasks },
    ...(isSiteEngineer ? [] : [{ key: "record" as TabKey, label: "Performance", count: performance.length }]),
  ];

  return (
    <div className={styles.surface}>
      <Link href="/team" className={styles.backLink}>
        <Icon name="arrowLeft" size={13} />
        Team
      </Link>

      <header className={styles.masthead}>
        <div className={styles.headerLeft}>
          <Avatar initials={initials(member.full_name)} tone={roleTone(member.role)} size={60} />
          <div className={styles.headerInfo}>
            <div className={styles.eyebrow}>
              <Chip label={member.role_label ?? chip.label} tone={chip.tone} size="sm" />
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
                  <a href={`tel:${member.phone}`} className={styles.metaLink}>{member.phone}</a>
                </span>
              )}
              {member.experience_years != null && (
                <span className={styles.metaItem}>
                  <Icon name="star" size={11} />
                  <span className={styles.metaValue}>{member.experience_years} yrs</span>&nbsp;experience
                </span>
              )}
              {member.skill_score != null && (
                <span className={styles.metaItem}>
                  Skill&nbsp;<span className={styles.metaValue}>{member.skill_score}</span>
                </span>
              )}
              {member.last_login_at && (
                <span className={styles.metaItem}>
                  <Icon name="clock" size={11} />
                  Last seen&nbsp;<span className={styles.metaValue}>{fmtDate(member.last_login_at)}</span>
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
                type="button"
                className={`${styles.rangePill} ${range === r ? styles.rangePillActive : ""}`}
                onClick={() => handleRange(r)}
                aria-pressed={range === r}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <ExportMenu memberId={memberId} range={range} isSiteEngineer={isSiteEngineer} />
        </div>
      </header>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <>
          <Headline cells={headlineCells} />

          <nav className={styles.tabs}>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
              >
                {t.label}
                {t.count != null && t.count > 0 && <span className={styles.tabCount}>{t.count}</span>}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <div className={`${styles.panel} ${styles.panelSplit}`}>
              <div className={styles.panel}>
                {isSiteEngineer ? (
                  <SiteHoursCard checkIns={checkIns} range={range} onWiden={widenRange} />
                ) : (
                  <AttendancePanel attendance={attendance} range={range} onWiden={widenRange} />
                )}
              </div>
              <div className={styles.panel}>
                <ProjectsCard projects={data.projects ?? []} />
                <BroadcastsCard broadcasts={data.broadcasts ?? []} />
              </div>
            </div>
          )}

          {tab === "attendance" && (
            <div className={styles.panel}>
              {isSiteEngineer ? (
                <>
                  <SiteHoursCard checkIns={checkIns} range={range} onWiden={widenRange} />
                  <CheckInsPanel checkIns={checkIns} range={range} onWiden={widenRange} />
                </>
              ) : (
                <AttendancePanel attendance={attendance} range={range} onWiden={widenRange} />
              )}
            </div>
          )}

          {tab === "tasks" && (
            <div className={styles.panel}>
              <TasksPanel dailyTasks={dailyTasks} memberTasks={memberTasks} range={range} onWiden={widenRange} />
            </div>
          )}

          {tab === "record" && (
            <div className={styles.panel}>
              <PerformancePanel performance={performance} range={range} onWiden={widenRange} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
