"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import ConfirmDialog from "@/components/atoms/ConfirmDialog";
import { taskConfirmCopy, goesToReview, dueState } from "@/lib/tasks/confirm-copy";
import { ReviewerPicker, useReviewers } from "@/components/tasks/ReviewerPicker";

type MemberTask = {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  drawing_role?: DrawingRole | null;
  project_id?: string | null;
  status?: string;
  reviewed_by?: string | null;
  assigned_by?: string | null;
  due_date?: string | null;
};

export type TaskProject = { id: string; name: string };
/** id → full name, for showing who assigned a task. */
export type MemberNames = Record<string, string>;

// Which part of a drawing this task covers. Still carried on the row (the API
// returns it and reports read it); no longer picked from this card.
type DrawingRole = "design" | "detailing" | "technical" | "checked";

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

export default function TasksCard({
  initialTasks,
  projects = [],
  memberNames = {},
}: {
  initialTasks: MemberTask[];
  projects?: TaskProject[];
  memberNames?: MemberNames;
}) {
  const [tasks, setTasks] = useState<MemberTask[]>(initialTasks);
  const [newTitle, setNewTitle] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  // Which tick is awaiting confirmation. null = no dialog open.
  const [confirming, setConfirming] = useState<{ id: string; completed: boolean } | null>(null);
  // Who a submission is addressed to (096). Null = the owner, as before.
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const reviewers = useReviewers(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // A submitted task is neither pending nor done — it is with the owner. Without
  // its own bucket it would drop back among the pending tasks with a blank
  // check-box, reading as "nothing happened".
  const awaitingReview = tasks.filter((t) => t.status === "pending_review");
  const pending = tasks.filter((t) => !t.completed && t.status !== "pending_review");
  const done = tasks.filter((t) => t.completed);

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    const res = await fetch("/api/member-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, project_id: newProjectId || null }),
    });
    if (res.ok) {
      const task = await res.json();
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
      setNewProjectId("");
    }
    setAdding(false);
    inputRef.current?.focus();
  }

  // `reviewer` is sent only when the tick submits for review — a reopen or a
  // plain close must not stamp one onto the row.
  async function toggle(id: string, completed: boolean, reviewer?: string | null) {
    const res = await fetch(`/api/member-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        reviewer === undefined ? { completed } : { completed, review_requested_to: reviewer }
      ),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }

  const confirmTask = confirming ? tasks.find((t) => t.id === confirming.id) : undefined;

  async function saveEdit(id: string) {
    const title = editTitle.trim();
    if (!title) return;
    const res = await fetch(`/api/member-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
    setEditingId(null);
  }

  async function deleteTask(id: string) {
    const res = await fetch(`/api/member-tasks/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  }

  return (
    <div style={{ ...C, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>Tasks</div>
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 4 }}>{pending.length} pending · {done.length} done</div>
        </div>
        <Link href="/tasks" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 12, background: "rgba(30,28,24,.04)", color: "var(--color-ink)", textDecoration: "none" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7"/><path d="M8 7h9v9"/>
          </svg>
        </Link>
      </div>

      {/* Add task input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Add a task…"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 13, color: "var(--color-ink)", outline: "none" }}
          />
          <button
            onClick={addTask}
            disabled={adding || !newTitle.trim()}
            style={{ padding: "9px 14px", borderRadius: 10, background: "var(--color-forest)", color: "#FFF", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: adding || !newTitle.trim() ? 0.5 : 1 }}
          >
            Add
          </button>
        </div>
        {projects.length > 0 && (
          <select
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 12, color: newProjectId ? "var(--color-ink)" : "var(--color-tan)", outline: "none", appearance: "none", cursor: "pointer" }}
          >
            <option value="">No project — personal task</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* With the owner — submitted, not yet reviewed */}
      {awaitingReview.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>With the owner</div>
          {awaitingReview.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "var(--color-bg)" }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: "2px dashed var(--color-tan)", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: "var(--color-ink)" }}>{t.title}</span>
              <span style={{ fontSize: 10, color: "var(--color-tan)" }}>In review</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending tasks */}
      {pending.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {pending.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: "var(--color-bg)" }}>
              <button
                onClick={() => setConfirming({ id: t.id, completed: true })}
                style={{ width: 18, height: 18, borderRadius: 5, border: "2px solid var(--color-line)", background: "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              />
              {editingId === t.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => saveEdit(t.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t.id); if (e.key === "Escape") setEditingId(null); }}
                  style={{ flex: 1, padding: "2px 6px", border: "1px solid var(--color-line)", borderRadius: 6, fontSize: 12, outline: "none" }}
                />
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: "var(--color-ink)" }}>{t.title}</span>
                  {(() => {
                    // Who handed this over, and when it is wanted. A task due
                    // TODAY is not late — see dueState.
                    const assigner = t.assigned_by ? memberNames[t.assigned_by] : null;
                    const due = dueState(t.due_date, Date.now());
                    if (!assigner && due === "none") return null;
                    return (
                      <div style={{ fontSize: 10, color: "var(--color-tan)", marginTop: 2 }}>
                        {assigner ? `From ${assigner}` : ""}
                        {assigner && due !== "none" ? " · " : ""}
                        {due !== "none" && (
                          <span style={{
                            color: due === "overdue"
                              ? "var(--color-rust)"
                              : due === "today" ? "var(--color-amber)" : undefined,
                          }}>
                            {due === "overdue" ? "Overdue" : due === "today" ? "Due today" : `Due ${t.due_date}`}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              <button
                onClick={() => { setEditingId(t.id); setEditTitle(t.title); }}
                style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "flex" }}
                title="Edit"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                onClick={() => deleteTask(t.id)}
                style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "flex" }}
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Done tasks (last 3) */}
      {done.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Done</div>
          {done.slice(0, 3).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, background: "transparent", opacity: 0.6 }}>
              <button
                onClick={() => setConfirming({ id: t.id, completed: false })}
                style={{ width: 18, height: 18, borderRadius: 5, border: "2px solid var(--color-forest)", background: "var(--color-forest)", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <span style={{ flex: 1, fontSize: 12, color: "var(--color-tan)", textDecoration: "line-through" }}>{t.title}</span>
              <button
                onClick={() => deleteTask(t.id)}
                style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-line)", display: "flex" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--color-tan)", padding: "8px 0" }}>No tasks yet. Add one above.</div>
      )}

      {confirming && confirmTask && (() => {
        const submitsForReview = confirming.completed && goesToReview(confirmTask);
        return (
          <ConfirmDialog
            {...taskConfirmCopy({
              completed: confirming.completed,
              goesToReview: submitsForReview,
              reviewerName: reviewers.find((r) => r.id === reviewerId)?.full_name ?? null,
            })}
            onConfirm={() => {
              toggle(
                confirming.id,
                confirming.completed,
                submitsForReview ? reviewerId : undefined
              );
              setConfirming(null);
              setReviewerId(null);
            }}
            onCancel={() => setConfirming(null)}
          >
            {submitsForReview && (
              <ReviewerPicker
                reviewers={reviewers}
                value={reviewerId}
                onChange={setReviewerId}
              />
            )}
          </ConfirmDialog>
        );
      })()}
    </div>
  );
}
