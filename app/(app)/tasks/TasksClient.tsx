"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Card, CardTitle, Chip, ConfirmPopover } from "@/components/atoms";
import { PageHeader } from "../PageHeader";
import { taskConfirmCopy, goesToReview, dueState, dueSuffix } from "@/lib/tasks/confirm-copy";
import { ReviewerPicker, useReviewers } from "@/components/tasks/ReviewerPicker";

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
  project_id: string | null;
  assigned_by: string | null;
  accepted_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Who the member addressed this submission to (096). Null = unnamed. */
  review_requested_to: string | null;
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
  /** Owners see every task in the tenant, not only what they handed out. */
  isOwner: boolean;
  currentUserId: string;
  // Every active project in the tenant. Both the self-add and the assign picker
  // list all of them — a task may be logged against any project, not only the
  // ones the author happens to be assigned to.
  projects: TaskProject[];
};

type TaskProject = { id: string; name: string };

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
  isOwner,
  currentUserId,
  projects,
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
  // Which tick is awaiting confirmation, and in which direction — the wording
  // differs for completing, submitting for review, and reopening.
  const [confirming, setConfirming] = useState<{ id: string; completed: boolean } | null>(null);
  // Who this submission is addressed to (096). Null = the owner, as before.
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [newProjectId, setNewProjectId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const reviewers = useReviewers(true);

  // Assign modal (owner / PM)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [assignTag, setAssignTag] = useState<TaskTag>("other");
  const [assignDue, setAssignDue] = useState("");
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Inline edit of a row in "Assigned by me". Held as a draft rather than
  // patching per keystroke — the title is free text, so a PATCH per character
  // would be dozens of writes for one correction.
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [rowDraft, setRowDraft] = useState<{ title: string; assignee: string; due: string }>({
    title: "", assignee: "", due: "",
  });

  const memberName = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.full_name])),
    [members]
  );

  const projectName = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects]
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

  // Current month forward only — past months drop off the list as they end.
  const months = useMemo(() => {
    const currentKey = getMonthKey(new Date().toISOString());
    const keys = new Set(tasks.map((t) => getMonthKey(t.created_at)));
    keys.add(currentKey);
    return Array.from(keys)
      .filter((k) => k >= currentKey)
      .sort((a, b) => a.localeCompare(b));
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
        body: JSON.stringify({
          title,
          tag: newTag,
          due_date: newDue || undefined,
          project_id: newProjectId || null,
        }),
      });
      if (res.ok) {
        const task: MemberTask = await res.json();
        setTasks((prev) => [task, ...prev]);
        setNewTitle("");
        setNewDue("");
        setNewTag("other");
        setNewProjectId("");
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
          project_id: assignProjectId || null,
        }),
      });
      if (res.ok) {
        await reload("assigned");
        setAssignOpen(false);
        setAssignTitle("");
        setAssignTo("");
        setAssignTag("other");
        setAssignDue("");
        setAssignProjectId("");
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

  function startRowEdit(t: MemberTask) {
    setEditRowId(t.id);
    setRowDraft({ title: t.title, assignee: t.user_id, due: t.due_date ?? "" });
  }

  /** Save an inline edit from "Assigned by me". Sends only what actually moved. */
  async function saveRowEdit(t: MemberTask) {
    const title = rowDraft.title.trim();
    if (!title) return;

    const body: Record<string, unknown> = {};
    if (title !== t.title) body.title = title;
    if (rowDraft.assignee !== t.user_id) body.assignee_id = rowDraft.assignee;
    if ((rowDraft.due || null) !== t.due_date) body.due_date = rowDraft.due || null;

    setEditRowId(null);
    if (Object.keys(body).length === 0) return;

    await patch(t.id, body);
    // Reassigning resets the lifecycle server-side (migration 100), and for a
    // non-owner it also moves the row out of "assigned by me" scope entirely.
    // Refetching is cheaper than replicating that reset in the client.
    if (body.assignee_id) await reload("assigned");
  }

  async function deleteAssignedTask(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/member-tasks/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setAssigned((prev) => prev.filter((t) => t.id !== id));
        setReview((prev) => prev.filter((t) => t.id !== id));
      } else {
        const e = await res.json().catch(() => null);
        setActionError(e?.error ?? `Could not delete the task (${res.status}).`);
      }
    } catch {
      setActionError("Network error — the task was not deleted.");
    }
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

  const confirmTask = confirming ? tasks.find((t) => t.id === confirming.id) ?? null : null;

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
            {isOwner ? "All tasks" : "Assigned by me"}{assigned.length ? ` · ${assigned.length}` : ""}
          </button>
          <button style={pill(tab === "review")} onClick={() => setTab("review")}>
            To review{review.length ? ` · ${review.length}` : ""}
          </button>
        </div>
      )}

      {tab === "mine" && (
        <>
          {/* Add task — tag + due date make your own work count in performance.
              Inner div carries display:flex; the .desktop-only wrapper keeps
              its own display so the class can hide it on mobile. */}
          <div className="desktop-only" style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                title="Project this task belongs to — linked tasks go to the owner for review"
                style={{ ...inputStyle, flex: "0 0 auto", minWidth: 170, padding: "14px 12px", cursor: "pointer" }}
              >
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
          </div>

          {/* Add task — phone: stacked, title full-width, tag/project paired,
              date + Add paired so the row never runs off-screen. */}
          <div className="mobile-only" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="Add a new task…"
                style={{ ...inputStyle, width: "100%", padding: "14px 16px", fontSize: 15, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <select
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value as TaskTag)}
                  title="Task type — drives how it scores"
                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "12px 10px", cursor: "pointer" }}
                >
                  {TAG_OPTIONS.map((t) => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
                </select>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  title="Project this task belongs to — linked tasks go to the owner for review"
                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "12px 10px", cursor: "pointer" }}
                >
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="date"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  title="Due date (optional)"
                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "12px 10px" }}
                />
                <Button onClick={addTask} disabled={adding || !newTitle.trim()} style={{ flex: "0 0 auto", padding: "12px 22px" }}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            <button style={pill(filter === "all")} onClick={() => setFilter("all")}>All</button>
            <button style={pill(filter === "pending")} onClick={() => setFilter("pending")}>Pending</button>
            <button style={pill(filter === "completed")} onClick={() => setFilter("completed")}>Completed</button>

            <div className="desktop-only" style={{ width: 1, height: 20, background: "var(--color-line)", margin: "0 6px" }} />

            {/* Desktop: month pills. Phone: single dropdown, current month forward only. */}
            <button className="desktop-only" style={pill(selectedMonth === "all")} onClick={() => setSelectedMonth("all")}>All time</button>
            {months.map((m) => (
              <button key={m} className="desktop-only" style={pill(selectedMonth === m)} onClick={() => setSelectedMonth(m)}>
                {monthLabel(m)}
              </button>
            ))}
            <select
              className="mobile-only"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ ...inputStyle, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
            >
              <option value="all">All time</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
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
                // A task due TODAY is not late — the day has not ended yet.
                const due = t.completed ? "none" : dueState(t.due_date, now);
                const overdue = due === "overdue";
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
                        onClick={() => setConfirming({ id: t.id, completed: !t.completed })}
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
                            <select
                              value={t.project_id ?? ""}
                              disabled={busy}
                              onChange={(e) => patch(t.id, { project_id: e.target.value || null })}
                              title="Project this task belongs to — linked tasks go for review and appear in that project's updates"
                              style={{ ...miniInputStyle, cursor: "pointer", maxWidth: 150 }}
                            >
                              <option value="">No project</option>
                              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                            {due === "today" && <span style={{ fontSize: 11, color: "var(--color-amber)" }}>due today</span>}
                          </>
                        ) : (
                          t.due_date && (
                            <span style={{
                              fontSize: 11,
                              color: overdue
                                ? "var(--color-rust)"
                                : due === "today" ? "var(--color-amber)" : "var(--color-tan)",
                            }}>
                              Due {fmtDate(t.due_date)}{dueSuffix(due)}
                            </span>
                          )
                        )}
                        {timing && (
                          <span className="mono" style={{ fontSize: 11, color: "var(--color-forest)" }}>
                            {fmtDuration(elapsedMs)}
                          </span>
                        )}
                        {/* Still awaiting a verdict, so the member may still change
                            their mind about who they sent it to — the person they
                            picked may be on leave, or it may have gone to the wrong
                            one. Locked once reviewed: re-pointing a closed task
                            would reattribute a verdict somebody already gave.
                            guard_member_task_review() (096) permits this for the
                            row's own member and nobody else. */}
                        {t.status === "pending_review" && (
                          <>
                            <span style={{ fontSize: 11, color: "var(--color-tan)" }}>Awaiting review from</span>
                            <select
                              value={t.review_requested_to ?? ""}
                              disabled={busy}
                              onChange={(e) => patch(t.id, { review_requested_to: e.target.value || null })}
                              title="Who you want to review this task"
                              style={{ ...miniInputStyle, cursor: "pointer", maxWidth: 150 }}
                            >
                              <option value="">Owner (default)</option>
                              {reviewers.map((r) => (
                                <option key={r.id} value={r.id}>{r.full_name}</option>
                              ))}
                            </select>
                          </>
                        )}
                        {t.status === "completed" && t.review_status && (
                          <Chip size="sm" tone={VERDICT[t.review_status].tone} label={VERDICT[t.review_status].label} />
                        )}
                        {!isAssignedToMe && t.completed && (
                          <span style={{ fontSize: 11, color: "var(--color-tan)" }}>{TAG_LABEL[t.tag]}</span>
                        )}
                        {/* Which project this counted toward — read-only once the
                            task is no longer an open self-set one. */}
                        {t.project_id && (isAssignedToMe || t.completed) && projectName[t.project_id] && (
                          <span style={{ fontSize: 11, color: "var(--color-forest)" }}>
                            {projectName[t.project_id]}
                          </span>
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
                      <Button size="sm" disabled={busy} onClick={() => setConfirming({ id: t.id, completed: true })} title="Mark complete" style={{ flexShrink: 0 }}>
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
          <CardTitle
            title={isOwner ? "All team tasks" : "Assigned by me"}
            subtitle={
              isOwner
                ? `${assigned.length} task${assigned.length === 1 ? "" : "s"} across the team`
                : `${assigned.length} task${assigned.length === 1 ? "" : "s"} handed to the team`
            }
          />
          {assigned.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0", color: "var(--color-tan)", fontSize: 14 }}>
              {isOwner ? "Nobody has any tasks yet." : "You have not assigned any tasks yet."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-line)" }}>
                    {["Task", "Assignee", "Project", "Type", "Due", "Status", "Logged", "Reviewer", "Verdict", "Actions"].map((h) => (
                      <th key={h} style={{
                        textAlign: h === "Task" || h === "Assignee" ? "left" : "center",
                        padding: "8px 12px 12px",
                        fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase",
                        letterSpacing: 0.6, fontWeight: 500, whiteSpace: "nowrap",
                      }}>
                        {/* The actions column is self-evident from its buttons; the
                            label is there for screen readers, not for the eye. */}
                        {h === "Actions" ? <span className="sr-only">{h}</span> : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((t, i) => {
                    const due = t.completed ? "none" : dueState(t.due_date, now);
                    const overdue = due === "overdue";
                    const logged = t.accepted_at && t.submitted_at
                      ? fmtDuration(new Date(t.submitted_at).getTime() - new Date(t.accepted_at).getTime())
                      : "—";
                    const editing = editRowId === t.id;
                    const busy = busyId === t.id;
                    // Only the assigner may correct a task (migration 100). An owner
                    // watching the whole firm still cannot rewrite work somebody else
                    // handed out — they would get a 404 from the self-scoped path.
                    const canEditRow = t.assigned_by === currentUserId;
                    return (
                      <tr key={t.id} style={{ borderBottom: i < assigned.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                        <td className="font-serif" style={{ padding: "14px 12px", fontSize: 16, color: "var(--color-ink)" }}>
                          {editing ? (
                            <input
                              autoFocus
                              value={rowDraft.title}
                              onChange={(e) => setRowDraft((d) => ({ ...d, title: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRowEdit(t);
                                if (e.key === "Escape") setEditRowId(null);
                              }}
                              style={{ ...miniInputStyle, height: 30, fontSize: 14, width: "100%", minWidth: 160 }}
                            />
                          ) : (
                            t.title
                          )}
                        </td>
                        <td style={{ padding: "14px 12px" }}>
                          {editing ? (
                            <select
                              value={rowDraft.assignee}
                              onChange={(e) => setRowDraft((d) => ({ ...d, assignee: e.target.value }))}
                              title="Move this task to a different member — their clock starts over"
                              style={{ ...miniInputStyle, cursor: "pointer", maxWidth: 150 }}
                            >
                              {/* The current assignee may not be in `members` (that list
                                  drops the viewer), so it is added explicitly or the
                                  select would silently show the wrong person. */}
                              {!members.some((m) => m.id === t.user_id) && (
                                <option value={t.user_id}>{memberName[t.user_id] ?? "Current assignee"}</option>
                              )}
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                              ))}
                            </select>
                          ) : (
                            memberName[t.user_id] ?? "—"
                          )}
                        </td>
                        {/* The assigner picked the project, so they can change it
                            here. Locked once the work is closed — re-pointing a
                            finished task would move history between projects. */}
                        <td style={{ textAlign: "center", padding: "14px 8px" }}>
                          {t.completed ? (
                            <span style={{ color: t.project_id ? "var(--color-forest)" : "var(--color-tan)" }}>
                              {t.project_id ? projectName[t.project_id] ?? "—" : "—"}
                            </span>
                          ) : (
                            <select
                              value={t.project_id ?? ""}
                              disabled={busyId === t.id}
                              onChange={(e) => patch(t.id, { project_id: e.target.value || null })}
                              title="Project this task belongs to — it appears in that project's updates"
                              style={{ ...miniInputStyle, cursor: "pointer", maxWidth: 150 }}
                            >
                              <option value="">No project</option>
                              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td style={{ textAlign: "center", padding: "14px 8px" }}>
                          <Chip size="sm" tone={TAG_TONE[t.tag]} label={TAG_LABEL[t.tag]} />
                        </td>
                        <td className="mono" style={{
                          textAlign: "center", padding: "14px 12px",
                          color: overdue
                            ? "var(--color-rust)"
                            : due === "today" ? "var(--color-amber)" : "var(--color-tan)",
                        }}>
                          {editing ? (
                            <input
                              type="date"
                              value={rowDraft.due}
                              onChange={(e) => setRowDraft((d) => ({ ...d, due: e.target.value }))}
                              style={miniInputStyle}
                            />
                          ) : (
                            <>
                              {t.due_date ? fmtDate(t.due_date) : "—"}
                              {due === "today" ? " · today" : ""}
                            </>
                          )}
                        </td>
                        <td style={{ textAlign: "center", padding: "14px 12px", color: "var(--color-tan)" }}>{STATUS_LABEL[t.status]}</td>
                        <td className="mono" style={{ textAlign: "center", padding: "14px 12px", color: "var(--color-tan)" }}>{logged}</td>
                        {/* Who the submission was addressed to (096). An unnamed task
                            falls back to the assigner, then the owners — say so rather
                            than printing a bare dash the owner has to decode. */}
                        <td style={{ textAlign: "center", padding: "14px 8px", color: "var(--color-tan)" }}>
                          {t.review_requested_to
                            ? (memberName[t.review_requested_to] ??
                               (t.review_requested_to === currentUserId ? "You" : "—"))
                            : t.assigned_by
                              ? `${memberName[t.assigned_by] ?? "Assigner"} (default)`
                              : "Owner (default)"}
                        </td>
                        <td style={{ textAlign: "center", padding: "14px 8px" }}>
                          {t.review_status
                            ? <Chip size="sm" tone={VERDICT[t.review_status].tone} label={VERDICT[t.review_status].label} />
                            : <span style={{ color: "var(--color-tan)" }}>—</span>}
                        </td>
                        <td style={{ padding: "14px 8px", whiteSpace: "nowrap" }}>
                          {!canEditRow ? (
                            <span style={{ color: "var(--color-tan)" }}>—</span>
                          ) : editing ? (
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <Button size="sm" disabled={busy || !rowDraft.title.trim()} onClick={() => saveRowEdit(t)}>
                                {busy ? "…" : "Save"}
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => setEditRowId(null)}>Cancel</Button>
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", gap: 4 }}>
                              <button
                                onClick={() => startRowEdit(t)}
                                disabled={busy}
                                title="Edit task"
                                style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "inline-flex", borderRadius: 8 }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <ConfirmPopover
                                title="Withdraw this task?"
                                message={`This permanently removes "${t.title}" from ${memberName[t.user_id] ?? "the assignee"}'s list, along with any time they logged against it.`}
                                onConfirm={() => deleteAssignedTask(t.id)}
                              >
                                {(open) => (
                                  <button
                                    onClick={open}
                                    title="Delete task"
                                    style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "inline-flex", borderRadius: 8 }}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                      <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                                    </svg>
                                  </button>
                                )}
                              </ConfirmPopover>
                            </span>
                          )}
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
          <CardTitle
            title={isOwner ? "Awaiting review" : "Awaiting your review"}
            subtitle={
              isOwner
                ? `${review.length} submission${review.length === 1 ? "" : "s"} across the team — you can sign off any of them`
                : `${review.length} submission${review.length === 1 ? "" : "s"}`
            }
          />
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
                        {/* An owner sees the whole queue, so they need to know when a
                            submission was addressed to someone else before they sign
                            it off ahead of the person who was asked. */}
                        {t.review_requested_to && t.review_requested_to !== currentUserId && (
                          <span style={{ color: "var(--color-amber)" }}>
                            For {memberName[t.review_requested_to] ?? "another reviewer"}
                          </span>
                        )}
                        {!t.review_requested_to && t.assigned_by && t.assigned_by !== currentUserId && (
                          <span>For {memberName[t.assigned_by] ?? "the assigner"} (default)</span>
                        )}
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

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Project (optional)</label>
              <select
                value={assignProjectId}
                onChange={(e) => setAssignProjectId(e.target.value)}
                style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              >
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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

      {/* Check-mark confirmation. Wording depends on what the tick actually does:
          submit a project-linked task for review, close a personal one, or
          reopen either. */}
      {confirmTask && confirming && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(27,26,23,.45)", backdropFilter: "blur(4px)",
            zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={() => setConfirming(null)}
        >
          <div
            className="modal-mobile-full"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-paper-light)", borderRadius: 22, padding: 28, width: "100%", maxWidth: 420,
              boxShadow: "0 8px 40px -10px rgba(27,26,23,.35)", border: "1px solid var(--color-line)",
            }}
          >
            {(() => {
              // Two routes to review: an assigned task partway through its
              // lifecycle, or (since 095) any project-linked task being ticked.
              const midLifecycle =
                confirmTask.status === "accepted" || confirmTask.status === "in_progress";
              const submitsForReview =
                confirming.completed && (midLifecycle || goesToReview(confirmTask));
              const copy = taskConfirmCopy({
                completed: confirming.completed,
                goesToReview: submitsForReview,
                reviewerName: reviewers.find((r) => r.id === reviewerId)?.full_name ?? null,
              });
              return (
                <>
                  <h3 className="font-serif" style={{ fontSize: 22, fontWeight: 400, margin: 0, color: "var(--color-ink)" }}>
                    {copy.title}
                  </h3>
                  <div style={{ fontSize: 13, color: "var(--color-tan)", marginTop: 8 }}>{confirmTask.title}</div>
                  {confirmTask.accepted_at && (
                    <div className="mono" style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 4 }}>
                      Time logged: {fmtDuration(now - new Date(confirmTask.accepted_at).getTime())}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 12 }}>
                    {copy.body}
                  </div>
                  {submitsForReview && (
                    <ReviewerPicker
                      reviewers={reviewers}
                      value={reviewerId}
                      onChange={setReviewerId}
                    />
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                    <Button variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
                    <Button
                      disabled={busyId === confirmTask.id}
                      onClick={async () => {
                        const { id, completed } = confirming;
                        setConfirming(null);
                        // Only send the reviewer on a submission — a reopen or a
                        // plain close must not stamp one onto the row.
                        const reviewerField = submitsForReview
                          ? { review_requested_to: reviewerId }
                          : {};
                        // An assigned task mid-lifecycle submits for review; the
                        // plain tick is for self-set tasks (095 turns that into a
                        // review submission too when the task names a project).
                        await patch(
                          id,
                          completed && midLifecycle
                            ? { action: "submit", ...reviewerField }
                            : { completed, ...reviewerField }
                        );
                        setReviewerId(null);
                      }}
                    >
                      {copy.confirmLabel}
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
