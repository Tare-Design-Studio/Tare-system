"use client";

import { useState } from "react";

type PersonalReminder = {
  id: string;
  title: string;
  reminder_at: string;
  type: string;
  is_done: boolean;
};

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const TYPE_LABEL: Record<string, string> = {
  meeting: "Meeting",
  deadline: "Deadline",
  other: "Reminder",
};

function fmtDt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function RemindersCard({ initialReminders }: { initialReminders: PersonalReminder[] }) {
  const [reminders, setReminders] = useState<PersonalReminder[]>(initialReminders);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", reminder_at: "", type: "other" });
  const [saving, setSaving] = useState(false);

  const upcoming = reminders.filter((r) => !r.is_done).sort(
    (a, b) => new Date(a.reminder_at).getTime() - new Date(b.reminder_at).getTime()
  );

  async function addReminder() {
    if (!form.title.trim() || !form.reminder_at) return;
    setSaving(true);
    const res = await fetch("/api/personal-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const r = await res.json();
      setReminders((prev) => [...prev, r]);
      setForm({ title: "", reminder_at: "", type: "other" });
      setShowForm(false);
    }
    setSaving(false);
  }

  async function dismiss(id: string) {
    const res = await fetch(`/api/personal-reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_done: true }),
    });
    if (res.ok) {
      setReminders((prev) => prev.map((r) => r.id === id ? { ...r, is_done: true } : r));
    }
  }

  async function deleteReminder(id: string) {
    const res = await fetch(`/api/personal-reminders/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setReminders((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div style={{ ...C, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>Reminders</div>
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 4 }}>{upcoming.length} upcoming · private to you</div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 12, background: showForm ? "var(--color-forest)" : "rgba(30,28,24,.04)", color: showForm ? "#FFF" : "var(--color-ink)", border: "none", cursor: "pointer" }}
          title="Add reminder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {showForm && (
        <div style={{ marginBottom: 16, padding: "14px", borderRadius: 14, background: "var(--color-bg)", display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Reminder title…"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontSize: 13, outline: "none" }}
          />
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontSize: 13, outline: "none" }}
          >
            <option value="meeting">Meeting</option>
            <option value="deadline">Deadline</option>
            <option value="other">Other</option>
          </select>
          <input
            type="datetime-local"
            value={form.reminder_at}
            onChange={(e) => setForm((f) => ({ ...f, reminder_at: e.target.value }))}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontSize: 13, outline: "none" }}
          />
          <button
            onClick={addReminder}
            disabled={saving || !form.title.trim() || !form.reminder_at}
            style={{ padding: "9px", borderRadius: 8, background: "var(--color-forest)", color: "#FFF", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1 }}
          >
            Set Reminder
          </button>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>No upcoming reminders. Add one above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {upcoming.slice(0, 4).map((r) => (
            <div key={r.id} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "var(--color-tan)" }}>
                  {TYPE_LABEL[r.type] ?? "Reminder"} · {fmtDt(r.reminder_at)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => dismiss(r.id)}
                  style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-forest)", display: "flex" }}
                  title="Dismiss"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
                <button
                  onClick={() => deleteReminder(r.id)}
                  style={{ padding: 4, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", display: "flex" }}
                  title="Delete"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
