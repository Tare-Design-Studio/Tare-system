"use client";

import { useState, useMemo } from "react";
import { PageHeader } from "../PageHeader";

type MemberTask = {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

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

export default function TasksClient({ initialTasks }: { initialTasks: MemberTask[] }) {
  const [tasks, setTasks] = useState<MemberTask[]>(initialTasks);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Compute unique months from tasks
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

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    const res = await fetch("/api/member-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const task = await res.json();
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
    }
    setAdding(false);
  }

  async function toggle(id: string, completed: boolean) {
    const res = await fetch(`/api/member-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }

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
        subtitle={`Personal · ${pending} pending · ${done} done`}
      />

      {/* Add task */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add a new task…"
          style={{ flex: 1, padding: "14px 18px", borderRadius: "var(--radius-input)", border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontSize: 15, color: "var(--color-ink)", outline: "none", boxShadow: "var(--shadow-input)" }}
        />
        <button
          onClick={addTask}
          disabled={adding || !newTitle.trim()}
          style={{ padding: "14px 24px", borderRadius: "var(--radius-btn)", background: "var(--color-ink)", color: "#F3EFE7", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, opacity: adding || !newTitle.trim() ? 0.5 : 1, boxShadow: "0 1px 0 rgba(255,255,255,0.1) inset" }}
        >
          Add
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button style={pill(filter === "all")} onClick={() => setFilter("all")}>All</button>
        <button style={pill(filter === "pending")} onClick={() => setFilter("pending")}>Pending</button>
        <button style={pill(filter === "completed")} onClick={() => setFilter("completed")}>Completed</button>

        <div style={{ width: 1, background: "var(--color-line)", margin: "0 6px" }} />

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
          {filtered.map((t) => (
            <div key={t.id} className="project-card" style={{
              display: "flex", alignItems: "center", gap: 16,
              padding: "18px 20px", borderRadius: "var(--radius-card)",
              background: "var(--color-paper-light)",
              border: "1px solid var(--color-line)",
              boxShadow: "var(--shadow-card)",
              opacity: t.completed ? 0.65 : 1,
            }}>
              {/* Checkbox */}
              <button
                onClick={() => toggle(t.id, !t.completed)}
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

              {/* Title */}
              {editingId === t.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => saveEdit(t.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t.id); if (e.key === "Escape") setEditingId(null); }}
                  className="font-serif"
                  style={{ flex: 1, padding: "4px 8px", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 22, outline: "none", background: "transparent" }}
                />
              ) : (
                <span className="font-serif" style={{ flex: 1, fontSize: 22, letterSpacing: "-0.01em", textDecoration: t.completed ? "line-through" : "none", color: t.completed ? "var(--color-tan)" : "var(--color-ink)", lineHeight: 1.1 }}>
                  {t.title}
                </span>
              )}

              {/* Meta */}
              <span style={{ fontSize: 11, color: "var(--color-tan)", flexShrink: 0 }}>
                {t.completed && t.completed_at ? `Done ${fmtDate(t.completed_at)}` : `Added ${fmtDate(t.created_at)}`}
              </span>

              {/* Edit */}
              {!t.completed && (
                <button
                  onClick={() => { setEditingId(t.id); setEditTitle(t.title); }}
                  style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "flex", borderRadius: 8 }}
                  title="Edit"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}

              {/* Delete */}
              <button
                onClick={() => deleteTask(t.id)}
                style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "flex", borderRadius: 8 }}
                title="Delete"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
