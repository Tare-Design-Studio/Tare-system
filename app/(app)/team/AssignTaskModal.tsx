"use client";

import { useState } from "react";
import { Avatar, Button, Icon } from "@/components/atoms";
import styles from "./team-access.module.css";

export interface AssignableMember {
  id: string;
  name: string;
  initials: string;
}

export interface AssignableTaskProject {
  id: string;
  name: string;
}

const TAGS = [
  { value: "drawing", label: "Drawing" },
  { value: "review", label: "Review" },
  { value: "site", label: "Site" },
  { value: "admin", label: "Admin" },
  { value: "other", label: "Other" },
] as const;

/**
 * Owner/PM modal to assign a task to a member with a tag, project and optional
 * due date. Posts to /api/member-tasks, which derives assigned_by from the
 * session and gates on tasks:assign — the client never supplies the assigner.
 */
export function AssignTaskModal({
  members,
  projects,
  onClose,
  defaultTag = "drawing",
}: {
  members: AssignableMember[];
  projects: AssignableTaskProject[];
  onClose: () => void;
  /** Site supervisors assign site work; the office default is drawing. */
  defaultTag?: (typeof TAGS)[number]["value"];
}) {
  const [assignee, setAssignee] = useState(members[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<string>(defaultTag);
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim() || !assignee) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/member-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          assignee_id: assignee,
          tag,
          // Naming a project routes the finished task through review (095);
          // leaving it blank keeps it a one-tap todo.
          project_id: projectId || null,
          due_date: dueDate || undefined,
        }),
      });
      if (res.ok) {
        onClose();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not assign task");
      }
    } catch {
      setError("Could not assign task");
    } finally {
      setSaving(false);
    }
  }

  const selected = members.find((m) => m.id === assignee);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Assign a task"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 className={styles.modalTitle}>Assign a task</h3>
            <div className={styles.fieldHint}>Pick who does it, then say what needs doing.</div>
          </div>
          <button className={styles.cornerButton} onClick={onClose} type="button" aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="assign-to">Assign to</label>
          <select
            id="assign-to"
            className={styles.input}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="assign-title">What needs doing *</label>
          <input
            id="assign-title"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Check slab shuttering before pour"
            autoFocus
          />
          {!title.trim() && <div className={styles.fieldHint}>Required — the Assign button unlocks once this is filled.</div>}
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="assign-project">Project (optional)</label>
          <select
            id="assign-project"
            className={styles.input}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">No project — personal task</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className={styles.fieldHint}>
            {projectId
              ? "When they mark it done, it goes for review before it closes."
              : "No review step — it closes as soon as they mark it done."}
          </div>
        </div>

        <div className={styles.fieldRow}>
          <div>
            <label className={styles.fieldLabel} htmlFor="assign-tag">Type</label>
            <select
              id="assign-tag"
              className={styles.input}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              {TAGS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="assign-due">Due date (optional)</label>
            <input
              id="assign-due"
              className={styles.input}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {selected && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 12, color: "var(--color-tan)" }}>
            <Avatar initials={selected.initials} tone="indigo" size={26} />
            {selected.name} gets a notification and sees it in their task list.
          </div>
        )}

        {error && <div className={styles.errorNote}>{error}</div>}

        <div className={styles.modalActions}>
          <Button
            variant="primary"
            onClick={save}
            disabled={saving || !title.trim() || !assignee}
          >
            {saving ? "Assigning…" : selected ? `Assign to ${selected.name.split(" ")[0]}` : "Assign task"}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
