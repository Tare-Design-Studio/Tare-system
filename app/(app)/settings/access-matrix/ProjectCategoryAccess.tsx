"use client";

import { useEffect, useState } from "react";
import styles from "../../team/team-access.module.css";

// Project-category access (client request #3).
//
// Everyone sees every project by default. Selecting categories here NARROWS a
// member to those project types; clearing the selection restores full access.
// That inversion is stated in the UI because it is the opposite of how a
// permission list usually reads.

type Member = { id: string; full_name: string; role: string };

const TYPE_LABELS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  institutional: "Institutional",
  industrial: "Industrial",
  interior: "Interior",
  landscape: "Landscape",
  urban: "Urban",
  other: "Other",
};

export default function ProjectCategoryAccess({ members }: { members: Member[] }) {
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/access-matrix/categories");
        if (!res.ok) return;
        const data = await res.json();
        setCategories(data.categories ?? {});
        setTypes(data.project_types ?? []);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function toggle(userId: string, type: string) {
    const current = categories[userId] ?? [];
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];

    setBusy(userId);
    setMsg(null);
    // Optimistic: the checkbox responds immediately, reverted on failure.
    setCategories(c => ({ ...c, [userId]: next }));

    try {
      const res = await fetch("/api/access-matrix/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, project_types: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
      setMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setCategories(c => ({ ...c, [userId]: current }));
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(null);
    }
  }

  if (!loaded || !types.length) return null;

  const nonOwners = members.filter(m => m.role !== "owner");

  return (
    <div className={styles.card} style={{ marginTop: 18 }}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Project categories</h2>
          <p>
            Everyone sees all projects by default. Tick categories to limit a member to
            those project types — untick everything to give full access back.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0" }}>
        {nonOwners.map(m => {
          const selected = categories[m.id] ?? [];
          const unrestricted = selected.length === 0;
          return (
            <div key={m.id} style={{ borderBottom: "1px solid rgba(30,28,24,.06)", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{m.full_name}</span>
                <span style={{ fontSize: 11, color: unrestricted ? "var(--color-forest)" : "var(--color-tan)" }}>
                  {unrestricted ? "All projects" : `${selected.length} categor${selected.length === 1 ? "y" : "ies"}`}
                </span>
                {busy === m.id && <span style={{ fontSize: 11, color: "var(--color-tan)" }}>saving…</span>}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {types.map(t => {
                  const on = selected.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(m.id, t)}
                      disabled={busy === m.id}
                      style={{
                        padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                        cursor: busy === m.id ? "default" : "pointer",
                        background: on ? "var(--color-ink)" : "transparent",
                        color: on ? "#FBF8F2" : "var(--color-tan)",
                        border: `1px solid ${on ? "var(--color-ink)" : "var(--color-line)"}`,
                      }}
                    >
                      {TYPE_LABELS[t] ?? t}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {msg && (
        <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? "var(--color-forest)" : "#B4553F" }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
