"use client";
import { useState } from "react";
import { Icon } from "@/components/atoms";
import { PageHeader } from "../../PageHeader";
import { PaymentPresetsClient } from "../payment-presets/PaymentPresetsClient";
import { MaterialPresetsClient } from "../material-presets/MaterialPresetsClient";

type ColumnKind = "text" | "checkbox" | "date" | "revision_text" | "serial";

interface PresetColumn {
  id: string;
  name: string;
  column_kind: string;
  display_order: number;
  is_required: boolean | null;
}

interface PresetSection {
  id: string;
  name: string;
  display_order: number;
}

interface PresetRow {
  id: string;
  cells: unknown;
  display_order: number;
  section_id: string | null;
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  table_owner_role: string;
  is_system: boolean | null;
  is_default_for_role: boolean | null;
  created_at: string;
  table_preset_columns: PresetColumn[];
  table_preset_sections: PresetSection[];
  table_preset_rows: PresetRow[];
}

interface PipelineItem {
  id: string;
  name: string;
  sequence_order: number;
  default_offset_days: number | null;
  requires_approval: boolean | null;
  default_payment_pct: number | null;
}

interface PipelineTemplate {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean | null;
  created_at: string;
  checkpoint_template_items: PipelineItem[];
}

interface PaymentPreset {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  payment_milestone_preset_items: {
    id?: string;
    milestone_name: string;
    percentage: number;
    sequence_order: number;
    notes?: string | null;
  }[];
}

interface MaterialPreset {
  id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  material_plan_preset_items: {
    id?: string;
    material_name: string;
    unit: string;
    planned_quantity: number;
    sequence_order: number;
  }[];
}

interface Props {
  initialPresets: Preset[];
  initialPipelineTemplates: PipelineTemplate[];
  initialPaymentPresets: PaymentPreset[];
  initialMaterialPresets: MaterialPreset[];
}

const CARD_STYLE: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  border: "1px solid rgba(30,28,24,.04)",
  boxShadow: "0 1px 0 #FFF inset, 0 2px 8px -4px rgba(30,28,24,.06)",
};

const INPUT_STYLE: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const PRIMARY_BTN: React.CSSProperties = {
  background: "var(--color-ink)",
  color: "#FBF8F2",
  borderRadius: 12,
  padding: "9px 20px",
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const GHOST_BTN: React.CSSProperties = {
  background: "transparent",
  color: "var(--color-ink)",
  borderRadius: 12,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid var(--color-line)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export default function TablePresetsClient({ initialPresets, initialPipelineTemplates, initialPaymentPresets, initialMaterialPresets }: Props) {
  const [activeTab, setActiveTab] = useState<"tables" | "pipelines" | "payments" | "materials">("tables");

  // Table preset state
  const [presets, setPresets] = useState<Preset[]>(initialPresets);
  const [selectedId, setSelectedId] = useState<string | null>(initialPresets[0]?.id ?? null);
  const [showNewForm, setShowNewForm] = useState(false);

  // New preset form state
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRole, setNewRole] = useState("team_member");
  const [creating, setCreating] = useState(false);

  // Inline name edit
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState("");

  // Add column form
  const [showAddCol, setShowAddCol] = useState(false);
  const [colName, setColName] = useState("");
  const [colKind, setColKind] = useState<ColumnKind>("text");
  const [addingCol, setAddingCol] = useState(false);

  // Add section form
  const [showAddSec, setShowAddSec] = useState(false);
  const [secName, setSecName] = useState("");
  const [addingSec, setAddingSec] = useState(false);

  // Add row form
  const [showAddRow, setShowAddRow] = useState(false);
  const [rowSectionId, setRowSectionId] = useState("");
  const [addingRow, setAddingRow] = useState(false);

  const selected = presets.find((p) => p.id === selectedId) ?? null;

  // Pipeline template state
  const [pipelines, setPipelines] = useState<PipelineTemplate[]>(initialPipelineTemplates);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(initialPipelineTemplates[0]?.id ?? null);
  const [showNewPipelineForm, setShowNewPipelineForm] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineDesc, setNewPipelineDesc] = useState("");
  const [creatingPipeline, setCreatingPipeline] = useState(false);

  const [showAddStage, setShowAddStage] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageOffsetDays, setStageOffsetDays] = useState("");
  const [stageRequiresApproval, setStageRequiresApproval] = useState(false);
  const [addingStage, setAddingStage] = useState(false);

  // Inline stage edit
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editStageName, setEditStageName] = useState("");
  const [editStageOffset, setEditStageOffset] = useState("");
  const [editStageApproval, setEditStageApproval] = useState(false);
  const [savingStage, setSavingStage] = useState(false);

  // Error surfacing
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId) ?? null;

  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const data = await res.json() as { error?: string };
      return data.error ?? fallback;
    } catch {
      return fallback;
    }
  }

  function startEditStage(item: PipelineItem) {
    setEditingStageId(item.id);
    setEditStageName(item.name);
    setEditStageOffset(item.default_offset_days != null ? String(item.default_offset_days) : "");
    setEditStageApproval(item.requires_approval ?? false);
  }

  async function saveStage() {
    if (!selectedPipeline || !editingStageId || !editStageName.trim()) return;
    setSavingStage(true);
    const res = await fetch(`/api/pipeline-templates/${selectedPipeline.id}/items/${editingStageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editStageName.trim(),
        default_offset_days: editStageOffset ? parseInt(editStageOffset) : null,
        requires_approval: editStageApproval,
      }),
    });
    if (res.ok) {
      const { item } = await res.json() as { item: PipelineItem };
      setPipelines(p => p.map(x => x.id === selectedPipeline.id
        ? { ...x, checkpoint_template_items: x.checkpoint_template_items.map(i => i.id === item.id ? item : i) }
        : x
      ));
      setEditingStageId(null);
    } else {
      setErrorMsg(await readError(res, "Failed to update stage"));
    }
    setSavingStage(false);
  }

  async function createPipeline() {
    if (!newPipelineName.trim()) return;
    setCreatingPipeline(true);
    const res = await fetch("/api/pipeline-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPipelineName.trim(), description: newPipelineDesc || undefined }),
    });
    if (res.ok) {
      const { template } = await res.json() as { template: PipelineTemplate };
      const full: PipelineTemplate = { ...template, checkpoint_template_items: [] };
      setPipelines(p => [full, ...p]);
      setSelectedPipelineId(full.id);
      setShowNewPipelineForm(false);
      setNewPipelineName(""); setNewPipelineDesc("");
    }
    setCreatingPipeline(false);
  }

  async function deletePipeline() {
    if (!selectedPipeline || selectedPipeline.is_system) return;
    if (!confirm(`Delete "${selectedPipeline.name}"?`)) return;
    const res = await fetch(`/api/pipeline-templates/${selectedPipeline.id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      const remaining = pipelines.filter(p => p.id !== selectedPipeline.id);
      setPipelines(remaining);
      setSelectedPipelineId(remaining[0]?.id ?? null);
    }
  }

  async function addStage() {
    if (!selectedPipeline || !stageName.trim()) return;
    setAddingStage(true);
    const sortedItems = [...selectedPipeline.checkpoint_template_items].sort((a, b) => a.sequence_order - b.sequence_order);
    const nextOrder = sortedItems.length > 0 ? sortedItems[sortedItems.length - 1].sequence_order + 1 : 1;
    const res = await fetch(`/api/pipeline-templates/${selectedPipeline.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: stageName.trim(),
        sequence_order: nextOrder,
        default_offset_days: stageOffsetDays ? parseInt(stageOffsetDays) : null,
        requires_approval: stageRequiresApproval,
      }),
    });
    if (res.ok) {
      const { item } = await res.json() as { item: PipelineItem };
      setPipelines(p => p.map(x => x.id === selectedPipeline.id
        ? { ...x, checkpoint_template_items: [...x.checkpoint_template_items, item] }
        : x
      ));
      setStageName(""); setStageOffsetDays(""); setStageRequiresApproval(false); setShowAddStage(false);
    } else {
      setErrorMsg(await readError(res, "Failed to add stage"));
    }
    setAddingStage(false);
  }

  async function deleteStage(itemId: string) {
    if (!selectedPipeline) return;
    const res = await fetch(`/api/pipeline-templates/${selectedPipeline.id}/items/${itemId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setPipelines(p => p.map(x => x.id === selectedPipeline.id
        ? { ...x, checkpoint_template_items: x.checkpoint_template_items.filter(i => i.id !== itemId) }
        : x
      ));
    } else {
      setErrorMsg(await readError(res, "Failed to delete stage"));
    }
  }

  async function createPreset() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/table-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc || undefined, table_owner_role: newRole }),
    });
    if (res.ok) {
      const { preset } = await res.json() as { preset: Preset };
      const full: Preset = { ...preset, table_preset_columns: [], table_preset_sections: [], table_preset_rows: [] };
      setPresets((p) => [full, ...p]);
      setSelectedId(full.id);
      setShowNewForm(false);
      setNewName(""); setNewDesc(""); setNewRole("team_member");
    } else {
      setErrorMsg(await readError(res, "Failed to create preset"));
    }
    setCreating(false);
  }

  async function saveName() {
    if (!selected || !editNameVal.trim()) { setEditingName(false); return; }
    const res = await fetch(`/api/table-presets/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editNameVal.trim() }),
    });
    if (res.ok) {
      setPresets((p) => p.map((x) => x.id === selected.id ? { ...x, name: editNameVal.trim() } : x));
    }
    setEditingName(false);
  }

  async function deletePreset() {
    if (!selected || selected.is_system) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/table-presets/${selected.id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      const remaining = presets.filter((p) => p.id !== selected.id);
      setPresets(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    }
  }

  async function addColumn() {
    if (!selected || !colName.trim()) return;
    setAddingCol(true);
    const res = await fetch(`/api/table-presets/${selected.id}/columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: colName.trim(), column_kind: colKind }),
    });
    if (res.ok) {
      const { column } = await res.json() as { column: PresetColumn };
      setPresets((p) => p.map((x) => x.id === selected.id
        ? { ...x, table_preset_columns: [...x.table_preset_columns, column] }
        : x
      ));
      setColName(""); setColKind("text"); setShowAddCol(false);
    } else {
      setErrorMsg(await readError(res, "Failed to add column"));
    }
    setAddingCol(false);
  }

  async function deleteColumn(colId: string) {
    if (!selected) return;
    const res = await fetch(`/api/table-presets/${selected.id}/columns/${colId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setPresets((p) => p.map((x) => x.id === selected.id
        ? { ...x, table_preset_columns: x.table_preset_columns.filter((c) => c.id !== colId) }
        : x
      ));
    }
  }

  async function addSection() {
    if (!selected || !secName.trim()) return;
    setAddingSec(true);
    const res = await fetch(`/api/table-presets/${selected.id}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: secName.trim() }),
    });
    if (res.ok) {
      const { section } = await res.json() as { section: PresetSection };
      setPresets((p) => p.map((x) => x.id === selected.id
        ? { ...x, table_preset_sections: [...x.table_preset_sections, section] }
        : x
      ));
      setSecName(""); setShowAddSec(false);
    } else {
      setErrorMsg(await readError(res, "Failed to add section"));
    }
    setAddingSec(false);
  }

  async function addRow() {
    if (!selected) return;
    setAddingRow(true);
    const res = await fetch(`/api/table-presets/${selected.id}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: rowSectionId || null, cells: {} }),
    });
    if (res.ok) {
      const { row } = await res.json() as { row: PresetRow };
      setPresets((p) => p.map((x) => x.id === selected.id
        ? { ...x, table_preset_rows: [...x.table_preset_rows, row] }
        : x
      ));
      setRowSectionId(""); setShowAddRow(false);
    } else {
      setErrorMsg(await readError(res, "Failed to add row"));
    }
    setAddingRow(false);
  }

  async function deleteRow(rowId: string) {
    if (!selected) return;
    const res = await fetch(`/api/table-presets/${selected.id}/rows/${rowId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setPresets((p) => p.map((x) => x.id === selected.id
        ? { ...x, table_preset_rows: x.table_preset_rows.filter((r) => r.id !== rowId) }
        : x
      ));
    }
  }

  const TAB_BTN = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600,
    border: "none", cursor: "pointer", transition: "all .15s",
    background: active ? "var(--color-ink)" : "transparent",
    color: active ? "#FBF8F2" : "var(--color-tan)",
  });

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Presets"
        eyebrow="Settings"
        actions={
          activeTab === "tables" ? (
            <button style={PRIMARY_BTN} onClick={() => { setShowNewForm(true); setSelectedId(null); }}>
              <Icon name="plus" size={14} />New Table Preset
            </button>
          ) : activeTab === "pipelines" ? (
            <button style={PRIMARY_BTN} onClick={() => { setShowNewPipelineForm(true); setSelectedPipelineId(null); }}>
              <Icon name="plus" size={14} />New Pipeline Template
            </button>
          ) : null
        }
      />

      {errorMsg && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            background: "rgba(178,74,52,.08)", border: "1px solid var(--color-rust)",
            color: "var(--color-rust)", borderRadius: 12, padding: "10px 14px",
            fontSize: 13, marginBottom: 16,
          }}
        >
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-rust)", padding: 2 }}
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, background: "var(--color-bg)", borderRadius: 12, padding: 4, width: "fit-content", marginBottom: 24 }}>
        <button style={TAB_BTN(activeTab === "tables")} onClick={() => setActiveTab("tables")}>Table Presets</button>
        <button style={TAB_BTN(activeTab === "pipelines")} onClick={() => setActiveTab("pipelines")}>Pipeline Templates</button>
        <button style={TAB_BTN(activeTab === "payments")} onClick={() => setActiveTab("payments")}>Payment Milestones</button>
        <button style={TAB_BTN(activeTab === "materials")} onClick={() => setActiveTab("materials")}>Material Plan</button>
      </div>

      {activeTab === "tables" && <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
        {/* Left panel */}
        <div style={{ ...CARD_STYLE, padding: 0, overflow: "hidden" }}>
          {presets.length === 0 && (
            <p style={{ padding: 20, fontSize: 13, color: "var(--color-tan)", margin: 0 }}>No presets yet.</p>
          )}
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedId(p.id); setShowNewForm(false); setEditingName(false); setShowAddCol(false); setShowAddSec(false); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "14px 20px",
                border: "none",
                borderBottom: "1px solid rgba(30,28,24,.05)",
                background: selectedId === p.id ? "var(--color-ink)" : "transparent",
                color: selectedId === p.id ? "#FBF8F2" : "var(--color-ink)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
              <div style={{
                fontSize: 11,
                marginTop: 3,
                opacity: 0.6,
                color: selectedId === p.id ? "#FBF8F2" : "var(--color-tan)",
              }}>
                {p.table_preset_columns.length} cols · {p.is_system ? "System" : p.table_owner_role}
              </div>
            </button>
          ))}
        </div>

        {/* Right panel */}
        <div>
          {showNewForm && (
            <div style={CARD_STYLE}>
              <h2 className="font-serif" style={{ fontSize: 20, margin: "0 0 20px" }}>New Preset</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--color-tan)", display: "block", marginBottom: 6 }}>Name</label>
                  <input
                    style={INPUT_STYLE}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Drawing Register"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--color-tan)", display: "block", marginBottom: 6 }}>Description</label>
                  <input
                    style={INPUT_STYLE}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--color-tan)", display: "block", marginBottom: 6 }}>Owner Role</label>
                  <select
                    style={{ ...INPUT_STYLE }}
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="team_member">Team Member</option>
                    <option value="site_engineer">Site Engineer</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button style={PRIMARY_BTN} onClick={createPreset} disabled={creating}>
                    {creating ? "Creating…" : "Create"}
                  </button>
                  <button style={GHOST_BTN} onClick={() => setShowNewForm(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {!showNewForm && selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Preset header card */}
              <div style={CARD_STYLE}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    {editingName ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          style={{ ...INPUT_STYLE, fontSize: 20, fontWeight: 600 }}
                          value={editNameVal}
                          onChange={(e) => setEditNameVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                          autoFocus
                        />
                        <button style={PRIMARY_BTN} onClick={saveName}>Save</button>
                        <button style={GHOST_BTN} onClick={() => setEditingName(false)}>Cancel</button>
                      </div>
                    ) : (
                      <button
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", textAlign: "left" }}
                        onClick={() => { setEditingName(true); setEditNameVal(selected.name); }}
                        title="Click to edit"
                      >
                        <h2 className="font-serif" style={{ fontSize: 22, margin: 0 }}>{selected.name}</h2>
                      </button>
                    )}
                    {selected.description && (
                      <p style={{ fontSize: 13, color: "var(--color-tan)", margin: "6px 0 0" }}>{selected.description}</p>
                    )}
                    <p style={{ fontSize: 12, color: "var(--color-tan)", margin: "8px 0 0" }}>
                      Role: {selected.table_owner_role}
                      {selected.is_system && " · System preset"}
                      {selected.is_default_for_role && " · Default for role"}
                    </p>
                  </div>
                  {!selected.is_system && (
                    <button
                      style={{ ...GHOST_BTN, color: "var(--color-rust)", borderColor: "var(--color-rust)" }}
                      onClick={deletePreset}
                    >
                      <Icon name="x" size={14} />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Columns card */}
              <div style={CARD_STYLE}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 className="font-serif" style={{ fontSize: 17, margin: 0 }}>Columns</h3>
                  <button style={GHOST_BTN} onClick={() => setShowAddCol((v) => !v)}>
                    <Icon name="plus" size={13} />
                    Add Column
                  </button>
                </div>

                {showAddCol && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Name</label>
                      <input
                        style={INPUT_STYLE}
                        value={colName}
                        onChange={(e) => setColName(e.target.value)}
                        placeholder="Column name"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Kind</label>
                      <select
                        style={{ ...INPUT_STYLE, width: "auto" }}
                        value={colKind}
                        onChange={(e) => setColKind(e.target.value as ColumnKind)}
                      >
                        <option value="text">Text</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="date">Date</option>
                        <option value="revision_text">Revision Text</option>
                        <option value="serial">Serial</option>
                      </select>
                    </div>
                    <button style={PRIMARY_BTN} onClick={addColumn} disabled={addingCol}>
                      {addingCol ? "Adding…" : "Add"}
                    </button>
                    <button style={GHOST_BTN} onClick={() => setShowAddCol(false)}>Cancel</button>
                  </div>
                )}

                {selected.table_preset_columns.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--color-tan)", margin: 0 }}>No columns defined.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[...selected.table_preset_columns]
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((col) => (
                        <div
                          key={col.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 0",
                            borderBottom: "1px solid rgba(30,28,24,.05)",
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 14 }}>{col.name}</span>
                            <span style={{
                              fontSize: 11,
                              color: "var(--color-tan)",
                              marginLeft: 8,
                              background: "rgba(30,28,24,.06)",
                              borderRadius: 6,
                              padding: "2px 6px",
                            }}>
                              {col.column_kind}
                            </span>
                          </div>
                          <button
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", padding: 4 }}
                            onClick={() => deleteColumn(col.id)}
                            title="Remove column"
                          >
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sections card */}
              <div style={CARD_STYLE}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 className="font-serif" style={{ fontSize: 17, margin: 0 }}>Sections</h3>
                  <button style={GHOST_BTN} onClick={() => setShowAddSec((v) => !v)}>
                    <Icon name="plus" size={13} />
                    Add Section
                  </button>
                </div>

                {showAddSec && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Name</label>
                      <input
                        style={INPUT_STYLE}
                        value={secName}
                        onChange={(e) => setSecName(e.target.value)}
                        placeholder="Section name"
                      />
                    </div>
                    <button style={PRIMARY_BTN} onClick={addSection} disabled={addingSec}>
                      {addingSec ? "Adding…" : "Add"}
                    </button>
                    <button style={GHOST_BTN} onClick={() => setShowAddSec(false)}>Cancel</button>
                  </div>
                )}

                {selected.table_preset_sections.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--color-tan)", margin: 0 }}>No sections defined.</p>
                ) : (
                  <div>
                    {[...selected.table_preset_sections]
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((sec) => (
                        <div
                          key={sec.id}
                          style={{
                            padding: "10px 0",
                            borderBottom: "1px solid rgba(30,28,24,.05)",
                            fontSize: 14,
                          }}
                        >
                          {sec.name}
                        </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rows card */}
              <div style={CARD_STYLE}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 className="font-serif" style={{ fontSize: 17, margin: 0 }}>Rows</h3>
                  <button style={GHOST_BTN} onClick={() => setShowAddRow((v) => !v)}>
                    <Icon name="plus" size={13} />
                    Add Row
                  </button>
                </div>

                {showAddRow && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Section</label>
                      <select
                        style={INPUT_STYLE}
                        value={rowSectionId}
                        onChange={(e) => setRowSectionId(e.target.value)}
                      >
                        <option value="">No section</option>
                        {[...selected.table_preset_sections]
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((sec) => (
                            <option key={sec.id} value={sec.id}>{sec.name}</option>
                          ))}
                      </select>
                    </div>
                    <button style={PRIMARY_BTN} onClick={addRow} disabled={addingRow}>
                      {addingRow ? "Adding…" : "Add"}
                    </button>
                    <button style={GHOST_BTN} onClick={() => setShowAddRow(false)}>Cancel</button>
                  </div>
                )}

                {selected.table_preset_rows.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--color-tan)", margin: 0 }}>No starter rows defined.</p>
                ) : (
                  <div>
                    {[...selected.table_preset_rows]
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((row) => {
                        const section = selected.table_preset_sections.find((sec) => sec.id === row.section_id);
                        return (
                          <div
                            key={row.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 0",
                              borderBottom: "1px solid rgba(30,28,24,.05)",
                              fontSize: 14,
                            }}
                          >
                            <span>
                              Row {row.display_order}
                              <span style={{ color: "var(--color-tan)", marginLeft: 8 }}>{section?.name ?? "No section"}</span>
                            </span>
                            <button
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", padding: 4 }}
                              onClick={() => deleteRow(row.id)}
                              title="Remove row"
                            >
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {!showNewForm && !selected && (
            <div style={{ ...CARD_STYLE, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <p style={{ color: "var(--color-tan)", fontSize: 14, margin: 0 }}>Select a preset or create a new one.</p>
            </div>
          )}
        </div>
      </div>}

      {activeTab === "pipelines" && <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
        {/* Pipeline left panel */}
        <div style={{ ...CARD_STYLE, padding: 0, overflow: "hidden" }}>
          {pipelines.length === 0 && (
            <p style={{ padding: 20, fontSize: 13, color: "var(--color-tan)", margin: 0 }}>No templates yet.</p>
          )}
          {pipelines.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedPipelineId(p.id); setShowNewPipelineForm(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "14px 20px", border: "none",
                borderBottom: "1px solid rgba(30,28,24,.05)",
                background: selectedPipelineId === p.id ? "var(--color-ink)" : "transparent",
                color: selectedPipelineId === p.id ? "#FBF8F2" : "var(--color-ink)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
              <div style={{ fontSize: 11, marginTop: 3, opacity: 0.6, color: selectedPipelineId === p.id ? "#FBF8F2" : "var(--color-tan)" }}>
                {p.checkpoint_template_items.length} stages{p.is_system ? " · System" : ""}
              </div>
            </button>
          ))}
        </div>

        {/* Pipeline right panel */}
        <div>
          {showNewPipelineForm && (
            <div style={CARD_STYLE}>
              <h2 className="font-serif" style={{ fontSize: 20, margin: "0 0 20px" }}>New Pipeline Template</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "var(--color-tan)", display: "block", marginBottom: 6 }}>Name</label>
                  <input style={INPUT_STYLE} value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)} placeholder="e.g. Standard Residential" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "var(--color-tan)", display: "block", marginBottom: 6 }}>Description</label>
                  <input style={INPUT_STYLE} value={newPipelineDesc} onChange={e => setNewPipelineDesc(e.target.value)} placeholder="Optional" />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button style={PRIMARY_BTN} onClick={createPipeline} disabled={creatingPipeline}>
                    {creatingPipeline ? "Creating…" : "Create"}
                  </button>
                  <button style={GHOST_BTN} onClick={() => setShowNewPipelineForm(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {!showNewPipelineForm && selectedPipeline && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={CARD_STYLE}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <h2 className="font-serif" style={{ fontSize: 22, margin: 0 }}>{selectedPipeline.name}</h2>
                    {selectedPipeline.description && (
                      <p style={{ fontSize: 13, color: "var(--color-tan)", margin: "6px 0 0" }}>{selectedPipeline.description}</p>
                    )}
                    {selectedPipeline.is_system && (
                      <p style={{ fontSize: 12, color: "var(--color-tan)", margin: "6px 0 0" }}>System template — cannot be deleted</p>
                    )}
                  </div>
                  {!selectedPipeline.is_system && (
                    <button style={{ ...GHOST_BTN, color: "var(--color-rust)", borderColor: "var(--color-rust)" }} onClick={deletePipeline}>
                      <Icon name="x" size={14} />Delete
                    </button>
                  )}
                </div>
              </div>

              <div style={CARD_STYLE}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 className="font-serif" style={{ fontSize: 17, margin: 0 }}>Stages</h3>
                  <button style={GHOST_BTN} onClick={() => setShowAddStage(v => !v)}>
                    <Icon name="plus" size={13} />Add Stage
                  </button>
                </div>

                {showAddStage && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 2, minWidth: 160 }}>
                      <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Stage Name</label>
                      <input style={INPUT_STYLE} value={stageName} onChange={e => setStageName(e.target.value)} placeholder="e.g. Foundation Complete" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Days from Start</label>
                      <input style={{ ...INPUT_STYLE, width: 110 }} type="number" value={stageOffsetDays} onChange={e => setStageOffsetDays(e.target.value)} placeholder="e.g. 30" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 2 }}>
                      <input type="checkbox" id="req-approval" checked={stageRequiresApproval} onChange={e => setStageRequiresApproval(e.target.checked)} />
                      <label htmlFor="req-approval" style={{ fontSize: 12 }}>Requires approval</label>
                    </div>
                    <button style={PRIMARY_BTN} onClick={addStage} disabled={addingStage}>{addingStage ? "Adding…" : "Add"}</button>
                    <button style={GHOST_BTN} onClick={() => setShowAddStage(false)}>Cancel</button>
                  </div>
                )}

                {selectedPipeline.checkpoint_template_items.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--color-tan)", margin: 0 }}>No stages defined yet.</p>
                ) : (
                  <div>
                    {[...selectedPipeline.checkpoint_template_items]
                      .sort((a, b) => a.sequence_order - b.sequence_order)
                      .map((item, idx) => (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(30,28,24,.05)", gap: 12 }}>
                          {editingStageId === item.id ? (
                            <>
                              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", flex: 1 }}>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-tan)", width: 20, paddingBottom: 10 }}>{idx + 1}</span>
                                <div style={{ flex: 2, minWidth: 140 }}>
                                  <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Stage Name</label>
                                  <input style={INPUT_STYLE} value={editStageName} onChange={e => setEditStageName(e.target.value)} autoFocus />
                                </div>
                                <div>
                                  <label style={{ fontSize: 11, color: "var(--color-tan)", display: "block", marginBottom: 4 }}>Days from Start</label>
                                  <input style={{ ...INPUT_STYLE, width: 110 }} type="number" value={editStageOffset} onChange={e => setEditStageOffset(e.target.value)} placeholder="e.g. 30" />
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 10 }}>
                                  <input type="checkbox" id={`edit-approval-${item.id}`} checked={editStageApproval} onChange={e => setEditStageApproval(e.target.checked)} />
                                  <label htmlFor={`edit-approval-${item.id}`} style={{ fontSize: 12 }}>Requires approval</label>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button style={PRIMARY_BTN} onClick={saveStage} disabled={savingStage}>{savingStage ? "Saving…" : "Save"}</button>
                                <button style={GHOST_BTN} onClick={() => setEditingStageId(null)}>Cancel</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-tan)", width: 20 }}>{idx + 1}</span>
                                <div>
                                  <div style={{ fontSize: 14 }}>{item.name}</div>
                                  <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>
                                    {item.default_offset_days !== null ? `Day ${item.default_offset_days}` : "No default date"}
                                    {item.requires_approval && " · Requires approval"}
                                  </div>
                                </div>
                              </div>
                              {!selectedPipeline.is_system && (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <button
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", padding: "2px 6px", fontSize: 12, fontFamily: "inherit" }}
                                    onClick={() => startEditStage(item)}
                                  >
                                    Edit
                                  </button>
                                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", padding: 4 }} onClick={() => deleteStage(item.id)} title="Remove stage">
                                    <Icon name="x" size={14} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!showNewPipelineForm && !selectedPipeline && (
            <div style={{ ...CARD_STYLE, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <p style={{ color: "var(--color-tan)", fontSize: 14, margin: 0 }}>Select a template or create a new one.</p>
            </div>
          )}
        </div>
      </div>}

      {activeTab === "payments" && (
        <PaymentPresetsClient initial={initialPaymentPresets} />
      )}

      {activeTab === "materials" && (
        <MaterialPresetsClient initial={initialMaterialPresets} />
      )}
    </div>
  );
}
