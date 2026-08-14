"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectMultiSelect, type SelectableProject } from "@/components/projects/ProjectMultiSelect";

/**
 * Self-service project picker for a supervising site engineer.
 *
 * He holds team:assign_to_project, and neither the RLS policy (013) nor the
 * POST route restricts *who* may be assigned — so adding himself needs no new
 * permission and no new endpoint. Each pick is one POST to the existing
 * /api/projects/[id]/assignments; the route re-checks the capability per call.
 */
export function MyProjectsCard({
  projects,
  alreadyIn,
  selfId,
}: {
  projects: SelectableProject[];
  alreadyIn: string[];
  selfId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);

  async function submit() {
    if (selected.length === 0) return;
    setSaving(true);
    setResult(null);

    // Sequential, not Promise.all: 50-odd parallel writes against one Postgres
    // pool is a good way to exhaust it, and a partial failure needs to name the
    // project that failed rather than collapse into one rejected promise.
    let added = 0;
    const failed: string[] = [];
    for (const id of selected) {
      try {
        const res = await fetch(`/api/projects/${id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: selfId, role_on_project: "pm" }),
        });
        if (res.ok) {
          added += 1;
        } else {
          failed.push(projects.find((p) => p.id === id)?.name ?? "A project");
        }
      } catch {
        failed.push(projects.find((p) => p.id === id)?.name ?? "A project");
      }
    }

    setResult({ added, failed });
    setSelected([]);
    setSaving(false);
    if (added > 0) router.refresh();
  }

  const available = projects.filter((p) => !alreadyIn.includes(p.id));

  return (
    <div style={{
      background: "var(--color-paper-light)", borderRadius: 18,
      border: "1px solid rgba(30,28,24,.05)", boxShadow: "var(--shadow-card)", padding: 20,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>My projects</div>
      <div style={{ fontSize: 13, color: "var(--color-tan)", marginBottom: 14 }}>
        Pick the active projects you want in your own dropdown. You are added as
        project manager, and they appear in the project selector at the top of
        every screen.
      </div>

      {available.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-tan)" }}>
          You are already on every active project.
        </div>
      ) : (
        <>
          <ProjectMultiSelect
            projects={projects}
            selected={selected}
            onChange={setSelected}
            alreadyIn={alreadyIn}
            alreadyLabel="On it"
          />

          {result && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              {result.added > 0 && (
                <div style={{ color: "var(--color-forest)" }}>
                  Added to {result.added} project{result.added === 1 ? "" : "s"}.
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
              ? `Adding… (${selected.length} left)`
              : selected.length === 0
                ? "Select projects to add"
                : `Add me to ${selected.length} project${selected.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
    </div>
  );
}
