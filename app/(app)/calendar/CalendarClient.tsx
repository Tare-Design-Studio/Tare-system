"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, Card, CardTitle, Avatar } from "@/components/atoms";
import { PageHeader } from "../PageHeader";

type CalEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  visibility: string;
  source_type: string | null;
  project_id: string | null;
  enquiry_id: string | null;
  customer_id: string | null;
};

type CalUpdate = {
  id: string;
  update_type: string;
  body: string | null;
  author_role_on_project: string;
  created_at: string;
  project_id: string;
  users: { id: string; full_name: string; role: string } | null;
  projects: { id: string; name: string } | null;
};

function eventHref(e: CalEvent): string | null {
  if (e.customer_id) return `/customers/${e.customer_id}`;
  if (e.enquiry_id) return `/enquiries/${e.enquiry_id}`;
  if (e.project_id) return `/projects/${e.project_id}`;
  return null;
}

function updateHref(update: CalUpdate) {
  return `/projects/${update.project_id}`;
}

const TONE_MAP: Record<string, { bg: string; fg: string }> = {
  meeting: { bg: "var(--color-ink)", fg: "#F3EFE7" },
  site: { bg: "var(--color-forest)", fg: "#F3EFE7" },
  reminder: { bg: "#EED0D0", fg: "#7A3535" },
  payment: { bg: "#F5E0B5", fg: "#7A5518" },
  checkpoint: { bg: "#CCE5E0", fg: "#234A42" },
  task: { bg: "#EAE3D3", fg: "var(--color-ink)" },
};

function eventTone(e: CalEvent) {
  return TONE_MAP[e.source_type ?? ""] ?? TONE_MAP["task"];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDay(iso: string) {
  return new Date(iso).getDate();
}

function fmtUpdateTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function monthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function weeksOf(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0).getDate();
  // Mon-based week: Mon=0 … Sun=6
  const startDow = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const UPDATE_COLORS: Record<string, string> = {
  note: "#6B7280",
  image: "#0EA5E9",
  drawing: "#8B5CF6",
  progress: "#10B981",
  remark: "#F59E0B",
  material: "#EF4444",
  expense: "#EC4899",
};

const UPDATE_ICONS: Record<string, any> = {
  note: "check",
  image: "image",
  drawing: "layers",
  progress: "trend",
  remark: "mail",
  material: "building",
  expense: "wallet",
};

const CornerArrow = () => (
  <button style={{
    width: 34, height: 34, borderRadius: 12,
    background: "rgba(30,28,24,.04)",
    color: "var(--color-ink)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    border: "none", cursor: "pointer"
  }}>
    <Icon name="arrowUR" size={14} />
  </button>
);

// Add-event modal
function AddEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (e: CalEvent) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!title.trim() || !date) return;
    setLoading(true);
    const starts_at = new Date(`${date}T${time}:00`).toISOString();
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, starts_at, visibility: "tenant" }),
    });
    setLoading(false);
    if (res.ok) {
      onCreated(await res.json());
      onClose();
    }
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10,
    border: "1px solid var(--color-line)", fontSize: 13,
    background: "var(--color-paper-light)", color: "var(--color-ink)",
    fontFamily: "inherit", marginBottom: 10,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(27,26,23,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 20, padding: 28, width: 380, boxShadow: "0 20px 60px -20px rgba(27,26,23,.4)" }}>
        <div className="font-serif" style={{ fontSize: 22, fontWeight: 400, marginBottom: 20, letterSpacing: -0.3 }}>Add Event</div>
        <input style={input} placeholder="Event title *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input style={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input style={input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={submit}
            disabled={loading || !title.trim() || !date}
            style={{ flex: 1, padding: 10, borderRadius: 10, background: "var(--color-forest)", color: "#FFF", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: loading || !title.trim() || !date ? 0.5 : 1 }}
          >
            {loading ? "Saving…" : "Add"}
          </button>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "none", fontSize: 13, cursor: "pointer", color: "var(--color-tan)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DayUpdatesCard({ day, month, year, updates }: {
  day: number | null;
  month: number;
  year: number;
  updates: CalUpdate[];
}) {
  const dayLabel = day
    ? `${DAY_LABELS[(new Date(year, month, day).getDay() + 6) % 7]} ${day} ${MONTH_NAMES[month].slice(0, 3)}`
    : "Select a day";

  return (
    <Card style={{ marginTop: 16 }}>
      <CardTitle
        title="Updates"
        subtitle={dayLabel}
        action={<CornerArrow />}
      />

      <div style={{ padding: "0 24px 24px" }}>
        {!day ? (
          <div style={{ color: "var(--color-tan)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
            Choose a date to see its project updates.
          </div>
        ) : updates.length === 0 ? (
          <div style={{ color: "var(--color-tan)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
            No updates logged for this day.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {updates.map((update, i) => {
              const author = update.users;
              const project = update.projects;
              const typeColor = UPDATE_COLORS[update.update_type] ?? "#6B7280";
              const iconName = UPDATE_ICONS[update.update_type] ?? "check";

              return (
                <Link
                  href={updateHref(update)}
                  key={update.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1fr",
                    gap: 12,
                    alignItems: "flex-start",
                    textDecoration: "none",
                    color: "inherit"
                  }}
                >
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>
                      {fmtUpdateTime(update.created_at)}
                    </div>
                  </div>
                  <div style={{
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "rgba(234,227,211,.4)",
                    border: "1px solid var(--color-line)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, letterSpacing: -0.1, color: "var(--color-ink)" }}>
                      <Icon name={iconName as any} size={14} color={typeColor} />
                      <span style={{ textTransform: "capitalize" }}>{update.update_type}</span>
                      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-tan)", marginLeft: "auto" }}>
                        {project?.name ?? "Project"}
                      </span>
                    </div>
                    {update.body && (
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {update.body}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <Avatar name={author?.full_name ?? "Unknown"} size={18} />
                      <span style={{ fontSize: 10, color: "var(--color-tan)" }}>
                        {author?.full_name ?? "Unknown"} · {update.author_role_on_project.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <button style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 12, border: "1px dashed var(--color-line)", color: "var(--color-tan)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", cursor: "pointer" }}>
          View all updates
        </button>
      </div>
    </Card>
  );
}

export default function CalendarClient({ initial, initialUpdates, initialYear, initialMonth, todayYear, todayMonth, todayDate }: {
  initial: CalEvent[];
  initialUpdates: CalUpdate[];
  initialYear: number;
  initialMonth: number;
  todayYear: number;
  todayMonth: number;
  todayDate: number;
}) {
  // "Today" is computed on the server and passed in as props. Calling
  // `new Date()` during render here would make the server and client disagree
  // (different clock/timezone), aborting hydration and killing every button.
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<number | null>(
    initialYear === todayYear && initialMonth === todayMonth ? todayDate : null
  );
  const [events, setEvents] = useState<CalEvent[]>(initial);
  const [updates, setUpdates] = useState<CalUpdate[]>(initialUpdates);
  const [filterType, setFilterType] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  const weeks = weeksOf(year, month);

  const eventsThisMonth = events.filter((e) => {
    const d = new Date(e.starts_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const filtered = eventsThisMonth.filter((e) =>
    filterType === "all" || e.source_type === filterType
  );

  const eventsByDay: Record<number, CalEvent[]> = {};
  for (const e of filtered) {
    const d = fmtDay(e.starts_at);
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(e);
  }

  const updatesByDay: Record<number, CalUpdate[]> = {};
  for (const update of updates) {
    const d = fmtDay(update.created_at);
    if (!updatesByDay[d]) updatesByDay[d] = [];
    updatesByDay[d].push(update);
  }

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];
  const selectedUpdates = selectedDay ? (updatesByDay[selectedDay] ?? []) : [];
  const upcomingEvents = filtered
    .filter((e) => fmtDay(e.starts_at) > (selectedDay ?? 0))
    .slice(0, 5);

  async function navigate(dy: number, dm: number) {
    let ny = dy;
    let nm = dm;
    if (nm < 0) { ny -= 1; nm = 11; }
    if (nm > 11) { ny += 1; nm = 0; }
    setYear(ny); setMonth(nm); setSelectedDay(null);

    setLoading(true);
    const monthParam = monthKey(ny, nm);
    const [eventsRes, updatesRes] = await Promise.all([
      fetch(`/api/calendar?month=${monthParam}`),
      fetch(`/api/calendar/updates?month=${monthParam}`),
    ]);
    if (eventsRes.ok) setEvents(await eventsRes.json());
    if (updatesRes.ok) setUpdates(await updatesRes.json());
    setLoading(false);
  }

  const typeFilters = ["all", "meeting", "site", "reminder", "payment", "checkpoint"];

  return (
    <div style={{ padding: "0 0 40px" }}>
      <style>{`
        @media (max-width: 767px) {
          .cal-nav-row { flex-wrap: wrap; gap: 10px !important; }
          .cal-nav-left { flex: 1 1 100%; }
          .cal-filters { flex: 1 1 100%; padding-bottom: 0 !important; }
          .cal-day-btn { height: 40px !important; border-radius: 10px !important; }
          .cal-day-label { font-size: 9px !important; }
          .cal-right-panel { margin-top: 14px; }
        }
      `}</style>

      {adding && (
        <AddEventModal
          onClose={() => setAdding(false)}
          onCreated={(e) => { setEvents((prev) => [...prev, e]); }}
        />
      )}

      <PageHeader
        title="Calendar"
        subtitle={`${MONTH_NAMES[month]} ${year} · ${eventsThisMonth.length} events`}
        actions={
          <button
            onClick={() => setAdding(true)}
            style={{ padding: "8px 16px", borderRadius: 10, background: "var(--color-forest)", color: "#FFF", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Icon name="plus" size={13} color="#FFF" /> Add Event
          </button>
        }
      />

      <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "flex-start" }}>
        {/* Month grid */}
        <div>
          {/* Navigation + type filters */}
          <div className="cal-nav-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 6 }}>
            <div className="cal-nav-left" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => navigate(year, month - 1)}
                style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(30,28,24,.05)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <Icon name="arrowLeft" size={15} />
              </button>
              <span className="font-serif" style={{ fontSize: 22, letterSpacing: -0.5, fontWeight: 400, whiteSpace: "nowrap" }}>
                {MONTH_NAMES[month]} {year}
              </span>
              <button
                onClick={() => navigate(year, month + 1)}
                style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(30,28,24,.05)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <Icon name="arrowUR" size={15} style={{ transform: "rotate(90deg)" }} />
              </button>
              <button
                onClick={() => { setYear(todayYear); setMonth(todayMonth); setSelectedDay(todayDate); }}
                style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(30,28,24,.05)", border: "none", cursor: "pointer", fontSize: 12, color: "var(--color-tan)", flexShrink: 0 }}
              >
                Today
              </button>
            </div>
            <div className="cal-filters" style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
              {typeFilters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  style={{
                    padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                    border: "none", cursor: "pointer", flexShrink: 0,
                    background: filterType === f ? "var(--color-ink)" : "rgba(30,28,24,.05)",
                    color: filterType === f ? "#F3EFE7" : "var(--color-tan)",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <Card style={{ padding: 20 }}>
            {/* Day labels */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
              {DAY_LABELS.map((d) => (
                <div key={d} className="cal-day-label" style={{ textAlign: "center", fontSize: 11, color: "var(--color-tan)", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 500, padding: "4px 0" }}>
                  {d.slice(0, 1)}
                </div>
              ))}
            </div>
            {/* Weeks */}
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
                {week.map((day, di) => {
                  const isToday = day === todayDate && year === todayYear && month === todayMonth;
                  const isSelected = day === selectedDay;
                  const hasEvent = day !== null && !!eventsByDay[day]?.length;
                  return (
                    <button
                      key={di}
                      className="cal-day-btn"
                      onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                      style={{
                        height: 48, borderRadius: 12,
                        background: isSelected ? "var(--color-ink)" : isToday ? "var(--color-forest)" : "transparent",
                        color: isSelected || isToday ? "#FBF8F2" : day ? "var(--color-ink)" : "transparent",
                        border: "none", cursor: day ? "pointer" : "default",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: isSelected || isToday ? 600 : 400 }}>{day}</span>
                      {hasEvent && !isSelected && (
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: isToday ? "rgba(255,255,255,.6)" : "var(--color-forest)" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </Card>

          <DayUpdatesCard
            day={selectedDay}
            month={month}
            year={year}
            updates={selectedUpdates}
          />
        </div>

        {/* Right panel: selected day events + upcoming */}
        <div className="cal-right-panel">
          {loading && (
            <div style={{ textAlign: "center", padding: 20, color: "var(--color-tan)", fontSize: 12 }}>Loading…</div>
          )}

          {selectedDay && (
            <Card style={{ marginBottom: 14 }}>
              <CardTitle
                title="Events"
                subtitle={`${DAY_LABELS[(new Date(year, month, selectedDay).getDay() + 6) % 7]} ${selectedDay} · ${selectedEvents.length} events`}
                action={<CornerArrow />}
              />
              <div style={{ padding: "0 24px 24px" }}>
                {selectedEvents.length === 0 ? (
                  <div style={{ color: "var(--color-tan)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>No events scheduled</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedEvents.map((e) => {
                      const t = eventTone(e);
                      const href = eventHref(e);
                      const inner = (
                        <div style={{
                          padding: "12px 14px",
                          borderRadius: 14,
                          background: t.bg,
                          color: t.fg,
                          textDecoration: "none",
                          display: "block",
                          boxShadow: "0 10px 24px -14px rgba(27,26,23,.2)"
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>{e.title}</div>
                          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{e.description || "No description"}</div>
                          {e.source_type === "reminder" && e.description && (
                            <span style={{
                              display: "inline-block", marginTop: 8,
                              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                              background: "rgba(255,255,255,.25)", color: t.fg,
                            }}>
                              {e.description.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          )}
                        </div>
                      );
                      return (
                        <div key={e.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ paddingTop: 4 }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>{fmt(e.starts_at)}</div>
                            {e.ends_at && (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>{fmt(e.ends_at)}</div>
                            )}
                          </div>
                          {href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner}
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={() => setAdding(true)}
                  style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 12, border: "1px dashed var(--color-line)", color: "var(--color-tan)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", cursor: "pointer" }}
                >
                  <Icon name="plus" size={13} /> Schedule event
                </button>
              </div>
            </Card>
          )}

          {/* Upcoming */}
          {upcomingEvents.length > 0 && (
            <Card>
              <CardTitle
                title="Upcoming"
                subtitle="Next 5 events"
                action={<CornerArrow />}
              />
              <div style={{ padding: "0 24px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {upcomingEvents.map((e) => {
                    const t = eventTone(e);
                    const href = eventHref(e);
                    const inner = (
                      <div style={{
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: t.bg,
                        color: t.fg,
                        textDecoration: "none",
                        display: "block",
                        boxShadow: "0 10px 24px -14px rgba(27,26,23,.2)"
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }}>{e.title}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.75 }}>{fmt(e.starts_at)}</span>
                          {e.source_type === "reminder" && e.description && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                              background: "rgba(255,255,255,.25)", color: t.fg,
                            }}>
                              {e.description.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                    return (
                      <div key={e.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ paddingTop: 4, textAlign: "right" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>
                            {String(fmtDay(e.starts_at)).padStart(2, "0")}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>
                            {MONTH_NAMES[new Date(e.starts_at).getMonth()].slice(0, 3)}
                          </div>
                        </div>
                        {href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner}
                      </div>
                    );
                  })}
                </div>
                <button style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 12, border: "1px dashed var(--color-line)", color: "var(--color-tan)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", cursor: "pointer" }}>
                  View full schedule
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
