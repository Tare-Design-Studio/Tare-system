"use client";

import { useMemo, useState } from "react";

export type SelectableProject = { id: string; name: string; current_stage?: string | null };

/**
 * Checkbox list for picking several projects at once, with a search box and a
 * select-all/clear pair. Used by both the self-service "My projects" card on
 * /site/team and the owner-side "Add to a project" panel on /team.
 *
 * Search appears past 8 options — the tenant runs ~55 active projects, which is
 * far past the point where scanning an unfiltered list stops working. Already
 * assigned rows stay visible but disabled: hiding them makes the list shift
 * under the user between saves, and "already on it" is useful information.
 */
export function ProjectMultiSelect({
  projects,
  selected,
  onChange,
  alreadyIn = [],
  alreadyLabel = "Already added",
  maxHeight = 260,
}: {
  projects: SelectableProject[];
  selected: string[];
  onChange: (ids: string[]) => void;
  alreadyIn?: string[];
  alreadyLabel?: string;
  maxHeight?: number;
}) {
  const [query, setQuery] = useState("");

  const alreadySet = useMemo(() => new Set(alreadyIn), [alreadyIn]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  // Select-all acts on what is currently visible and still selectable, so it
  // never silently picks rows the search has filtered out of view.
  const selectableVisible = filtered.filter((p) => !alreadySet.has(p.id));
  const allVisibleSelected =
    selectableVisible.length > 0 && selectableVisible.every((p) => selectedSet.has(p.id));

  function toggle(id: string) {
    if (alreadySet.has(id)) return;
    onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      const visible = new Set(selectableVisible.map((p) => p.id));
      onChange(selected.filter((id) => !visible.has(id)));
    } else {
      onChange([...new Set([...selected, ...selectableVisible.map((p) => p.id)])]);
    }
  }

  return (
    <div>
      {projects.length > 8 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          style={{
            width: "100%", padding: "9px 11px", borderRadius: 10, marginBottom: 8,
            border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
            color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
      )}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 6,
      }}>
        <button type="button" onClick={toggleAllVisible} disabled={selectableVisible.length === 0}
          style={{
            background: "none", border: "none", padding: "4px 0", fontSize: 12,
            fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            color: selectableVisible.length === 0 ? "var(--color-tan)" : "var(--color-forest)",
          }}>
          {allVisibleSelected ? "Clear these" : `Select all${query ? " shown" : ""}`}
        </button>
        <span style={{ fontSize: 12, color: "var(--color-tan)" }}>
          {selected.length} selected
        </span>
      </div>

      <div style={{
        maxHeight, overflowY: "auto", border: "1px solid var(--color-line)",
        borderRadius: 10, background: "var(--color-paper-light)",
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: "var(--color-tan)", textAlign: "center" }}>
            No projects match “{query}”.
          </div>
        ) : (
          filtered.map((p, i) => {
            const isIn = alreadySet.has(p.id);
            const isChecked = selectedSet.has(p.id);
            return (
              <label key={p.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                minHeight: 44, cursor: isIn ? "default" : "pointer",
                borderTop: i === 0 ? "none" : "1px solid var(--color-line)",
                opacity: isIn ? 0.55 : 1,
              }}>
                <input
                  type="checkbox"
                  checked={isChecked || isIn}
                  disabled={isIn}
                  onChange={() => toggle(p.id)}
                  style={{ width: 18, height: 18, flexShrink: 0, accentColor: "var(--color-forest)" }}
                />
                <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{p.name}</span>
                {isIn ? (
                  <span style={{ fontSize: 11, color: "var(--color-tan)", whiteSpace: "nowrap" }}>
                    {alreadyLabel}
                  </span>
                ) : p.current_stage ? (
                  <span style={{
                    fontSize: 11, color: "var(--color-tan)", textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}>
                    {p.current_stage}
                  </span>
                ) : null}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
