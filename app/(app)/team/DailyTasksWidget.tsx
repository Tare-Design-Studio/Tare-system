"use client";

import { useState } from "react";

type Task = {
  id: string;
  description: string;
  project_id: string | null;
  task_date: string;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
};

interface Props {
  initial: Task[];
  todayStr: string;
}

export function DailyTasksWidget({ initial, todayStr }: Props) {
  const [tasks, setTasks] = useState(initial);
  const [desc, setDesc] = useState("");
  const [adding, setAdding] = useState(false);

  async function addTask() {
    if (!desc.trim()) return;
    setAdding(true);
    const res = await fetch("/api/daily-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc.trim(), task_date: todayStr }),
    });
    if (res.ok) {
      const { data } = await res.json();
      setTasks(prev => [...prev, data]);
      setDesc("");
    }
    setAdding(false);
  }

  async function toggle(id: string, current: boolean) {
    const res = await fetch("/api/daily-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_done: !current }),
    });
    if (res.ok) {
      const { data } = await res.json();
      setTasks(prev => prev.map(t => t.id === id ? { ...t, is_done: data.is_done, done_at: data.done_at } : t));
    }
  }

  const todayTasks = tasks.filter(t => t.task_date === todayStr);
  const doneCount = todayTasks.filter(t => t.is_done).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Progress */}
      {todayTasks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            flex: 1, height: 4, borderRadius: 4, background: "var(--bg-2, #EDE7DB)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 4, background: "var(--color-forest)",
              width: `${(doneCount / todayTasks.length) * 100}%`,
              transition: "width .3s",
            }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--color-tan)", fontFamily: "var(--font-mono)" }}>
            {doneCount}/{todayTasks.length}
          </span>
        </div>
      )}

      {/* Task list */}
      {todayTasks.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--color-tan)", fontStyle: "italic" }}>No tasks for today.</div>
      )}
      {todayTasks.map(t => (
        <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <div
            onClick={() => toggle(t.id, t.is_done)}
            style={{
              width: 18, height: 18, borderRadius: 5, border: "1.5px solid",
              borderColor: t.is_done ? "var(--color-forest)" : "var(--color-line)",
              background: t.is_done ? "var(--color-forest)" : "transparent",
              flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {t.is_done && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F3EFE7" strokeWidth="3" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <span style={{
            fontSize: 13, lineHeight: 1.5,
            textDecoration: t.is_done ? "line-through" : "none",
            color: t.is_done ? "var(--color-tan)" : "var(--color-ink)",
          }}>
            {t.description}
          </span>
        </label>
      ))}

      {/* Add task */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <input
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addTask(); }}
          placeholder="Add a task for today…"
          maxLength={200}
          style={{
            flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--color-line)",
            background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
          }}
        />
        <button
          onClick={addTask}
          disabled={adding || !desc.trim()}
          style={{
            padding: "7px 12px", borderRadius: 8, background: "var(--color-ink)",
            color: "#F3EFE7", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
            opacity: (adding || !desc.trim()) ? 0.5 : 1,
          }}
        >
          +
        </button>
      </div>

      {/* Export link */}
      <a
        href="/api/daily-tasks/export"
        style={{ fontSize: 11, color: "var(--color-tan)", textDecoration: "underline", alignSelf: "flex-start" }}
      >
        Export CSV
      </a>
    </div>
  );
}
