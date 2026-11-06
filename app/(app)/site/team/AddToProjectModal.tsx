"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectMultiSelect, type SelectableProject } from "@/components/projects/ProjectMultiSelect";

type Engineer = { id: string; name: string; projectIds: string[] };

/**
 * Roster "Add to project": pick one or more engineers, then every project they
 * should join. Posts each pair to the existing /api/projects/[id]/assignments
 * (gated on team:assign_to_project, re-checked per call).
 */
export function AddToProjectModal({ projects, engineers, onClose }: {
  projects: SelectableProject[];
  engineers: Engineer[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [people, setPeople] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);

  const chosen = engineers.filter((e) => people.includes(e.id));
  // Projects every chosen engineer is already on — nothing to add there.
  const alreadyIn = chosen.length
    ? projects.map((p) => p.id).filter((pid) => chosen.every((e) => e.projectIds.includes(pid)))
    : [];

  const togglePerson = (id: string) => {
    setResult(null);
    setPeople((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  async function submit() {
    if (chosen.length === 0 || selected.length === 0) return;
    setSaving(true);
    setResult(null);
    let added = 0;
    const failed: string[] = [];
    for (const e of chosen) {
      for (const pid of selected) {
        if (e.projectIds.includes(pid)) continue;
        try {
          const res = await fetch(`/api/projects/${pid}/assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: e.id, role_on_project: "site_engineer" }),
          });
          if (res.ok) added += 1;
          else failed.push(`${e.name} → ${projects.find((p) => p.id === pid)?.name ?? "project"}`);
        } catch {
          failed.push(`${e.name} → ${projects.find((p) => p.id === pid)?.name ?? "project"}`);
        }
      }
    }
    setSaving(false);
    setResult({ added, failed });
    if (added > 0) router.refresh();
    if (failed.length === 0) onClose();
  }

  const ready = chosen.length > 0 && selected.length > 0;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)" }} />
      <div role="dialog" aria-label="Add to project" style={{
        position: "fixed", zIndex: 101, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        width: "min(520px, calc(100vw - 32px))", maxHeight: "calc(100vh - 64px)", overflowY: "auto",
        background: "var(--color-paper-light)", borderRadius: 24, padding: 22,
        boxShadow: "0 32px 80px -20px rgba(27,26,23,.35)", color: "var(--color-ink)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24 }}>Add to project</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            width: 34, height: 34, border: "1px solid var(--color-line)", background: "var(--bg-2)", cursor: "pointer", fontSize: 16,
          }}>×</button>
        </div>

        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--color-tan)", marginBottom: 8 }}>
          1 · Who
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {engineers.map((e) => {
            const on = people.includes(e.id);
            return (
              <button key={e.id} type="button" onClick={() => togglePerson(e.id)} style={{
                padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${on ? "var(--color-forest)" : "var(--color-line)"}`,
                background: on ? "var(--color-forest)" : "var(--bg-2)",
                color: on ? "#FFF" : "var(--color-ink)",
              }}>
                {on ? "✓ " : ""}{e.name}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--color-tan)", marginBottom: 8 }}>
          2 · Which projects
        </div>
        {chosen.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", marginBottom: 12 }}>Pick at least one engineer first.</div>
        ) : (
          <ProjectMultiSelect projects={projects} selected={selected} onChange={setSelected}
            alreadyIn={alreadyIn} alreadyLabel={chosen.length === 1 ? "On it" : "All on it"} />
        )}

        {result && result.failed.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--color-amber)" }}>
            {result.added > 0 && <div style={{ color: "var(--color-forest)" }}>Added {result.added}.</div>}
            Could not add: {result.failed.join(", ")}.
          </div>
        )}

        <button type="button" onClick={submit} disabled={!ready || saving} style={{
          marginTop: 16, width: "100%", padding: "13px 18px", fontSize: 14, fontWeight: 600, border: "none",
          fontFamily: "inherit", minHeight: 46,
          background: ready ? "var(--color-forest)" : "var(--color-line)",
          color: ready ? "#FFF" : "var(--color-tan)",
          cursor: ready && !saving ? "pointer" : "default",
        }}>
          {saving ? "Adding…"
            : !ready ? "Choose people and projects"
            : `Add ${chosen.length === 1 ? chosen[0].name : `${chosen.length} engineers`} to ${selected.length} project${selected.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </>
  );
}
