"use client";

import { useState } from "react";

type Wing = "design" | "execution";
type Part = "a" | "b";
type Scope = "design_only" | "design_and_execution";

type Item = {
  id?: string;
  milestone_name: string;
  percentage: number;
  sequence_order: number;
  notes?: string | null;
  wing: Wing;
  part: Part;
};

type Preset = {
  id: string;
  name: string;
  is_system: boolean;
  scope: Scope;
  created_at: string;
  payment_milestone_preset_items: Item[];
};

const WING_LABEL: Record<Wing, string> = { design: "Design", execution: "Execution" };
const PART_LABEL: Record<Part, string> = { a: "Part A", b: "Part B" };
const PARTS: Part[] = ["a", "b"];

const DEFAULT_ITEMS: Item[] = [
  { milestone_name: "Advance", percentage: 20, sequence_order: 1, wing: "design", part: "a" },
  { milestone_name: "Concept approval", percentage: 30, sequence_order: 2, wing: "design", part: "a" },
  { milestone_name: "Working drawings", percentage: 50, sequence_order: 3, wing: "design", part: "b" },
];

export function PaymentPresetsClient({ initial }: { initial: Preset[] }) {
  const [presets, setPresets] = useState<Preset[]>(initial);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<Scope>("design_and_execution");
  const [newItems, setNewItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [saving, setSaving] = useState(false);

  // Wings offered by this preset. A design-only preset has no execution wing,
  // and the API + a DB trigger refuse execution items on one.
  const wings: Wing[] = newScope === "design_only" ? ["design"] : ["design", "execution"];

  // Percentages are validated per wing: each wing's milestones are a share of
  // that wing's own budget, so each should total 100% on its own.
  const wingTotal = (wing: Wing) =>
    newItems.filter((i) => i.wing === wing).reduce((s, i) => s + Number(i.percentage || 0), 0);

  const itemsIn = (wing: Wing, part: Part) =>
    newItems.filter((i) => i.wing === wing && i.part === part);

  // Renumber sequence_order across the whole list in canonical wing/part order,
  // so what the owner sees top-to-bottom is what gets stored.
  function resequence(items: Item[]): Item[] {
    const ordered = [...items].sort((a, b) => {
      if (a.wing !== b.wing) return a.wing === "design" ? -1 : 1;
      if (a.part !== b.part) return a.part === "a" ? -1 : 1;
      return a.sequence_order - b.sequence_order;
    });
    return ordered.map((it, i) => ({ ...it, sequence_order: i + 1 }));
  }

  function addItem(wing: Wing, part: Part, afterOrder?: number) {
    const fresh: Item = {
      milestone_name: "",
      percentage: 0,
      // Sits just after the anchor row; resequence turns this into a clean run.
      sequence_order: afterOrder !== undefined ? afterOrder + 0.5 : newItems.length + 1,
      wing,
      part,
    };
    setNewItems(resequence([...newItems, fresh]));
  }

  function removeItem(item: Item) {
    setNewItems(resequence(newItems.filter((i) => i !== item)));
  }

  function updateItem(item: Item, field: keyof Item, value: string | number) {
    setNewItems(newItems.map((i) => (i === item ? { ...i, [field]: value } : i)));
  }

  // Swap a row with its neighbour inside the same wing/part group.
  function moveItem(item: Item, delta: -1 | 1) {
    const group = itemsIn(item.wing, item.part);
    const idx = group.indexOf(item);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= group.length) return;

    const a = group[idx];
    const b = group[target];
    setNewItems(resequence(newItems.map((i) => {
      if (i === a) return { ...i, sequence_order: b.sequence_order };
      if (i === b) return { ...i, sequence_order: a.sequence_order };
      return i;
    })));
  }

  // Re-file a row into another wing or part.
  function refile(item: Item, wing: Wing, part: Part) {
    setNewItems(resequence(newItems.map((i) => (i === item ? { ...i, wing, part } : i))));
  }

  function changeScope(scope: Scope) {
    setNewScope(scope);
    // Dropping to design-only would leave execution items unsaveable, so move
    // them into the design wing rather than silently discarding the owner's work.
    if (scope === "design_only") {
      setNewItems(resequence(newItems.map((i) =>
        i.wing === "execution" ? { ...i, wing: "design" as Wing } : i)));
    }
  }

  async function createPreset() {
    if (!newName.trim() || newItems.length === 0) return;
    const offWings = wings.filter((w) =>
      newItems.some((i) => i.wing === w) && Math.abs(wingTotal(w) - 100) > 0.01);
    if (offWings.length > 0) {
      const detail = offWings.map((w) => `${WING_LABEL[w]} ${wingTotal(w).toFixed(2)}%`).join(", ");
      if (!confirm(`${detail} (not 100%). Save anyway?`)) return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payment-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), scope: newScope, items: resequence(newItems) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPresets([...presets, data]);
      setNewName("");
      setNewScope("design_and_execution");
      setNewItems(DEFAULT_ITEMS);
      setCreating(false);
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deletePreset(p: Preset) {
    if (p.is_system) { alert("Cannot delete a system preset."); return; }
    if (!confirm(`Delete preset "${p.name}"?`)) return;
    const res = await fetch(`/api/payment-presets?id=${p.id}`, { method: "DELETE" });
    if (!res.ok) { alert("Delete failed"); return; }
    setPresets(presets.filter((x) => x.id !== p.id));
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          onClick={() => setCreating((v) => !v)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "#FBF8F2", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          {creating ? "Cancel" : "+ New Preset"}
        </button>
      </div>

      {creating && (
        <div style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}>
            <input
              placeholder="Preset name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={input}
            />
            <select value={newScope} onChange={(e) => changeScope(e.target.value as Scope)} style={input}>
              <option value="design_and_execution">Design + Execution</option>
              <option value="design_only">Design only</option>
            </select>
          </div>

          {wings.map((wing) => (
            <div key={wing} style={{ marginTop: 16 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                borderBottom: "1px solid var(--color-line)", paddingBottom: 5, marginBottom: 8,
              }}>
                <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 16 }}>
                  {WING_LABEL[wing]}
                </span>
                <span style={{
                  fontSize: 11,
                  color: Math.abs(wingTotal(wing) - 100) > 0.01 ? "var(--color-rust)" : "var(--color-forest)",
                }}>
                  {wingTotal(wing).toFixed(2)}%
                </span>
              </div>

              {PARTS.map((part) => {
                const group = itemsIn(wing, part);
                return (
                  <div key={part} style={{ marginBottom: 10 }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      fontSize: 11, color: "var(--color-tan)", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
                    }}>
                      <span>{PART_LABEL[part]}</span>
                      <button
                        onClick={() => addItem(wing, part)}
                        style={{ ...miniBtn, textTransform: "none", letterSpacing: 0 }}
                      >+ item</button>
                    </div>

                    {group.length === 0 ? (
                      <div style={{ fontSize: 11, color: "var(--color-tan)", padding: "6px 0" }}>
                        No milestones in {PART_LABEL[part]}.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {group.map((it, idx) => (
                          <div key={it.sequence_order} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ width: 22, fontSize: 11, color: "var(--color-tan)" }}>{idx + 1}.</span>
                            <input
                              placeholder="Milestone name"
                              value={it.milestone_name}
                              onChange={(e) => updateItem(it, "milestone_name", e.target.value)}
                              style={{ ...input, flex: 1 }}
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder="%"
                              value={it.percentage}
                              onChange={(e) => updateItem(it, "percentage", parseFloat(e.target.value) || 0)}
                              style={{ ...input, width: 74 }}
                            />
                            {/* Re-file into any other wing/part without retyping the row. */}
                            <select
                              value={`${it.wing}:${it.part}`}
                              onChange={(e) => {
                                const [w, p] = e.target.value.split(":");
                                refile(it, w as Wing, p as Part);
                              }}
                              style={{ ...input, width: 130 }}
                            >
                              {wings.flatMap((w) => PARTS.map((p) => (
                                <option key={`${w}:${p}`} value={`${w}:${p}`}>
                                  {WING_LABEL[w]} · {PART_LABEL[p]}
                                </option>
                              )))}
                            </select>
                            <button
                              onClick={() => moveItem(it, -1)}
                              disabled={idx === 0}
                              title="Move up"
                              style={{ ...miniBtn, opacity: idx === 0 ? 0.4 : 1 }}
                            >↑</button>
                            <button
                              onClick={() => moveItem(it, 1)}
                              disabled={idx === group.length - 1}
                              title="Move down"
                              style={{ ...miniBtn, opacity: idx === group.length - 1 ? 0.4 : 1 }}
                            >↓</button>
                            <button
                              onClick={() => addItem(wing, part, it.sequence_order)}
                              title="Insert below"
                              style={miniBtn}
                            >+</button>
                            <button onClick={() => removeItem(it)} style={miniBtn}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              onClick={createPreset}
              disabled={saving || !newName.trim() || newItems.length === 0}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--color-forest)", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: saving ? "wait" : "pointer" }}
            >
              {saving ? "Saving…" : "Create preset"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {presets.map((p) => (
          <div key={p.id} style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>
                  {p.scope === "design_only" ? "Design only" : "Design + Execution"}
                  {" · "}
                  {p.is_system ? "System preset" : "Custom preset"} · {p.payment_milestone_preset_items.length} items
                </div>
              </div>
              {!p.is_system && (
                <button onClick={() => deletePreset(p)} style={miniBtn}>Delete</button>
              )}
            </div>

            {(p.scope === "design_only" ? (["design"] as Wing[]) : (["design", "execution"] as Wing[])).map((wing) => {
              const wingItems = p.payment_milestone_preset_items.filter((i) => (i.wing ?? "design") === wing);
              if (wingItems.length === 0) return null;
              return (
                <div key={wing} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                    {WING_LABEL[wing]}
                  </div>
                  {PARTS.map((part) => {
                    const rows = wingItems
                      .filter((i) => (i.part ?? "a") === part)
                      .sort((a, b) => a.sequence_order - b.sequence_order);
                    if (rows.length === 0) return null;
                    return (
                      <table key={part} style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 4 }}>
                        <tbody>
                          <tr>
                            <td colSpan={3} style={{ padding: "4px 0", fontSize: 10, color: "var(--color-tan)", letterSpacing: "0.06em" }}>
                              {PART_LABEL[part]}
                            </td>
                          </tr>
                          {rows.map((it, idx) => (
                            <tr key={it.id ?? `${it.milestone_name}-${it.sequence_order}`} style={{ borderTop: "1px solid var(--color-line)" }}>
                              <td style={{ padding: "6px 0", width: 28, color: "var(--color-tan)" }}>{idx + 1}.</td>
                              <td style={{ padding: "6px 0" }}>{it.milestone_name}</td>
                              <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{Number(it.percentage).toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
        {presets.length === 0 && (
          <div style={{ color: "var(--color-tan)", fontSize: 13, padding: 20, textAlign: "center" }}>
            No presets yet. Create one to reuse milestone structures across projects.
          </div>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
};

const miniBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-line)",
  background: "transparent",
  fontSize: 11,
  cursor: "pointer",
};
