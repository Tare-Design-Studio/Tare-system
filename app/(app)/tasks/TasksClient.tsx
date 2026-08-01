"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Card, CardTitle, Chip, ConfirmPopover } from "@/components/atoms";
import { PageHeader } from "../PageHeader";

type TaskStatus = "open" | "accepted" | "in_progress" | "pending_review" | "completed";
type ReviewStatus = "clean" | "revision" | "error" | null;
type TaskTag = "drawing" | "review" | "site" | "admin" | "other";

type MemberTask = {
  id: string;
  user_id: string;
  title: string;
  tag: TaskTag;
  status: TaskStatus;
  completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  assigned_by: string | null;
  accepted_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type Member = { id: string; full_name: string; role: string };

type Props = {
  initialTasks: MemberTask[];
  initialAssigned: MemberTask[];
  initialReview: MemberTask[];
  members: Member[];
  canAssign: boolean;
};

const TAG_LABEL: Record<TaskTag, string> = {
  drawing: "Drawing", review: "Review", site: "Site", admin: "Admin", other: "Task",
};

// Selectable tags — tagging your own work makes it count properly in the
// performance algorithm (weights: drawing 3, review/site 2, admin/other 1).
const TAG_OPTIONS: TaskTag[] = ["drawing", "review", "site", "admin", "other"];

const TAG_TONE: Record<TaskTag, "indigo" | "teal" | "amber" | "sand" | "ink"> = {
  drawing: "indigo", review: "teal", site: "amber", admin: "sand", other: "ink",
};

const VERDICT: Record<Exclude<ReviewStatus, null>, { label: string; tone: "forest" | "amber" | "rust" }> = {
  clean: { label: "Approved", tone: "forest" },
  revision: { label: "Revision", tone: "amber" },
  error: { label: "Error", tone: "rust" },
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Not started",
  accepted: "Accepted",
  in_progress: "In progress",
  pending_review: "Awaiting review",
  completed: "Completed",
};

/** Format a millisecond duration as a short human string, e.g. "2d 4h", "3h", "45m". */
function fmtDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const remMins = mins % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return remMins ? `${hours}h ${remMins}m` : `${hours}h`;
  return `${remMins}m`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getMonthKey(iso: string) {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** True while the assigned task's clock is running (accepted → submitted). */
function isTiming(t: MemberTask) {
  return (t.status === "accepted" || t.status === "in_progress") && !!t.accepted_at;
}

const inputStyle: React.CSSProperties = {
  padding: "13px 16px",
  borderRadius: "var(--radius-input)",
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--color-ink)",
  outline: "none",
  boxSizing: "border-box",
  boxShadow: "var(--shadow-input)",
};

const miniInputStyle: React.CSSProperties = {
  padding: "2px 6px",
  height: 24,
  fontSize: 11,
  borderRadius: 8,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontFamily: "inherit",
  color: "var(--color-ink)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-tan)",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  display: "block",
  marginBottom: 6,
  fontWeight: 500,
};

export default function TasksClient({
  initialTasks,
  initialAssigned,
  initialReview,
  members,
  canAssign,
}: Props) {
  const [tab, setTab] = useState<"mine" | "assigned" | "review">("mine");
  const [tasks, setTasks] = useState<MemberTask[]>(initialTasks);
  const [assigned, setAssigned] = useState<MemberTask[]>(initialAssigned);
  const [review, setReview] = useState<MemberTask[]>(initialReview);

  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newTag, setNewTag] = useState<TaskTag>("other");
  const [newDue, setNewDue] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null); // "Is the task complete?" modal
  const [busyId, setBusyId] = useState<string | null>(null);

  // Assign modal (owner / PM)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [assignTag, setAssignTag] = useState<TaskTag>("other");
  const [assignDue, setAssignDue] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const memberName = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.full_name])),
    [members]
  );

  // Live clock so running timers tick without a refetch. Also drives the
  // "time logged" line in the submit-confirmation modal — which only opens on
  // an accepted/in_progress task, i.e. one whose clock is already running.
  const [now, setNow] = useState(() => Date.now());
  const anyTiming = tasks.some(isTiming);
  useEffect(() => {
    if (!anyTiming) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [anyTiming]);

  const months = useMemo(() => {
    const keys = new Set(tasks.map((t) => getMonthKey(t.created_at)));
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "pending" && t.completed) return false;
      if (filter === "completed" && !t.completed) return false;
      if (selectedMonth !== "all" && getMonthKey(t.created_at) !== selectedMonth) return false;
      return true;
    });
  }, [tasks, filter, selectedMonth]);

  const pending = tasks.filter((t) => !t.completed).length;
  const done = tasks.filter((t) => t.completed).length;

  async function reload(scope: "assigned" | "review") {
    const res = await fetch(`/api/member-tasks?scope=${scope}`);
    if (!res.ok) return;
    const rows: MemberTask[] = await res.json();
    if (scope === "assigned") setAssigned(rows);
    else setReview(rows);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/member-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated: MemberTask = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        setAssigned((prev) => prev.map((t) => (t.id === id ? updated : t)));
        setReview((prev) =>
          updated.status === "pending_review"
            ? prev.map((t) => (t.id === id ? updated : t))
            : prev.filter((t) => t.id !== id)
        );
      } else {
        const e = await res.json().catch(() => null);
        setActionError(e?.error ?? `Could not update the task (${res.status}).`);
      }
    } catch {
      setActionError("Network error — the task was not updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setActionError(null);
    try {
      const res = await fetch("/api/member-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tag: newTag, due_date: newDue || undefined }),
      });
      if (res.ok) {
        const task: MemberTask = await res.json();
        setTasks((prev) => [task, ...prev]);
        setNewTitle("");
        setNewDue("");
        setNewTag("other");
      } else {
        const e = await res.json().catch(() => null);
        setActionError(e?.error ?? `Could not add the task (${res.status}).`);
      }
    } catch {
      setActionError("Network error — the task was not added.");
    } finally {
      setAdding(false);
    }
  }

  async function submitAssign() {
    const title = assignTitle.trim();
    if (!title || !assignTo) return;
    setAssignSaving(true);
    setAssignError(null);
    try {
      const res = await fetch("/api/member-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          assignee_id: assignTo,
          tag: assignTag,
          due_date: assignDue || undefined,
        }),
      });
      if (res.ok) {
        await reload("assigned");
        setAssignOpen(false);
        setAssignTitle("");
        setAssignTo("");
        setAssignTag("other");
        setAssignDue("");
        setTab("assigned");
      } else {
        const json = await res.json().catch(() => ({}));
        setAssignError(json?.error ?? "Could not assign this task.");
      }
    } finally {
      setAssignSaving(false);
    }
  }

  async function saveEdit(id: string) {
    const title = editTitle.trim();
    if (!title) { setEditingId(null); return; }
    await patch(id, { title });
    setEditingId(null);
  }

  async function deleteTask(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/member-tasks/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      } else {
        const e = await res.json().catch(() => null);
        setActionError(e?.error ?? `Could not delete the task (${res.status}).`);
      }
    } catch {
      setActionError("Network error — the task was not deleted.");
    }
  }

  const confirmTask = tasks.find((t) => t.id === confirmId) ?? null;

  const pill = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", borderRadius: "var(--radius-chip)", fontSize: 13, fontWeight: 500, cursor: "pointer",
    border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
    background: active ? "var(--color-ink)" : "var(--color-paper-light)",
    color: active ? "#FBF8F2" : "var(--color-ink)", transition: "all .15s",
    boxShadow: active ? "none" : "0 1px 0 #FFF inset, 0 2px 4px -2px rgba(30,28,24,.04)",
  });

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="My Tasks"
        subtitle={`Personal & assigned · ${pending} pending · ${done} done`}
        actions={
          canAssign ? (
            <Button onClick={() => setAssignOpen(true)}>Assign task</Button>
          ) : undefined
        }
      />

      {actionError && (
        <p style={{
          fontSize: 12, color: "var(--color-rose)", margin: "0 0 16px",
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(196,106,106,0.08)", border: "1px solid rgba(196,106,106,0.2)",
        }}>
          {actionError}
        </p>
      )}

      {/* Tabs — only rendered for assigners; a plain member sees their list alone. */}
      {canAssign && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <button style={pill(tab === "mine")} onClick={() => setTab("mine")}>My tasks</button>
          <button style={pill(tab === "assigned")} onClick={() => setTab("assigned")}>
            Assigned by me{assigned.length ? ` · ${assigned.length}` : ""}
          </button>
          <button style={pill(tab === "review")} onClick={() => setTab("review")}>
            To review{review.length ? ` · ${review.length}` : ""}
          </button>
        </div>
      )}

      {tab === "mine" && (
        <>
          {/* Add task — tag + due date make your own work count in performance */}
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Add a new task…"
              style={{ ...inputStyle, flex: "1 1 260px", padding: "14px 18px", fontSize: 15 }}
            />
            <select
              value={newTag}
              onChange={(e) => setNewTag(e.target.value as TaskTag)}
              title="Task type — drives how it scores"
              style={{ ...inputStyle, flex: "0 0 auto", minWidth: 130, padding: "14px 12px", cursor: "pointer" }}
            >
              {TAG_OPTIONS.map((t) => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
            </select>
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              title="Due date (optional)"
              style={{ ...inputStyle, flex: "0 0 auto", minWidth: 150, padding: "14px 12px" }}
            />
            <Button onClick={addTask} disabled={adding || !newTitle.trim()} style={{ padding: "14px 24px" }}>
              Add
            </Button>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            <button style={pill(filter === "all")} onClick={() => setFilter("all")}>All</button>
            <button style={pill(filter === "pending")} onClick={() => setFilter("pending")}>Pending</button>
            <button style={pill(filter === "completed")} onClick={() => setFilter("completed")}>Completed</button>

            <div style={{ width: 1, height: 20, background: "var(--color-line)", margin: "0 6px" }} />

            <button style={pill(selectedMonth === "all")} onClick={() => setSelectedMonth("all")}>All time</button>
            {months.map((m) => (
              <button key={m} style={pill(selectedMonth === m)} onClick={() => setSelectedMonth(m)}>
                {monthLabel(m)}
              </button>
            ))}
          </div>

          {/* Task list */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--color-tan)", fontSize: 14 }}>
              No tasks match the current filter.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map((t) => {
                const isAssignedToMe = !!t.assigned_by;
                const timing = isTiming(t);
                const elapsedMs = timing && t.accepted_at ? now - new Date(t.accepted_at).getTime() : 0;
                const overdue = !t.completed && !!t.due_date && new Date(t.due_date) < new Date();
                const busy = busyId === t.id;

                return (
                  <div key={t.id} className="project-card" style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "18px 20px", borderRadius: "var(--radius-card)",
                    background: "var(--color-paper-light)",
                    border: "1px solid var(--color-line)",
                    boxShadow: "var(--shadow-card)",
                    opacity: t.completed ? 0.65 : 1,
                  }}>
                    {/* Self-set tasks keep the tick; assigned tasks use the lifecycle. */}
                    {!isAssignedToMe ? (
                      <button
                        onClick={() => patch(t.id, { completed: !t.completed })}
                        style={{
                          width: 22, height: 22, borderRadius: 7,
                          border: t.completed ? "none" : "2px solid var(--color-line)",
                          background: t.completed ? "var(--color-forest)" : "transparent",
                          cursor: "pointer", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {t.completed && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    ) : (
                      <span style={{ flexShrink: 0 }}>
                        <Chip size="sm" tone={TAG_TONE[t.tag]} label={TAG_LABEL[t.tag]} />
                      </span>
                    )}

                    {/* Title + meta line */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingId === t.id ? (
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => saveEdit(t.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t.id); if (e.key === "Escape") setEditingId(null); }}
                          className="font-serif"
                          style={{ width: "100%", padding: "4px 8px", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 22, outline: "none", background: "transparent", color: "var(--color-ink)" }}
                        />
                      ) : (
                        <span className="font-serif" style={{ fontSize: 22, letterSpacing: "-0.01em", textDecoration: t.completed ? "line-through" : "none", color: t.completed ? "var(--color-tan)" : "var(--color-ink)", lineHeight: 1.15 }}>
                          {t.title}
                        </span>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                        {isAssignedToMe && (
                          <span style={{ fontSize: 11, color: "var(--color-tan)" }}>
                            Assigned{memberName[t.assigned_by!] ? ` by ${memberName[t.assigned_by!]}` : ""}
                          </span>
                        )}

                        {/* Self-set + open → tag and due are editable inline, so a member's
                            own work carries the same scoring signal as assigned work. */}
                        {!isAssignedToMe && !t.completed ? (
                          <>
                            <select
                              value={t.tag}
                              disabled={busy}
                              onChange={(e) => patch(t.id, { tag: e.target.value })}
                              title="Task type — drives how it scores"
                              style={{ ...miniInputStyle, cursor: "pointer" }}
                            >
                              {TAG_OPTIONS.map((tg) => <option key={tg} value={tg}>{TAG_LABEL[tg]}</option>)}
                            </select>
                            <input
                              type="date"
                              value={t.due_date ?? ""}
                              disabled={busy}
                              onChange={(e) => patch(t.id, { due_date: e.target.value || null })}
                              title="Due date (optional)"
                              style={miniInputStyle}
                            />
                            {overdue && <span style={{ fontSize: 11, color: "var(--color-rust)" }}>overdue</span>}
                          </>
                        ) : (
                          t.due_date && (
                            <span style={{ fontSize: 11, color: overdue ? "var(--color-rust)" : "var(--color-tan)" }}>
                              Due {fmtDate(t.due_date)}{overdue ? " · overdue" : ""}
                            </span>
                          )
                        )}
                        {timing && (
                          <span className="mono" style={{ fontSize: 11, color: "var(--color-forest)" }}>
                            {fmtDuration(elapsedMs)}
                          </span>
                        )}
                        {t.status === "pending_review" && (
                          <span style={{ fontSize: 11, color: "var(--color-tan)" }}>Awaiting review</span>
                        )}
                        {t.status === "completed" && t.review_status && (
                          <Chip size="sm" tone={VERDICT[t.review_status].tone} label={VERDICT[t.review_status].label} />
                        )}
                        {!isAssignedToMe && t.completed && (
                          <span style={{ fontSize: 11, color: "var(--color-tan)" }}>{TAG_LABEL[t.tag]}</span>
                        )}
                        {t.completed && t.completed_at && !t.review_status && (
                          <span style={{ fontSize: 11, color: "var(--color-tan)" }}>Done {fmtDate(t.completed_at)}</span>
                        )}
                      </div>
                    </div>

                    {/* Lifecycle actions (assigned tasks) */}
                    {isAssignedToMe && t.status === "open" && (
                      <Button size="sm" disabled={busy} onClick={() => patch(t.id, { action: "accept" })} style={{ flexShrink: 0 }}>
                        {busy ? "…" : "Accept"}
                      </Button>
                    )}
                    {isAssignedToMe && t.status === "accepted" && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch(t.id, { action: "start" })} style={{ flexShrink: 0 }}>
                        {busy ? "…" : "Start"}
                      </Button>
                    )}
                    {isAssignedToMe && (t.status === "accepted" || t.status === "in_progress") && (
                      <Button size="sm" disabled={busy} onClick={() => setConfirmId(t.id)} title="Mark complete" style={{ flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Check
                      </Button>
                    )}

                    {/* Edit / delete (self-set only) */}
                    {!isAssignedToMe && !t.completed && (
                      <button
                        onClick={() => { setEditingId(t.id); setEditTitle(t.title); }}
                        style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "flex", borderRadius: 8, flexShrink: 0 }}
                        title="Edit"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )}
                    {!isAssignedToMe && (
                      <ConfirmPopover
                        title="Delete this task?"
                        message="This removes the task permanently."
                        onConfirm={() => deleteTask(t.id)}
                      >
                        {(open) => (
                          <button
                            onClick={open}
                            style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "flex", borderRadius: 8, flexShrink: 0 }}
                            title="Delete"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                            </svg>
                          </button>
                        )}
                      </ConfirmPopover>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Assigned by me */}
      {canAssign && tab === "assigned" && (
        <Card>
          <CardTitle title="Assigned by me" subtitle={`${assigned.length} task${assigned.length === 1 ? "" : "s"} handed to the team`} />
          {assigned.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0", color: "var(--color-tan)", fontSize: 14 }}>
              You have not assigned any tasks yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-line)" }}>
                    {["Task", "Assignee", "Type", "Due", "Status", "Logged", "Verdict"].map((h) => (
                      <th key={h} style={{
                        textAlign: h === "Task" || h === "Assignee" ? "left" : "center",
                        padding: "8px 12px 12px",
                        fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase",
                        letterSpacing: 0.6, fontWeight: 500, whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((t, i) => {
                    const overdue = !t.completed && !!t.due_date && new Date(t.due_date) < new Date();
                    const logged = t.accepted_at && t.submitted_at
                      ? fmtDuration(new Date(t.submitted_at).getTime() - new Date(t.accepted_at).getTime())
                      : "—";
                    return (
                      <tr key={t.id} style={{ borderBottom: i < assigned.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                        <td className="font-serif" style={{ padding: "14px 12px", fontSize: 16, color: "var(--color-ink)" }}>{t.title}</td>
                        <td style={{ padding: "14px 12px" }}>{memberName[t.user_id] ?? "—"}</td>
                        <td style={{ textAlign: "center", padding: "14px 8px" }}>
                          <Chip size="sm" tone={TAG_TONE[t.tag]} label={TAG_LABEL[t.tag]} />
                        </td>
                        <td className="mono" style={{ textAlign: "center", padding: "14px 12px", color: overdue ? "var(--color-rust)" : "var(--color-tan)" }}>
                          {t.due_date ? fmtDate(t.due_date) : "—"}
                        </td>
                        <td style={{ textAlign: "center", padding: "14px 12px", color: "var(--color-tan)" }}>{STATUS_LABEL[t.status]}</td>
                        <td className="mono" style={{ textAlign: "center", padding: "14px 12px", color: "var(--color-tan)" }}>{logged}</td>
                        <td style={{ textAlign: "center", padding: "14px 8px" }}>
                          {t.review_status
                            ? <Chip size="sm" tone={VERDICT[t.review_status].tone} label={VERDICT[t.review_status].label} />
                            : <span style={{ color: "var(--color-tan)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* To review */}
      {canAssign && tab === "review" && (
        <Card>
          <CardTitle title="Awaiting your review" subtitle={`${review.length} submission${review.length === 1 ? "" : "s"}`} />
          {review.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0", color: "var(--color-tan)", fontSize: 14 }}>
              Nothing is waiting for review.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {review.map((t) => {
                const busy = busyId === t.id;
                const logged = t.accepted_at && t.submitted_at
                  ? fmtDuration(new Date(t.submitted_at).getTime() - new Date(t.accepted_at).getTime())
                  : null;
                return (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                    padding: "16px 24px",
                    borderTop: "1px solid var(--color-line)",
                  }}>
                    <span style={{ flexShrink: 0 }}>
                      <Chip size="sm" tone={TAG_TONE[t.tag]} label={TAG_LABEL[t.tag]} />
                    </span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div className="font-serif" style={{ fontSize: 20, color: "var(--color-ink)", lineHeight: 1.2 }}>{t.title}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5, fontSize: 11, color: "var(--color-tan)" }}>
                        <span>{memberName[t.user_id] ?? "Team member"}</span>
                        {logged && <span className="mono">Logged {logged}</span>}
                        {t.submitted_at && <span>Submitted {fmtDate(t.submitted_at)}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <Button size="sm" disabled={busy} onClick={() => patch(t.id, { action: "review", review_status: "clean" })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch(t.id, { action: "review", review_status: "revision" })}>
                        Revision
                      </Button>
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => patch(t.id, { action: "review", review_status: "error" })}>
                        Error
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Assign modal */}
      {assignOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(27,26,23,.45)", backdropFilter: "blur(4px)",
          zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div className="modal-mobile-full" style={{
            background: "var(--color-paper-light)", borderRadius: 22, padding: 28, width: "100%", maxWidth: 520,
            boxShadow: "0 8px 40px -10px rgba(27,26,23,.35)", border: "1px solid var(--color-line)",
          }}>
            <h2 className="font-serif" style={{ fontSize: 22, fontWeight: 400, margin: "0 0 4px", color: "var(--color-ink)" }}>
              Assign a task
            </h2>
            <p style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 20 }}>
              The member accepts it, logs time against it, and submits it back for your review.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Task</label>
              <input
                autoFocus
                value={assignTitle}
                onChange={(e) => setAssignTitle(e.target.value)}
                placeholder="What needs doing?"
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Assign to</label>
                <select
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
                >
                  <option value="">Select a member…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Type</label>
                <select
                  value={assignTag}
                  onChange={(e) => setAssignTag(e.target.value as TaskTag)}
                  style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
                >
                  {TAG_OPTIONS.map((t) => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Due date (optional)</label>
              <input
                type="date"
                value={assignDue}
                onChange={(e) => setAssignDue(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>

            {assignError && (
              <p style={{
                fontSize: 12, color: "var(--color-rose)", margin: "14px 0 0",
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(196,106,106,0.08)", border: "1px solid rgba(196,106,106,0.2)",
              }}>
                {assignError}
              </p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
              <Button onClick={submitAssign} disabled={assignSaving || !assignTitle.trim() || !assignTo}>
                {assignSaving ? "Assigning…" : "Assign"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* "Is the task complete?" confirmation */}
      {confirmTask && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(27,26,23,.45)", backdropFilter: "blur(4px)",
            zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={() => setConfirmId(null)}
        >
          <div
            className="modal-mobile-full"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-paper-light)", borderRadius: 22, padding: 28, width: "100%", maxWidth: 420,
              boxShadow: "0 8px 40px -10px rgba(27,26,23,.35)", border: "1px solid var(--color-line)",
            }}
          >
            <h3 className="font-serif" style={{ fontSize: 22, fontWeight: 400, margin: 0, color: "var(--color-ink)" }}>
              Is the task complete?
            </h3>
            <div style={{ fontSize: 13, color: "var(--color-tan)", marginTop: 8 }}>{confirmTask.title}</div>
            {confirmTask.accepted_at && (
              <div className="mono" style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 4 }}>
                Time logged: {fmtDuration(now - new Date(confirmTask.accepted_at).getTime())}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 12 }}>
              Marking it complete sends it to your owner for review.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <Button variant="secondary" onClick={() => setConfirmId(null)}>Not yet</Button>
              <Button
                disabled={busyId === confirmTask.id}
                onClick={async () => { const id = confirmTask.id; setConfirmId(null); await patch(id, { action: "submit" }); }}
              >
                Yes, it&apos;s done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
