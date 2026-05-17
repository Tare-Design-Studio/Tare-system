"use client";

import { useState } from "react";

export type MaterialPlanRow = {
  id: string;
  material_name: string;
  unit: string;
  planned_quantity: number;
  planned_for_date: string | null;
  consumed: number;
};

export type MaterialPresetOption = {
  id: string;
  name: string;
  itemCount: number;
};

interface MaterialPlanCardProps {
  projectId: string;
  initialRows: MaterialPlanRow[];
  canEdit: boolean;
  presets: MaterialPresetOption[];
}

type FormState = { material_name: string; unit: string; planned_quantity: string; planned_for_date: string };

const EMPTY_FORM: FormState = { material_name: "", unit: "", planned_quantity: "", planned_for_date: "" };

// Shared 5-column grid: material grows, the rest are fixed.
const GRID = "minmax(0,1fr) 64px 90px 90px 96px";

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 9,
  border: "1px solid var(--color-line)",
  background: "var(--color-bg)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--color-tan)",
  textTransform: "uppercase",
  letterSpacing: 1,
  display: "block",
  marginBottom: 4,
};

export function MaterialPlanCard({ projectId, initialRows, canEdit, presets }: MaterialPlanCardProps) {
  const [rows, setRows] = useState<MaterialPlanRow[]>(initialRows);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState("");

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): { material_name: string; unit: string; planned_quantity: number; planned_for_date?: string } | null => {
    const qty = parseFloat(form.planned_quantity);
    if (!form.material_name.trim() || !form.unit.trim() || isNaN(qty) || qty <= 0) {
      setError("Material name, unit and a positive quantity are required.");
      return null;
    }
    return {
      material_name: form.material_name.trim(),
      unit: form.unit.trim(),
      planned_quantity: qty,
      planned_for_date: form.planned_for_date || undefined,
    };
  };

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setAdding(true);
  };

  const startEdit = (row: MaterialPlanRow) => {
    setAdding(false);
    setError(null);
    setEditingId(row.id);
    setForm({
      material_name: row.material_name,
      unit: row.unit,
      planned_quantity: String(row.planned_quantity),
      planned_for_date: row.planned_for_date ?? "",
    });
  };

  const cancel = () => {
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const create = async () => {
    const payload = validate();
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/material-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.formErrors?.join(", ") ?? json.error ?? "Failed to add material");
      setRows((prev) => [...prev, { ...json.data, planned_quantity: Number(json.data.planned_quantity), consumed: 0 }]);
      cancel();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (planId: string) => {
    const payload = validate();
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/material-plan/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, planned_for_date: form.planned_for_date || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update material");
      setRows((prev) =>
        prev.map((r) =>
          r.id === planId
            ? { ...r, ...json.data, planned_quantity: Number(json.data.planned_quantity) }
            : r
        )
      );
      cancel();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (planId: string) => {
    if (!window.confirm("Remove this material from the plan?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/material-plan/${planId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to delete material");
      setRows((prev) => prev.filter((r) => r.id !== planId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error deleting");
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = async () => {
    if (!presetId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/material-plan/from-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset_id: presetId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to apply preset");
      const added: MaterialPlanRow[] = (json.data ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => ({ ...m, planned_quantity: Number(m.planned_quantity), consumed: 0 })
      );
      setRows((prev) => [...prev, ...added]);
      setPresetId("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error applying preset");
    } finally {
      setBusy(false);
    }
  };

  const formGrid = (onSave: () => void) => (
    <div style={{ padding: 14, borderRadius: 12, background: "var(--color-bg)", marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.4fr", gap: 8 }}>
        <div>
          <label style={labelStyle}>Material</label>
          <input style={inputStyle} value={form.material_name} onChange={(e) => set("material_name", e.target.value)} placeholder="e.g. Cement" />
        </div>
        <div>
          <label style={labelStyle}>Unit</label>
          <input style={inputStyle} value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="bags" />
        </div>
        <div>
          <label style={labelStyle}>Planned Qty</label>
          <input style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} type="number" value={form.planned_quantity} onChange={(e) => set("planned_quantity", e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Planned For</label>
          <input style={inputStyle} type="date" value={form.planned_for_date} onChange={(e) => set("planned_for_date", e.target.value)} />
        </div>
      </div>
      {error && <div style={{ color: "var(--color-rust)", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSave} disabled={busy} style={{ padding: "8px 18px", borderRadius: 9, background: "var(--color-forest)", color: "#FFF", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          Save
        </button>
        <button onClick={cancel} disabled={busy} style={{ padding: "8px 14px", borderRadius: 9, background: "var(--bg-2)", fontSize: 13, border: "1px solid var(--color-line)", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Material Plan</div>
        {canEdit && !adding && (
          <button
            onClick={startAdd}
            style={{ padding: "6px 12px", borderRadius: 8, background: "var(--color-ink)", color: "#F3EFE7", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            + Add Material
          </button>
        )}
      </div>

      {/* Apply a preset */}
      {canEdit && presets.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            style={{ ...inputStyle, flex: 1, cursor: "pointer" }}
          >
            <option value="">Apply a material preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.itemCount} item{p.itemCount === 1 ? "" : "s"})
              </option>
            ))}
          </select>
          <button
            onClick={applyPreset}
            disabled={busy || !presetId}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "none",
              background: presetId ? "var(--color-forest)" : "var(--color-line)",
              color: "#FFF", fontSize: 13, fontWeight: 600,
              cursor: presetId ? "pointer" : "default", whiteSpace: "nowrap",
            }}
          >
            Apply
          </button>
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <p style={{ color: "var(--color-tan)", fontSize: 13, fontStyle: "italic" }}>
          No planned materials yet.{canEdit ? " Add one or apply a preset above." : ""}
        </p>
      ) : (
        <div>
          {rows.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "0 0 8px", fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid var(--color-line)" }}>
              <div style={{ textAlign: "left" }}>Material</div>
              <div style={{ textAlign: "right" }}>Unit</div>
              <div style={{ textAlign: "right" }}>Planned</div>
              <div style={{ textAlign: "right" }}>Consumed</div>
              <div style={{ textAlign: "right" }} />
            </div>
          )}
          {rows.map((row) =>
            editingId === row.id ? (
              <div key={row.id}>{formGrid(() => saveEdit(row.id))}</div>
            ) : (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "10px 0", borderBottom: "1px solid var(--color-line)", alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.material_name}
                  </div>
                  {row.planned_for_date && (
                    <div style={{ fontSize: 10, color: "var(--color-tan)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
                      {new Date(row.planned_for_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-tan)", textAlign: "right", fontFamily: "var(--font-mono)" }}>{row.unit}</div>
                <div style={{ fontSize: 13, fontWeight: 600, textAlign: "right", fontFamily: "var(--font-mono)" }}>{row.planned_quantity.toLocaleString()}</div>
                <div style={{ fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: row.consumed > row.planned_quantity ? "var(--color-rust)" : "var(--color-tan)" }}>
                  {row.consumed.toLocaleString()}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {canEdit && (
                    <>
                      <button onClick={() => startEdit(row)} style={{ fontSize: 11, color: "var(--color-forest)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                        Edit
                      </button>
                      <button onClick={() => remove(row.id)} style={{ fontSize: 11, color: "var(--color-rust)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {adding && formGrid(create)}
      {!adding && !editingId && error && <div style={{ color: "var(--color-rust)", fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
