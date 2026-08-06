"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/atoms";
import styles from "./team-access.module.css";

export type AssignableProject = { id: string; name: string };
export type AssignableMember = { id: string; name: string; initials: string };

const ROLES = [
  { value: "team_member", label: "Team member" },
  { value: "site_engineer", label: "Site engineer" },
  { value: "pm", label: "Project manager" },
  { value: "lead_architect", label: "Lead architect" },
  { value: "design_support", label: "Design support" },
  { value: "drafting", label: "Drafting" },
  { value: "coordination", label: "Coordination" },
] as const;

/**
 * Add a member to a project (096). Posts to the existing
 * POST /api/projects/[id]/assignments, which is gated on team:assign_to_project —
 * this panel is the UI for a capability that already existed, not a new path.
 */
export function AssignToProjectPanel({
  projects,
  members,
}: {
  projects: AssignableProject[];
  members: AssignableMember[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<string>("team_member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!projectId || !userId) return;
    setSaving(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role_on_project: role }),
      });
      if (res.ok) {
        const who = members.find((m) => m.id === userId)?.name ?? "Member";
        const where = projects.find((p) => p.id === projectId)?.name ?? "the project";
        setDone(`${who} added to ${where}.`);
        setUserId("");
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not add them to the project");
      }
    } catch {
      setError("Could not add them to the project");
    } finally {
      setSaving(false);
    }
  }

  if (projects.length === 0 || members.length === 0) return null;

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Add to a project</h2>
          <p>Put someone on a project team</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          style={selectStyle}
          aria-label="Project"
        >
          <option value="">Choose a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={selectStyle}
          aria-label="Member"
        >
          <option value="">Choose a member…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={selectStyle}
          aria-label="Role on the project"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {error && <div className={styles.errorNote}>{error}</div>}
        {done && <div className={styles.emptyNote}>{done}</div>}

        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={submit}
          disabled={saving || !projectId || !userId}
          style={{ justifyContent: "center" }}
        >
          <Icon name="plus" size={14} />
          {saving ? "Adding…" : "Add to project"}
        </button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  color: "#000",
  fontSize: 13,
};
