"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PaymentsCard from "@/components/payments/PaymentsCard";
import GeofencePicker from "@/components/geo/GeofencePicker";

type TablePresetOption = { id: string; name: string; table_owner_role: string; table_preset_columns?: unknown[] };
type PipelinePresetOption = { id: string; name: string; checkpoint_template_items?: unknown[] };
type PaymentPresetOption = { id: string; name: string; payment_milestone_preset_items?: { percentage: number }[] };

type ExistingAssignment = {
  id: string;
  role_on_project: string;
  users: { id: string; full_name: string; role: string } | null;
};

type TeamEntry = { user_id: string; role_on_project: string; name: string; assignment_id?: string };

type ProjectType = "residential" | "commercial" | "industrial" | "institutional" | "interior" | "urban" | "landscape" | "other";

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "institutional", label: "Institutional" },
  { value: "interior", label: "Interior" },
  { value: "urban", label: "Urban" },
  { value: "landscape", label: "Landscape" },
  { value: "other", label: "Other" },
];

const STATUSES = ["active", "on_hold", "completed"] as const;
const STAGES = [
  { value: "design", label: "Design" },
  { value: "execution", label: "Execution" },
] as const;

const TEAM_ROLES = [
  { value: "pm",             label: "Project Manager" },
  { value: "lead_architect", label: "Lead Architect" },
  { value: "design_support", label: "Design Support" },
  { value: "drafting",       label: "Drafting" },
  { value: "coordination",   label: "Coordination" },
  { value: "team_member",    label: "Team Member" },
  { value: "site_engineer",  label: "Site Engineer" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 12,
  border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
  fontSize: 14, fontFamily: "inherit", color: "var(--color-ink)",
  outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--color-tan)",
  textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6,
};

type Project = {
  id: string; name: string; project_type: string | null; status: string;
  current_stage: string;
  scope: string;
  source_payment_preset_id: string | null;
  budget_total: number | null; design_budget: number | null; execution_budget: number | null;
  estimated_work_hours: number | null;
  estimated_duration_days: number | null; start_date: string | null;
  expected_end_date: string | null; site_location: string | null;
  drive_folder_url: string | null; whatsapp_group_url: string | null;
  site_lat: number | null; site_lng: number | null;
  site_geofence_radius_m: number | null;
};

type Milestone = {
  schedule_id: string;
  project_id: string;
  milestone_name: string;
  wing: "design" | "execution";
  part: "a" | "b";
  amount_due: number;
  amount_received: number;
  variance: number;
  due_date: string;
  is_paid: boolean;
  triggered_at: string | null;
  sequence_order: number;
  notes: string | null;
  deleted_at: string | null;
};

type PaymentRecord = {
  id: string;
  payment_schedule_id: string;
  amount_paid: number;
  paid_on: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

type Checkpoint = {
  id: string;
  name: string;
  sequence_order: number;
  due_date: string;
  started_at: string | null;
  completed_at: string | null;
  requires_approval: boolean;
  approved_at: string | null;
  remarks: string | null;
  completion_percentage: number | null;
};

const CHECKPOINT_STATUS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "Started" },
  { value: "complete", label: "Completed" },
] as const;

type CPStatus = typeof CHECKPOINT_STATUS[number]["value"];

function getCheckpointStatus(cp: Checkpoint): CPStatus {
  if (cp.approved_at || cp.completed_at) return "complete";
  if (cp.started_at) return "in_progress";
  return "pending";
}

function buildCheckpointEdits(checkpoints: Checkpoint[]) {
  return Object.fromEntries(checkpoints.map(cp => [
    cp.id,
    {
      status: getCheckpointStatus(cp),
      due_date: cp.due_date,
      remarks: cp.remarks || "",
      completion_percentage: cp.completion_percentage ?? (getCheckpointStatus(cp) === "complete" ? 100 : 0)
    }
  ]));
}

export default function EditProjectModal({
  project,
  milestones = [],
  paymentRecords = [],
  checkpoints = [],
}: {
  project: Project;
  milestones?: Milestone[];
  paymentRecords?: PaymentRecord[];
  checkpoints?: Checkpoint[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [checkpointEdits, setCheckpointEdits] = useState<Record<string, { status: CPStatus; due_date: string; remarks: string; completion_percentage: number }>>(
    () => buildCheckpointEdits(checkpoints)
  );

  // Preset application (Add Presets section)
  const [tablePresets, setTablePresets] = useState<TablePresetOption[]>([]);
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetOption[]>([]);
  const [paymentPresets, setPaymentPresets] = useState<PaymentPresetOption[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [selectedTablePresetIds, setSelectedTablePresetIds] = useState<string[]>([]);
  const [selectedPipelinePresetIds, setSelectedPipelinePresetIds] = useState<string[]>([]);
  const [selectedPaymentPresetId, setSelectedPaymentPresetId] = useState("");

  // Team assignment state
  const [teamEntries, setTeamEntries] = useState<TeamEntry[]>([]);
  const [originalTeamEntries, setOriginalTeamEntries] = useState<TeamEntry[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("team_member");

  // Named only once the preset list has loaded; until then the line is simply
  // absent rather than showing a raw uuid.
  const appliedPreset = project.source_payment_preset_id
    ? paymentPresets.find(p => p.id === project.source_payment_preset_id) ?? null
    : null;

  useEffect(() => {
    if (!open) return;
    if (!presetsLoaded) {
      Promise.all([
        fetch("/api/table-presets").then(r => r.json()).catch(() => ({ presets: [] })),
        fetch("/api/pipeline-templates").then(r => r.json()).catch(() => ({ templates: [] })),
        fetch("/api/payment-presets").then(r => r.json()).catch(() => []),
      ]).then(([tableData, pipelineData, paymentData]) => {
        setTablePresets(tableData.presets ?? []);
        setPipelinePresets(pipelineData.templates ?? []);
        setPaymentPresets(Array.isArray(paymentData) ? paymentData : []);
        setPresetsLoaded(true);
      }).catch(() => setPresetsLoaded(true));
    }
    if (!usersLoaded) {
      Promise.all([
        fetch(`/api/projects/${project.id}/assignments`).then(r => r.json()).catch(() => ({ assignments: [] })),
        fetch("/api/users").then(r => r.json()).catch(() => ({ users: [] })),
      ]).then(([assignData, userData]) => {
        const assignments: ExistingAssignment[] = assignData.assignments ?? [];
        const entries: TeamEntry[] = assignments
          .filter(a => a.users)
          .map(a => ({
            user_id: a.users!.id,
            role_on_project: a.role_on_project,
            name: a.users!.full_name,
            assignment_id: a.id,
          }));
        // The saved roster is the baseline for the add/remove diff on submit, so
        // it always tracks the server.
        setOriginalTeamEntries(entries);
        // The editable list must not be clobbered by a refetch: rows the user
        // added this session have no assignment_id yet and exist only here.
        // Merge instead — server rows, plus any pending add not yet saved.
        setTeamEntries(prev => {
          const pendingAdds = prev.filter(
            p => !p.assignment_id && !entries.some(e => e.user_id === p.user_id)
          );
          return [...entries, ...pendingAdds];
        });
        setAllUsers(userData.users ?? []);
        setUsersLoaded(true);
      }).catch(() => setUsersLoaded(true));
    }
  }, [open, presetsLoaded, usersLoaded, project.id]);

  function toggleTablePreset(id: string) {
    setSelectedTablePresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function addTeamEntry() {
    if (!addUserId) return;
    const u = allUsers.find(u => u.id === addUserId);
    if (!u) return;
    if (teamEntries.find(e => e.user_id === addUserId)) return;
    setTeamEntries(prev => [...prev, { user_id: addUserId, role_on_project: addRole, name: u.full_name }]);
    setAddUserId("");
  }

  function removeTeamEntry(userId: string) {
    setTeamEntries(prev => prev.filter(e => e.user_id !== userId));
  }

  function togglePipelinePreset(id: string) {
    setSelectedPipelinePresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  const hasPresetSelection = selectedTablePresetIds.length > 0 || selectedPipelinePresetIds.length > 0 || !!selectedPaymentPresetId;

  const [form, setForm] = useState({
    name: project.name,
    project_type: (project.project_type ?? "") as ProjectType | "",
    status: project.status,
    current_stage: project.current_stage,
    scope: (project.scope === "design_only" ? "design_only" : "design_and_execution") as "design_only" | "design_and_execution",
    budget_total: project.budget_total ? String(project.budget_total) : "",
    design_budget: project.design_budget != null ? String(project.design_budget) : "",
    execution_budget: project.execution_budget != null ? String(project.execution_budget) : "",
    estimated_work_hours: project.estimated_work_hours ? String(project.estimated_work_hours) : "",
    estimated_duration_days: project.estimated_duration_days ? String(project.estimated_duration_days) : "",
    start_date: project.start_date ?? "",
    expected_end_date: project.expected_end_date ?? "",
    site_location: project.site_location ?? "",
    drive_folder_url: project.drive_folder_url ?? "",
    whatsapp_group_url: project.whatsapp_group_url ?? "",
    site_lat: project.site_lat ? String(project.site_lat) : "",
    site_lng: project.site_lng ? String(project.site_lng) : "",
    site_geofence_radius_m: project.site_geofence_radius_m ? String(project.site_geofence_radius_m) : "",
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function openModal() {
    setError(null);
    setCheckpointEdits(buildCheckpointEdits(checkpoints));
    setShowPresets(false);
    setSelectedTablePresetIds([]);
    setSelectedPipelinePresetIds([]);
    setUsersLoaded(false);
    setSelectedPaymentPresetId("");
    setOpen(true);
  }

  async function patchCheckpoint(checkpointId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${project.id}/checkpoints/${checkpointId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = typeof data?.error === "string" ? data.error : "Failed to update progress milestone";
      throw new Error(message);
    }
    return data;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Project name is required"); return; }
    setLoading(true); setError(null);

    const payload: Record<string, unknown> = { name: form.name.trim(), status: form.status, scope: form.scope };
    if (form.project_type) payload.project_type = form.project_type;
    if (form.start_date) payload.start_date = form.start_date;
    if (form.expected_end_date) payload.expected_end_date = form.expected_end_date;
    if (form.estimated_work_hours) payload.estimated_work_hours = Number(form.estimated_work_hours);
    if (form.estimated_duration_days) payload.estimated_duration_days = Number(form.estimated_duration_days);
    if (form.budget_total) payload.budget_total = Number(form.budget_total);
    // Sent unconditionally so clearing a wing budget resets it to NULL (fall
    // back to budget_total) rather than silently keeping the old amount.
    payload.design_budget = form.design_budget ? Number(form.design_budget) : null;
    payload.execution_budget = form.execution_budget ? Number(form.execution_budget) : null;
    if (form.site_location) payload.site_location = form.site_location.trim();
    if (form.drive_folder_url) payload.drive_folder_url = form.drive_folder_url.trim();
    if (form.whatsapp_group_url) payload.whatsapp_group_url = form.whatsapp_group_url.trim();
    // Sent unconditionally (null when cleared) — a truthiness guard would make
    // "Clear" a silent no-op and leave the old geofence on the project.
    payload.site_lat = form.site_lat ? Number(form.site_lat) : null;
    payload.site_lng = form.site_lng ? Number(form.site_lng) : null;
    payload.site_geofence_radius_m = form.site_geofence_radius_m ? Number(form.site_geofence_radius_m) : null;

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update project");

      if (form.current_stage !== project.current_stage) {
        const stageRes = await fetch(`/api/projects/${project.id}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: form.current_stage }),
        });
        const stageData = await stageRes.json();
        if (!stageRes.ok) throw new Error(stageData.error ?? "Failed to update project stage");
      }

      const cpChanges = checkpoints
        .filter(cp => {
          const edited = checkpointEdits[cp.id];
          const prevStatus = getCheckpointStatus(cp);
          const prevPct = cp.completion_percentage ?? (prevStatus === "complete" ? 100 : 0);
          const prevRemarks = cp.remarks || "";
          return edited.status !== prevStatus || edited.due_date !== cp.due_date || edited.remarks !== prevRemarks || edited.completion_percentage !== prevPct;
        })
        .sort((a, b) => a.sequence_order - b.sequence_order);

      for (const cp of cpChanges) {
        const edited = checkpointEdits[cp.id];
        const prevStatus = getCheckpointStatus(cp);

        if (edited.status !== prevStatus) {
          if (edited.status === "complete") {
            await patchCheckpoint(cp.id, { action: "complete" });
          } else if (edited.status === "in_progress") {
            if (prevStatus === "complete") {
              await patchCheckpoint(cp.id, { action: "reset" });
            }
            if (prevStatus !== "in_progress") {
              await patchCheckpoint(cp.id, { action: "start" });
            }
          } else {
            await patchCheckpoint(cp.id, { action: "reset" });
          }
        }

        await patchCheckpoint(cp.id, {
          action: "edit_details",
          due_date: edited.due_date,
          remarks: edited.remarks.trim() || null,
          completion_percentage: edited.status === "complete" ? 100 : edited.completion_percentage,
          completed_at: edited.status === "complete" ? new Date().toISOString() : null,
        });
      }

      if (hasPresetSelection) {
        const presetRes = await fetch(`/api/projects/${project.id}/apply-presets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table_preset_ids: selectedTablePresetIds,
            pipeline_template_ids: selectedPipelinePresetIds,
            payment_preset_id: selectedPaymentPresetId || null,
          }),
        });
        const presetData = await presetRes.json().catch(() => null);
        if (!presetRes.ok) {
          const message = typeof presetData?.error === "string" ? presetData.error : "Failed to apply presets";
          throw new Error(message);
        }
      }

      // Save team assignment changes
      const toAdd = teamEntries.filter(e => !e.assignment_id && !originalTeamEntries.find(o => o.user_id === e.user_id));
      const toRemove = originalTeamEntries.filter(o => !teamEntries.find(e => e.user_id === o.user_id) && o.assignment_id);

      await Promise.all([
        ...toAdd.map(e =>
          fetch(`/api/projects/${project.id}/assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: e.user_id, role_on_project: e.role_on_project }),
          })
        ),
        ...toRemove.map(e =>
          fetch(`/api/projects/${project.id}/assignments?assignment_id=${e.assignment_id}`, {
            method: "DELETE",
          })
        ),
      ]);

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        style={{
          padding: "9px 18px", borderRadius: 12, border: "1px solid var(--color-line)",
          background: "transparent", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--color-ink)",
        }}
      >
        Edit Project
      </button>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
          onClick={e => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 32, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <h2 className="font-serif" style={{ fontSize: 30, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>Edit Project</h2>
              <button onClick={() => setOpen(false)} style={{ width: 34, height: 34, borderRadius: 9, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Always rendered, including with zero milestones — that is
                exactly when the owner needs the card's own "+ Add" controls,
                and hiding it there left a project with no way to start a
                schedule from this modal. */}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Payment Milestones</label>
              {appliedPreset && (
                <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: -2, marginBottom: 8 }}>
                  From preset <strong style={{ color: "var(--color-ink)" }}>{appliedPreset.name}</strong>.
                  Edits here change this project only — the saved preset is untouched.
                </div>
              )}
              <PaymentsCard
                projectId={project.id}
                schedule={milestones}
                records={paymentRecords}
                scope={project.scope === "design_only" ? "design_only" : "design_and_execution"}
              />
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={labelStyle}>Project Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} required />
              </div>

              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select style={{ ...inputStyle, appearance: "none" }} value={form.project_type} onChange={e => set("project_type", e.target.value)}>
                    <option value="">— Select —</option>
                    {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={{ ...inputStyle, appearance: "none" }} value={form.status} onChange={e => set("status", e.target.value)}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>

              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Project Stage</label>
                  <select style={{ ...inputStyle, appearance: "none" }} value={form.current_stage} onChange={e => set("current_stage", e.target.value)}>
                    {STAGES.map(s => (
                      <option key={s.value} value={s.value} disabled={form.scope === "design_only" && s.value === "execution"}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Scope</label>
                  <select style={{ ...inputStyle, appearance: "none" }} value={form.scope} onChange={e => set("scope", e.target.value)}>
                    <option value="design_and_execution">Design + Execution</option>
                    <option value="design_only" disabled={form.current_stage === "execution"}>Design only</option>
                  </select>
                </div>
              </div>

              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input style={inputStyle} type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Expected End Date</label>
                  <input style={inputStyle} type="date" value={form.expected_end_date} onChange={e => set("expected_end_date", e.target.value)} />
                </div>
              </div>

              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Budget (₹)</label>
                  <input style={inputStyle} type="number" min="0" value={form.budget_total} onChange={e => set("budget_total", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label style={labelStyle}>Est. Hours</label>
                  <input style={inputStyle} type="number" min="1" value={form.estimated_work_hours} onChange={e => set("estimated_work_hours", e.target.value)} placeholder="450" />
                </div>
                <div>
                  <label style={labelStyle}>Est. Duration (days)</label>
                  <input style={inputStyle} type="number" min="1" value={form.estimated_duration_days} onChange={e => set("estimated_duration_days", e.target.value)} placeholder="180" />
                </div>
              </div>

              {/* Wing budgets — each wing's milestone percentages apply to its
                  own amount. Left blank, a wing falls back to the total. */}
              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Design Budget (₹)</label>
                  <input style={inputStyle} type="number" min="0" value={form.design_budget} onChange={e => set("design_budget", e.target.value)} placeholder="Defaults to total" />
                </div>
                {form.scope !== "design_only" && (
                  <div>
                    <label style={labelStyle}>Execution Budget (₹)</label>
                    <input style={inputStyle} type="number" min="0" value={form.execution_budget} onChange={e => set("execution_budget", e.target.value)} placeholder="Defaults to total" />
                  </div>
                )}
              </div>

              {/* A warning, not a block — the owner enters these one at a time. */}
              {form.budget_total && (form.design_budget || form.execution_budget) &&
                Math.abs(
                  (Number(form.design_budget) || 0) + (Number(form.execution_budget) || 0)
                  - Number(form.budget_total),
                ) > 0.01 && (
                <div style={{ fontSize: 12, color: "var(--color-rust)", marginTop: -6 }}>
                  Design + Execution ({((Number(form.design_budget) || 0) + (Number(form.execution_budget) || 0)).toLocaleString("en-IN")})
                  does not match the total budget ({Number(form.budget_total).toLocaleString("en-IN")}).
                </div>
              )}

              <div>
                <label style={labelStyle}>Site Location</label>
                <input style={inputStyle} value={form.site_location} onChange={e => set("site_location", e.target.value)} placeholder="e.g. Whitefield, Bangalore" />
              </div>

              <div>
                <label style={labelStyle}>Drive Folder URL</label>
                <input style={inputStyle} type="url" value={form.drive_folder_url} onChange={e => set("drive_folder_url", e.target.value)} placeholder="https://drive.google.com/…" />
              </div>

              <div>
                <label style={labelStyle}>WhatsApp Group Link</label>
                <input style={inputStyle} type="url" value={form.whatsapp_group_url} onChange={e => set("whatsapp_group_url", e.target.value)} placeholder="https://chat.whatsapp.com/…" />
              </div>

              <GeofencePicker
                lat={form.site_lat}
                lng={form.site_lng}
                radius={form.site_geofence_radius_m}
                onChange={({ lat, lng, radius }) =>
                  setForm(f => ({ ...f, site_lat: lat, site_lng: lng, site_geofence_radius_m: radius }))
                }
                labelStyle={labelStyle}
                inputStyle={inputStyle}
              />

              {/* Team Assignment */}
              <div style={{ padding: "16px", borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Team</div>
                {/* Only a cold open shows the spinner. Reopening refetches with a
                    roster already in state, and blanking it behind "Loading…"
                    made assigned members look absent for the length of a fetch. */}
                {!usersLoaded && teamEntries.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Loading…</div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select value={addUserId} onChange={e => setAddUserId(e.target.value)} style={{ ...inputStyle, fontSize: 12, flex: "1 1 150px" }}>
                        <option value="">— Add person —</option>
                        {allUsers.filter(u => !teamEntries.find(e => e.user_id === u.id)).map(u => (
                          <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                      </select>
                      <select value={addRole} onChange={e => setAddRole(e.target.value)} style={{ ...inputStyle, fontSize: 12, flex: "1 1 130px", appearance: "none" as const }}>
                        {TEAM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button type="button" onClick={addTeamEntry} disabled={!addUserId} style={{ padding: "8px 14px", borderRadius: 10, background: addUserId ? "var(--color-ink)" : "var(--color-line)", color: "#FBF8F2", fontSize: 12, fontWeight: 600, border: "none", cursor: addUserId ? "pointer" : "default" }}>Add</button>
                    </div>
                    {teamEntries.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {teamEntries.map(e => (
                          <div key={e.user_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 8, background: "var(--color-paper-light)" }}>
                            <span style={{ fontSize: 13 }}>{e.name}</span>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--color-tan)" }}>{e.role_on_project.replace(/_/g, " ")}</span>
                              <button type="button" onClick={() => removeTeamEntry(e.user_id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", padding: 0, fontSize: 12 }}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {teamEntries.length === 0 && usersLoaded && (
                      <div style={{ fontSize: 12, color: "var(--color-tan)", fontStyle: "italic" }}>No team members assigned.</div>
                    )}
                  </>
                )}
              </div>

              {/* Progress Timeline Editing */}
              {checkpoints.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Progress Timeline Milestones</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                    {[...checkpoints].sort((a, b) => a.sequence_order - b.sequence_order).map(cp => {
                      const edited = checkpointEdits[cp.id];
                      return (
                        <div key={cp.id} style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px", borderRadius: 12, border: "1px solid var(--color-line)", background: "var(--color-bg)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{cp.name}</div>
                            <div style={{ display: "flex", gap: 4 }}>
                              {CHECKPOINT_STATUS.map(({ value, label }) => {
                                const active = edited.status === value;
                                const activeColor = value === "complete" ? "var(--color-forest)" : value === "in_progress" ? "var(--color-teal)" : "var(--color-line)";
                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => setCheckpointEdits(s => ({ ...s, [cp.id]: { ...s[cp.id], status: value, completion_percentage: value === "complete" ? 100 : s[cp.id].completion_percentage } }))}
                                    style={{
                                      padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                                      border: `1.5px solid ${active ? activeColor : "var(--color-line)"}`,
                                      background: active ? activeColor : "transparent",
                                      color: active && value !== "pending" ? "#FBF8F2" : "var(--color-ink)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={{ ...labelStyle, fontSize: 10, marginBottom: 4 }}>Due Date</label>
                              <input style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} type="date" value={edited.due_date} onChange={e => setCheckpointEdits(s => ({ ...s, [cp.id]: { ...s[cp.id], due_date: e.target.value } }))} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle, fontSize: 10, marginBottom: 4 }}>Completion %</label>
                              <input style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} type="number" min="0" max="100" value={edited.completion_percentage} onChange={e => setCheckpointEdits(s => ({ ...s, [cp.id]: { ...s[cp.id], completion_percentage: Number(e.target.value) } }))} />
                            </div>
                          </div>
                          <div>
                            <label style={{ ...labelStyle, fontSize: 10, marginBottom: 4 }}>Remarks</label>
                            <input style={{ ...inputStyle, padding: "8px 12px", fontSize: 13 }} value={edited.remarks} onChange={e => setCheckpointEdits(s => ({ ...s, [cp.id]: { ...s[cp.id], remarks: e.target.value } }))} placeholder="Add a remark..." />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add Presets */}
              <div style={{ marginTop: 4, borderTop: "1px solid var(--color-line)", paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowPresets(s => !s)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <label style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Add Presets</label>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-tan)" strokeWidth="2" strokeLinecap="round" style={{ transform: showPresets ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {showPresets && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--color-tan)" }}>
                      Apply preset tables, progress milestones, or a payment schedule to this project. Existing data is kept; presets are added.
                    </div>

                    {/* Table presets */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Table Presets</div>
                      {!presetsLoaded ? (
                        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Loading…</div>
                      ) : tablePresets.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>No table presets available.</div>
                      ) : tablePresets.map(p => (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input type="checkbox" checked={selectedTablePresetIds.includes(p.id)} onChange={() => toggleTablePreset(p.id)} style={{ width: 16, height: 16, accentColor: "var(--color-forest)" }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: "var(--color-tan)" }}>{p.table_owner_role.replace(/_/g, " ")} · {p.table_preset_columns?.length ?? 0} columns</div>
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Progress timeline presets */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Progress Timeline Presets</div>
                      {!presetsLoaded ? (
                        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Loading…</div>
                      ) : pipelinePresets.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>No pipeline presets available.</div>
                      ) : pipelinePresets.map(p => (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input type="checkbox" checked={selectedPipelinePresetIds.includes(p.id)} onChange={() => togglePipelinePreset(p.id)} style={{ width: 16, height: 16, accentColor: "var(--color-forest)" }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: "var(--color-tan)" }}>{p.checkpoint_template_items?.length ?? 0} milestones</div>
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Payment preset */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payment Milestone Preset</div>
                      <select value={selectedPaymentPresetId} onChange={e => setSelectedPaymentPresetId(e.target.value)} style={{ ...inputStyle, fontSize: 13, appearance: "none" as const }}>
                        <option value="">Custom / no payment preset</option>
                        {paymentPresets.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.payment_milestone_preset_items?.length ?? 0} milestones)</option>
                        ))}
                      </select>
                      {selectedPaymentPresetId && !form.budget_total && (
                        <div style={{ fontSize: 12, color: "var(--color-rust)" }}>Set a project budget above to apply a payment preset.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#C5543B18", color: "var(--color-rust)", fontSize: 13 }}>{error}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" onClick={() => setOpen(false)} style={{ padding: "10px 20px", borderRadius: 12, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ padding: "10px 24px", borderRadius: 12, background: loading ? "var(--color-tan)" : "var(--color-ink)", color: "#FBF8F2", fontSize: 13, fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer" }}>
                  {loading ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
