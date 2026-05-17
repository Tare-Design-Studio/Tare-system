"use client";

import { useState } from "react";

type Item = {
  id?: string;
  material_name: string;
  unit: string;
  planned_quantity: number;
  sequence_order: number;
};

type Preset = {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  material_plan_preset_items: Item[];
};

export function MaterialPresetsClient({ initial }: { initial: Preset[] }) {
  const [presets, setPresets] = useState<Preset[]>(initial);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newItems, setNewItems] = useState<Item[]>([
    { material_name: "Cement", unit: "bags", planned_quantity: 0, sequence_order: 1 },
    { material_name: "Sand", unit: "cu.ft", planned_quantity: 0, sequence_order: 2 },
    { material_name: "Steel", unit: "kg", planned_quantity: 0, sequence_order: 3 },
  ]);
  const [saving, setSaving] = useState(false);

  function addItem() {
    setNewItems([...newItems, { material_name: "", unit: "", planned_quantity: 0, sequence_order: newItems.length + 1 }]);
  }
  function removeItem(idx: number) {
    setNewItems(newItems.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sequence_order: i + 1 })));
  }
  function updateItem(idx: number, field: keyof Item, value: string | number) {
    setNewItems(newItems.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  async function createPreset() {
    if (!newName.trim() || newItems.length === 0) return;
    if (newItems.some((it) => !it.material_name.trim() || !it.unit.trim() || !(it.planned_quantity > 0))) {
      alert("Each item needs a material name, unit and positive quantity.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/material-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), items: newItems }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPresets([...presets, data]);
      setNewName("");
      setNewItems([{ material_name: "", unit: "", planned_quantity: 0, sequence_order: 1 }]);
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
    const res = await fetch(`/api/material-presets?id=${p.id}`, { method: "DELETE" });
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
          <input
            placeholder="Preset name (e.g. RCC Slab Pour)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={input}
          />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {newItems.map((it, idx) => (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ width: 22, fontSize: 11, color: "var(--color-tan)" }}>{idx + 1}.</span>
                <input
                  placeholder="Material name"
                  value={it.material_name}
                  onChange={(e) => updateItem(idx, "material_name", e.target.value)}
                  style={{ ...input, flex: 1 }}
                />
                <input
                  placeholder="Unit"
                  value={it.unit}
                  onChange={(e) => updateItem(idx, "unit", e.target.value)}
                  style={{ ...input, width: 90 }}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Qty"
                  value={it.planned_quantity}
                  onChange={(e) => updateItem(idx, "planned_quantity", parseFloat(e.target.value) || 0)}
                  style={{ ...input, width: 90, fontFamily: "var(--font-mono)" }}
                />
                <button onClick={() => removeItem(idx)} style={{ ...miniBtn }}>✕</button>
              </div>
            ))}
            <button onClick={addItem} style={{ ...miniBtn, alignSelf: "flex-start", marginTop: 4 }}>+ item</button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 12 }}>
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
                  {p.is_system ? "System preset" : "Custom preset"} · {p.material_plan_preset_items.length} items
                </div>
              </div>
              {!p.is_system && (
                <button onClick={() => deletePreset(p)} style={miniBtn}>Delete</button>
              )}
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {[...p.material_plan_preset_items]
                  .sort((a, b) => a.sequence_order - b.sequence_order)
                  .map((it) => (
                    <tr key={it.id ?? it.material_name} style={{ borderTop: "1px solid var(--color-line)" }}>
                      <td style={{ padding: "6px 0", width: 28, color: "var(--color-tan)" }}>{it.sequence_order}.</td>
                      <td style={{ padding: "6px 0" }}>{it.material_name}</td>
                      <td style={{ padding: "6px 0", textAlign: "right", color: "var(--color-tan)" }}>{it.unit}</td>
                      <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "var(--font-mono)", width: 80 }}>
                        {Number(it.planned_quantity).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
        {presets.length === 0 && (
          <div style={{ color: "var(--color-tan)", fontSize: 13, padding: 20, textAlign: "center" }}>
            No presets yet. Create one to reuse material lists across projects.
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
