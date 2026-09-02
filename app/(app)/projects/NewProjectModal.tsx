"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import GeofencePicker from "@/components/geo/GeofencePicker";

type CustomerOption = { id: string; name: string; phone: string | null; email: string | null };
type TablePresetOption = { id: string; name: string; description: string | null; table_owner_role: string; table_preset_columns?: unknown[] };
type PipelinePresetOption = { id: string; name: string; description: string | null; checkpoint_template_items?: unknown[] };
type PaymentPresetOption = { id: string; name: string; payment_milestone_preset_items?: { percentage: number }[] };

type ProjectType =
  | "residential"
  | "commercial"
  | "industrial"
  | "institutional"
  | "interior"
  | "urban"
  | "other";

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "residential",  label: "Residential" },
  { value: "commercial",   label: "Commercial" },
  { value: "industrial",   label: "Industrial" },
  { value: "institutional",label: "Institutional" },
  { value: "interior",     label: "Interior" },
  { value: "urban",        label: "Urban" },
  { value: "other",        label: "Other" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--color-ink)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-tan)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  display: "block",
  marginBottom: 6,
};

export default function NewProjectModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    project_type: "" as ProjectType | "",
    scope: "design_and_execution" as "design_only" | "design_and_execution",
    start_date: "",
    expected_end_date: "",
    estimated_work_hours: "",
    estimated_duration_days: "",
    budget_total: "",
    design_budget: "",
    execution_budget: "",
    site_location: "",
    whatsapp_group_url: "",
    site_lat: "",
    site_lng: "",
    site_geofence_radius_m: "",
  });

  // Customer selection state
  const [customerMode, setCustomerMode] = useState<"none" | "existing" | "new">("none");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "" });
  const [customersLoaded, setCustomersLoaded] = useState(false);

  // Team assignment state
  type TeamEntry = { user_id: string; role_on_project: string; name: string };
  const [teamEntries, setTeamEntries] = useState<TeamEntry[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("team_member");
  const [tablePresets, setTablePresets] = useState<TablePresetOption[]>([]);
  const [pipelinePresets, setPipelinePresets] = useState<PipelinePresetOption[]>([]);
  const [paymentPresets, setPaymentPresets] = useState<PaymentPresetOption[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [selectedTablePresetIds, setSelectedTablePresetIds] = useState<string[]>([]);
  const [selectedPipelinePresetIds, setSelectedPipelinePresetIds] = useState<string[]>([]);
  const [selectedPaymentPresetId, setSelectedPaymentPresetId] = useState("");

  const TEAM_ROLES = [
    { value: "pm",             label: "Project Manager" },
    { value: "lead_architect", label: "Lead Architect" },
    { value: "design_support", label: "Design Support" },
    { value: "drafting",       label: "Drafting" },
    { value: "coordination",   label: "Coordination" },
    { value: "team_member",    label: "Team Member" },
    { value: "site_engineer",  label: "Site Engineer" },
  ];

  useEffect(() => {
    if (open && !customersLoaded) {
      fetch("/api/customers")
        .then(r => r.json())
        .then(d => { setCustomers(d.customers ?? []); setCustomersLoaded(true); })
        .catch(() => setCustomersLoaded(true));
    }
    if (open && !usersLoaded) {
      fetch("/api/users")
        .then(r => r.json())
        .then(d => { setAllUsers(d.users ?? []); setUsersLoaded(true); })
        .catch(() => setUsersLoaded(true));
    }
    if (open && !presetsLoaded) {
      Promise.all([
        fetch("/api/table-presets").then(r => r.json()).catch(() => ({ presets: [] })),
        fetch("/api/pipeline-templates").then(r => r.json()).catch(() => ({ templates: [] })),
        fetch("/api/payment-presets").then(r => r.json()).catch(() => []),
      ]).then(([tableData, pipelineData, paymentData]) => {
        const tables = tableData.presets ?? [];
        const pipelines = pipelineData.templates ?? [];
        const payments = Array.isArray(paymentData) ? paymentData : [];
        setTablePresets(tables);
        setPipelinePresets(pipelines);
        setPaymentPresets(payments);
        setSelectedTablePresetIds(tables.filter((p: TablePresetOption) => p.name === "Drawing Register" || p.table_owner_role === "team_member").map((p: TablePresetOption) => p.id));
        setSelectedPipelinePresetIds(pipelines.filter((p: PipelinePresetOption) => p.name === "Standard Architectural Lifecycle").map((p: PipelinePresetOption) => p.id));
        setPresetsLoaded(true);
      }).catch(() => setPresetsLoaded(true));
    }
  }, [open, customersLoaded, usersLoaded, presetsLoaded]);

  function addTeamEntry() {
    if (!addUserId) return;
    const u = allUsers.find(u => u.id === addUserId);
    if (!u) return;
    if (teamEntries.find(e => e.user_id === addUserId)) return;
    setTeamEntries(prev => [...prev, { user_id: addUserId, role_on_project: addRole, name: u.full_name }]);
    setAddUserId("");
  }

  function removeTeamEntry(userId: string) { setTeamEntries(prev => prev.filter(e => e.user_id !== userId)); }

  function set(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTablePreset(id: string) {
    setSelectedTablePresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function togglePipelinePreset(id: string) {
    setSelectedPipelinePresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Project name is required");
      nameRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);

    // Create new customer first if needed
    let customerId: string | null = null;
    if (customerMode === "existing" && selectedCustomerId) {
      customerId = selectedCustomerId;
    } else if (customerMode === "new" && newCustomer.name.trim()) {
      const cr = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCustomer),
      });
      const cd = await cr.json();
      if (!cr.ok) { setError(cd.error ?? "Failed to create customer"); setLoading(false); return; }
      customerId = cd.id;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      scope: form.scope,
      table_preset_ids: selectedTablePresetIds,
      pipeline_template_ids: selectedPipelinePresetIds,
      payment_preset_id: selectedPaymentPresetId || null,
    };
    if (customerId)                   payload.customer_id = customerId;
    if (form.project_type)            payload.project_type = form.project_type;
    if (form.start_date)              payload.start_date = form.start_date;
    if (form.expected_end_date)       payload.expected_end_date = form.expected_end_date;
    if (form.estimated_work_hours)    payload.estimated_work_hours = Number(form.estimated_work_hours);
    if (form.estimated_duration_days) payload.estimated_duration_days = Number(form.estimated_duration_days);
    if (form.budget_total)            payload.budget_total = Number(form.budget_total);
    if (form.design_budget)           payload.design_budget = Number(form.design_budget);
    if (form.execution_budget)        payload.execution_budget = Number(form.execution_budget);
    if (form.site_location)           payload.site_location = form.site_location.trim();
    if (form.whatsapp_group_url)      payload.whatsapp_group_url = form.whatsapp_group_url.trim();
    if (form.site_lat)                payload.site_lat = Number(form.site_lat);
    if (form.site_lng)                payload.site_lng = Number(form.site_lng);
    if (form.site_geofence_radius_m)  payload.site_geofence_radius_m = Number(form.site_geofence_radius_m);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create project");
        return;
      }
      const projectId = data.project.id;
      // Assign team members in parallel
      if (teamEntries.length > 0) {
        await Promise.all(teamEntries.map(e =>
          fetch(`/api/projects/${projectId}/assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: e.user_id, role_on_project: e.role_on_project }),
          })
        ));
      }
      setOpen(false);
      router.refresh();
      router.push(`/projects/${projectId}`);
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          background: "var(--color-ink)",
          color: "#FBF8F2",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Project
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(27,26,23,0.5)",
            backdropFilter: "blur(4px)",
            padding: 24,
          }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            className="modal-mobile-full"
            style={{
              background: "var(--color-paper-light)",
              borderRadius: 22,
              padding: "32px",
              width: "100%",
              maxWidth: 560,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 32px 80px -20px rgba(27,26,23,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 28,
              }}
            >
              <h2
                className="font-serif"
                style={{ fontSize: 32, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}
              >
                New Project
              </h2>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--bg-2)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-tan)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Project Name *</label>
                <input
                  ref={nameRef}
                  style={inputStyle}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Sharma Villa"
                  required
                />
              </div>

              {/* Type + Stage row */}
              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select
                    style={{ ...inputStyle, appearance: "none" }}
                    value={form.project_type}
                    onChange={(e) => set("project_type", e.target.value)}
                  >
                    <option value="">— Select type —</option>
                    {PROJECT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Budget (₹)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.budget_total}
                    onChange={(e) => set("budget_total", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Wing budgets — a wing's milestone percentages apply to its own
                  amount; blank falls back to the total budget. */}
              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Design Budget (₹)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.design_budget}
                    onChange={(e) => set("design_budget", e.target.value)}
                    placeholder="Defaults to total"
                  />
                </div>
                {form.scope !== "design_only" && (
                  <div>
                    <label style={labelStyle}>Execution Budget (₹)</label>
                    <input
                      style={inputStyle}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.execution_budget}
                      onChange={(e) => set("execution_budget", e.target.value)}
                      placeholder="Defaults to total"
                    />
                  </div>
                )}
              </div>

              {/* A warning, not a block. */}
              {form.budget_total && (form.design_budget || form.execution_budget) &&
                Math.abs(
                  (Number(form.design_budget) || 0) + (Number(form.execution_budget) || 0)
                  - Number(form.budget_total),
                ) > 0.01 && (
                <div style={{ fontSize: 12, color: "var(--color-rust)" }}>
                  Design + Execution ({((Number(form.design_budget) || 0) + (Number(form.execution_budget) || 0)).toLocaleString("en-IN")})
                  does not match the total budget ({Number(form.budget_total).toLocaleString("en-IN")}).
                </div>
              )}

              {/* Scope */}
              <div>
                <label style={labelStyle}>Scope</label>
                <select
                  style={{ ...inputStyle, appearance: "none" }}
                  value={form.scope}
                  onChange={(e) => set("scope", e.target.value as "design_only" | "design_and_execution")}
                >
                  <option value="design_and_execution">Design + Execution</option>
                  <option value="design_only">Design only</option>
                </select>
              </div>

              {/* Dates */}
              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input
                    style={inputStyle}
                    type="date"
                    value={form.start_date}
                    onChange={(e) => set("start_date", e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expected End Date</label>
                  <input
                    style={inputStyle}
                    type="date"
                    value={form.expected_end_date}
                    onChange={(e) => set("expected_end_date", e.target.value)}
                  />
                </div>
              </div>

              {/* Hours + Duration */}
              <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Est. Work Hours</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={form.estimated_work_hours}
                    onChange={(e) => set("estimated_work_hours", e.target.value)}
                    placeholder="450"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Est. Duration (days)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={form.estimated_duration_days}
                    onChange={(e) => set("estimated_duration_days", e.target.value)}
                    placeholder="180"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Site Location</label>
                <input
                  style={inputStyle}
                  value={form.site_location}
                  onChange={(e) => set("site_location", e.target.value)}
                  placeholder="e.g. Whitefield, Bangalore"
                />
              </div>

              {/* WhatsApp + GPS (B1) */}
              <div>
                <label style={labelStyle}>WhatsApp Group Link</label>
                <input
                  style={inputStyle}
                  type="url"
                  value={form.whatsapp_group_url}
                  onChange={(e) => set("whatsapp_group_url", e.target.value)}
                  placeholder="https://chat.whatsapp.com/…"
                />
              </div>
              <GeofencePicker
                lat={form.site_lat}
                lng={form.site_lng}
                radius={form.site_geofence_radius_m}
                onChange={({ lat, lng, radius }) =>
                  setForm((f) => ({ ...f, site_lat: lat, site_lng: lng, site_geofence_radius_m: radius }))
                }
                labelStyle={labelStyle}
                inputStyle={inputStyle}
              />

              {/* Customer */}
              <div style={{ padding: "16px", borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Customer (optional)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["none", "existing", "new"] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCustomerMode(m)}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                        background: customerMode === m ? "var(--color-ink)" : "var(--color-line)",
                        color: customerMode === m ? "#FBF8F2" : "var(--color-tan)",
                      }}
                    >
                      {m === "none" ? "Skip" : m === "existing" ? "Existing" : "New"}
                    </button>
                  ))}
                </div>
                {customerMode === "existing" && (
                  <select
                    value={selectedCustomerId}
                    onChange={e => setSelectedCustomerId(e.target.value)}
                    style={{ ...inputStyle, appearance: "none" as const, fontSize: 13 }}
                  >
                    <option value="">— Select customer —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
                    ))}
                  </select>
                )}
                {customerMode === "new" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input
                      style={{ ...inputStyle, fontSize: 13 }}
                      value={newCustomer.name}
                      onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                      placeholder="Customer name *"
                    />
                    <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input
                        style={{ ...inputStyle, fontSize: 13 }}
                        value={newCustomer.phone}
                        onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone"
                      />
                      <input
                        style={{ ...inputStyle, fontSize: 13 }}
                        type="email"
                        value={newCustomer.email}
                        onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}
                        placeholder="Email"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Team assignment */}
              <div style={{ padding: "16px", borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Team (optional)</div>
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
              </div>

              {/* Preset options */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: 14,
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Presets
                </div>
                {[
                  {
                    title: "Table Presets",
                    body: [
                      ...tablePresets.filter(p => p.table_owner_role === "team_member"),
                      ...tablePresets.filter(p => p.table_owner_role === "site_engineer"),
                      ...tablePresets.filter(p => p.table_owner_role !== "team_member" && p.table_owner_role !== "site_engineer"),
                    ],
                  },
                ].map(group => (
                  <div key={group.title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{group.title}</div>
                    {group.body.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--color-tan)" }}>No table presets available.</div>
                    ) : group.body.map(p => (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, padding: "8px 10px", borderRadius: 10, background: "var(--color-paper-light)" }}>
                        <input type="checkbox" checked={selectedTablePresetIds.includes(p.id)} onChange={() => toggleTablePreset(p.id)} style={{ width: 16, height: 16, accentColor: "var(--color-forest)" }} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: "var(--color-tan)" }}>{p.table_owner_role.replace(/_/g, " ")} · {p.table_preset_columns?.length ?? 0} columns</div>
                        </div>
                      </label>
                    ))}
                  </div>
                ))}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Progress Timeline Presets</div>
                  {pipelinePresets.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--color-tan)" }}>No pipeline presets available.</div>
                  ) : pipelinePresets.map(p => (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, padding: "8px 10px", borderRadius: 10, background: "var(--color-paper-light)" }}>
                      <input type="checkbox" checked={selectedPipelinePresetIds.includes(p.id)} onChange={() => togglePipelinePreset(p.id)} style={{ width: 16, height: 16, accentColor: "var(--color-forest)" }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>{p.checkpoint_template_items?.length ?? 0} milestones</div>
                      </div>
                    </label>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payment Milestone Preset</div>
                  <select value={selectedPaymentPresetId} onChange={e => setSelectedPaymentPresetId(e.target.value)} style={{ ...inputStyle, fontSize: 13, appearance: "none" as const }}>
                    <option value="">Custom / no payment preset</option>
                    {paymentPresets.map(p => (
                      <option key={p.id} value={p.id}>{p.name} · {p.payment_milestone_preset_items?.length ?? 0} milestones</option>
                    ))}
                  </select>
                  {selectedPaymentPresetId && !form.budget_total && (
                    <div style={{ fontSize: 12, color: "var(--color-rust)" }}>Set a budget to calculate payment milestone amounts.</div>
                  )}
                </div>
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "#C5543B18",
                    color: "var(--color-rust)",
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 12,
                    border: "1px solid var(--color-line)",
                    background: "transparent",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 12,
                    background: loading ? "var(--color-tan)" : "var(--color-ink)",
                    color: "#FBF8F2",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Creating…" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
