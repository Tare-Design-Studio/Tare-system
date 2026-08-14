"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectMultiSelect, type SelectableProject } from "@/components/projects/ProjectMultiSelect";

/**
 * Put another site engineer on several projects at once.
 *
 * Deliberately separate from /team's AssignToProjectPanel, which stays
 * single-select: multiselect is scoped to this supervisor view only. Posts to
 * the same existing /api/projects/[id]/assignments (gated on
 * team:assign_to_project, re-checked per call) — no new API surface.
 */
export function AssignEngineerCard({
  projects,
  engineers,
}: {
  projects: SelectableProject[];
  engineers: { id: string; name: string; projectIds: string[] }[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);

  const chosen = engineers.find((e) => e.id === userId);

  async function submit() {
    if (!userId || selected.length === 0) return;
    setSaving(true);
    setResult(null);

    let added = 0;
    const failed: string[] = [];
    for (const pid of selected) {
      try {
        const res = await fetch(`/api/projects/${pid}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, role_on_project: "site_engineer" }),
        });
        if (res.ok) added += 1;
        else failed.push(projects.find((p) => p.id === pid)?.name ?? "A project");
      } catch {
        failed.push(projects.find((p) => p.id === pid)?.name ?? "A project");
      }
    }

    setResult({ added, failed });
    setSelected([]);
    setSaving(false);
    if (added > 0) router.refresh();
  }

  return (
    <div style={{
      background: "var(--color-paper-light)", borderRadius: 18,
      border: "1px solid rgba(30,28,24,.05)", boxShadow: "var(--shadow-card)", padding: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Put an engineer on projects</div>
      <div style={{ fontSize: 13, color: "var(--color-tan)", marginBottom: 14 }}>
        Choose an engineer, then pick every project they should be on.
      </div>

      <select
        value={userId}
        onChange={(e) => { setUserId(e.target.value); setSelected([]); setResult(null); }}
        aria-label="Engineer"
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 10, marginBottom: 10,
          border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
          color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", minHeight: 44,
        }}
      >
        <option value="">Choose an engineer…</option>
        {engineers.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      {chosen && (
        <>
          <ProjectMultiSelect
            projects={projects}
            selected={selected}
            onChange={setSelected}
            alreadyIn={chosen.projectIds}
            alreadyLabel="On it"
          />

          {result && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              {result.added > 0 && (
                <div style={{ color: "var(--color-forest)" }}>
                  {chosen.name} added to {result.added} project{result.added === 1 ? "" : "s"}.
                </div>
              )}
              {result.failed.length > 0 && (
                <div style={{ color: "var(--color-amber)" }}>
                  Could not add: {result.failed.join(", ")}.
                </div>
              )}
            </div>
          )}

          <button type="button" onClick={submit} disabled={saving || selected.length === 0}
            style={{
              marginTop: 12, padding: "11px 18px", borderRadius: 10, width: "100%",
              fontSize: 13, fontWeight: 600, border: "none", fontFamily: "inherit",
              minHeight: 44,
              background: selected.length === 0 ? "var(--color-line)" : "var(--color-forest)",
              color: selected.length === 0 ? "var(--color-tan)" : "#F3EFE7",
              cursor: selected.length === 0 || saving ? "default" : "pointer",
            }}>
            {saving
              ? "Adding…"
              : selected.length === 0
                ? "Select projects"
                : `Add to ${selected.length} project${selected.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </div>
  );
}
