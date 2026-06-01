"use client";

import { useState } from "react";
import { Chip, Avatar } from "@/components/atoms";
import { useClientNow } from "@/lib/useClientNow";
import { Project, Engineer, MaterialPlan, Expense, CheckIn, SiteVisit, CATEGORY_LABELS, CATEGORY_TONE, formatDate, formatTime, formatMinutes } from "./shared";
import { UpdateComposer } from "@/components/updates/UpdateComposer";
import { UpdatesFeed, type FeedUpdate } from "@/components/updates/UpdatesFeed";
import SiteVisitsCard from "./SiteVisitsCard";

function TodayTab({ project, checkIns, onCheckin, nowMs, siteVisits }: { project: Project; checkIns: CheckIn[]; onCheckin: () => void; nowMs: number; siteVisits: SiteVisit[]; }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkpoints = project.project_checkpoints;
  const doneCount = checkpoints.filter(c => c.completed_at).length;

  // `today` is the server clock (passed as nowMs) so server/client render match.
  const today = new Date(nowMs);
  const clientNow = useClientNow();
  const nowDate = clientNow ?? today;
  const todayCheckins = checkIns.filter(ci => {
    const d = new Date(ci.checked_in_at);
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });

  // Open session = my latest check-in on this project with no check-out yet.
  const openSession = checkIns.find(ci => ci.checked_out_at == null) ?? null;
  const isOnSite = !!openSession;

  const todayMinutes = todayCheckins.reduce((sum, ci) => {
    if (ci.duration_minutes != null) return sum + ci.duration_minutes;
    if (ci.checked_out_at == null) {
      return sum + Math.max(0, Math.floor((nowDate.getTime() - new Date(ci.checked_in_at).getTime()) / 60000));
    }
    return sum;
  }, 0);

  const submit = async (action: "check_in" | "check_out") => {
    setChecking(true);
    setError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10_000 })
      );
      const res = await fetch(`/api/projects/${project.id}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(json.error ?? `${action === "check_in" ? "Check-in" : "Check-out"} failed`);
      onCheckin();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not get GPS location. Enable location access and retry.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div style={{
        padding: "28px 32px", borderRadius: 22, marginBottom: 24,
        background: isOnSite
          ? "linear-gradient(135deg, var(--color-forest) 0%, var(--color-teal) 100%)"
          : "var(--color-paper-light)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid rgba(30,28,24,.04)",
        color: isOnSite ? "#F3EFE7" : "var(--color-ink)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, opacity: isOnSite ? .7 : 1, color: isOnSite ? "#F3EFE7" : "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Today · {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
            </div>
            <div className="font-serif" style={{ fontSize: 36, letterSpacing: -.5, marginBottom: 6 }}>
              {isOnSite ? "You're on site" : "Confirm your presence"}
            </div>
            <div style={{ fontSize: 13, opacity: .75, marginBottom: isOnSite ? 0 : 20 }}>
              {project.name}{project.site_location ? ` · ${project.site_location}` : ""}
            </div>
            {isOnSite && openSession && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <div style={{ padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,.2)", fontSize: 12 }}>
                  Since {formatTime(openSession.checked_in_at)}
                </div>
                <div style={{ padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,.2)", fontSize: 12 }}>
                  {formatMinutes(todayMinutes)} on site today
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => submit(isOnSite ? "check_out" : "check_in")}
            disabled={checking}
            style={{
              padding: "14px 28px", borderRadius: 14, background: isOnSite ? "var(--color-rust)" : "var(--color-ink)", color: "#F3EFE7",
              fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
              flexShrink: 0, opacity: checking ? .6 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            {checking ? "Getting GPS…" : isOnSite ? "Check Out" : "Check In"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#C5543B18", border: "1px solid var(--color-rust)", fontSize: 13, color: "var(--color-rust)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      <SiteVisitsCard siteVisits={siteVisits} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Checkpoints Done", value: `${doneCount}/${checkpoints.length}`, sub: "project total", color: "var(--color-forest)" },
          { label: "Today on Site", value: formatMinutes(todayMinutes), sub: `${todayCheckins.length} check-in${todayCheckins.length === 1 ? "" : "s"}`, color: "var(--color-teal)" },
          { label: "Site Location", value: project.site_lat ? "Configured" : "Not set", sub: project.site_geofence_radius_m ? `${project.site_geofence_radius_m}m radius` : "ask owner to set", color: project.site_lat ? "var(--color-forest)" : "var(--color-tan)" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "18px 20px", borderRadius: 18, background: "var(--color-paper-light)", boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)" }}>
            <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{s.label}</div>
            <div className="font-mono" style={{ fontSize: 26, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--color-paper-light)", borderRadius: 20, boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)", padding: "20px 24px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recent Check-Ins</div>
        {checkIns.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", fontStyle: "italic" }}>No check-ins yet for this project.</div>
        ) : (
          checkIns.slice(0, 6).map((ci, i) => (
            <div key={ci.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < Math.min(checkIns.length, 6) - 1 ? "1px solid var(--color-line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: ci.within_geofence ? "var(--color-forest)" : "var(--color-amber)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{project.name}</div>
                  <div className="font-mono" style={{ fontSize: 11, color: "var(--color-tan)" }}>
                    {formatDate(ci.checked_in_at)} · {formatTime(ci.checked_in_at)}{ci.checked_out_at ? ` – ${formatTime(ci.checked_out_at)}` : " · on site"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {ci.checked_out_at && <span className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>{formatMinutes(ci.duration_minutes)}</span>}
                <Chip label={ci.within_geofence ? "GPS ✓" : "Out of range"} tone={ci.within_geofence ? "mint" : "amber"} size="sm" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MaterialsTab({ project, plans, onLogged }: { project: Project; plans: MaterialPlan[]; onLogged: () => void; }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overrun = plans.filter(m => m.pct_used > 115);

  const saveConsumption = async (planId: string, planName: string, unit: string) => {
    const qty = parseFloat(inputVal);
    if (isNaN(qty) || qty <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_plan_id: planId, material_name: planName, unit, quantity_used: qty }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to log consumption");
      onLogged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setSaving(false);
      setEditing(null);
      setInputVal("");
    }
  };

  return (
    <div>
      {overrun.length > 0 && (
        <div style={{ padding: "14px 18px", borderRadius: 14, marginBottom: 20, background: "rgba(197,84,59,.08)", border: "1px solid var(--color-rust)", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-rust)" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
          <span style={{ color: "var(--color-rust)", fontWeight: 600 }}>
            {overrun.length} material{overrun.length > 1 ? "s" : ""} exceeded 15% threshold — {overrun.map(m => m.material_name).join(", ")}
          </span>
        </div>
      )}

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#C5543B18", border: "1px solid var(--color-rust)", fontSize: 13, color: "var(--color-rust)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {plans.length === 0 ? (
        <div style={{ padding: "40px 24px", background: "var(--color-paper-light)", borderRadius: 20, textAlign: "center", color: "var(--color-tan)", fontSize: 14 }}>
          No material plan for this project. The owner or team member will create one.
        </div>
      ) : (
        <div style={{ background: "var(--color-paper-light)", borderRadius: 20, boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 80px 80px 100px 80px 80px", padding: "12px 20px", borderBottom: "1px solid var(--color-line)", fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>
            {["Material", "Unit", "Planned", "Used", "Usage", "%", ""].map((h, i) => (
              <div key={i} style={{ textAlign: i >= 2 && i <= 5 ? "right" : i === 6 ? "center" : "left" }}>{h}</div>
            ))}
          </div>

          {plans.map((m, i) => {
            const pct = Math.min(m.pct_used, 130);
            const isOver = m.pct_used > 115;
            const isNear = m.pct_used > 85 && !isOver;
            const barColor = isOver ? "var(--color-rust)" : isNear ? "var(--color-amber)" : "var(--color-forest)";

            return (
              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 80px 80px 100px 80px 80px", padding: "14px 20px", borderBottom: i < plans.length - 1 ? "1px solid var(--color-line)" : "none", background: isOver ? "rgba(197,84,59,.04)" : "transparent", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.material_name}</div>
                  {isOver && <div style={{ fontSize: 11, color: "var(--color-rust)", marginTop: 2 }}>⚠ &gt;15% over plan</div>}
                </div>
                <div className="font-mono" style={{ fontSize: 12, color: "var(--color-tan)", textAlign: "right" }}>{m.unit}</div>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{Number(m.planned_quantity).toLocaleString()}</div>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: isOver ? "var(--color-rust)" : "var(--color-ink)", textAlign: "right" }}>{m.consumed.toLocaleString()}</div>
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ height: 6, background: "var(--color-line)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 99 }} />
                  </div>
                </div>
                <div className="font-mono" style={{ fontSize: 12, textAlign: "right", color: isOver ? "var(--color-rust)" : "var(--color-tan)" }}>
                  {Math.round(m.pct_used)}%
                </div>
                <div style={{ textAlign: "center" }}>
                  {editing === m.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        autoFocus
                        value={inputVal}
                        onChange={e => setInputVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveConsumption(m.id, m.material_name, m.unit);
                          if (e.key === "Escape") { setEditing(null); setInputVal(""); }
                        }}
                        placeholder="qty"
                        style={{ width: 52, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-forest)", outline: "none", fontSize: 12, fontFamily: "var(--font-mono)" }}
                      />
                      <button
                        onClick={() => saveConsumption(m.id, m.material_name, m.unit)}
                        disabled={saving}
                        style={{ padding: "4px 8px", borderRadius: 6, background: "var(--color-forest)", color: "#FFF", fontSize: 12, fontWeight: 600 }}
                      >✓</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditing(m.id); setInputVal(""); }}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-line)", fontSize: 12, fontWeight: 500, background: "var(--bg-2)" }}
                    >+ Log</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressTab({ project }: { project: Project }) {
  const checkpoints = [...project.project_checkpoints].sort((a, b) => a.sequence_order - b.sequence_order);
  const done = checkpoints.filter(c => c.completed_at).length;
  const pct = checkpoints.length ? Math.round((done / checkpoints.length) * 100) : 0;

  return (
    <div>
      <div style={{ padding: "20px 24px", borderRadius: 18, marginBottom: 24, background: "var(--color-paper-light)", boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Site Progress</div>
          <span className="font-mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--color-forest)" }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "var(--color-line)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-forest)", borderRadius: 99, transition: "width .4s" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 8 }}>{done} of {checkpoints.length} checkpoints completed</div>
      </div>

      <div style={{ background: "var(--color-paper-light)", borderRadius: 20, boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)", overflow: "hidden" }}>
        {checkpoints.map((cp, i) => {
          const isDone = !!cp.completed_at;
          const isActive = !isDone && checkpoints.slice(0, i).every(c => c.completed_at);
          const itemsDone = cp.checkpoint_items.filter(ci => ci.is_complete).length;
          const itemsTotal = cp.checkpoint_items.length;

          return (
            <div key={cp.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 16, padding: "18px 24px", alignItems: "center", borderBottom: i < checkpoints.length - 1 ? "1px solid var(--color-line)" : "none", background: isActive ? "rgba(45,106,79,.04)" : "transparent", position: "relative" }}>
              {i < checkpoints.length - 1 && (
                <div style={{ position: "absolute", left: 35, top: 46, width: 2, height: 18, background: isDone ? "var(--color-forest)" : "var(--color-line)", zIndex: 0 }} />
              )}
              <div style={{ zIndex: 1, display: "flex", justifyContent: "center" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: isDone ? "var(--color-forest)" : isActive ? "transparent" : "var(--bg-2)", border: isActive ? "3px solid var(--color-forest)" : `2px solid ${isDone ? "var(--color-forest)" : "var(--color-line)"}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isActive ? "0 0 0 6px rgba(45,106,79,.12)" : "none" }}>
                  {isDone && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: isActive ? 600 : isDone ? 500 : 400, color: isDone || isActive ? "var(--color-ink)" : "var(--color-tan)" }}>{cp.name}</div>
                <div className="font-mono" style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>
                  {isDone ? `Completed ${formatDate(cp.completed_at)}` : `Due ${formatDate(cp.due_date)}`}
                  {itemsTotal > 0 && ` · ${itemsDone}/${itemsTotal} items`}
                </div>
                {isActive && <div style={{ fontSize: 11, color: "var(--color-forest)", marginTop: 2 }}>In progress</div>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isDone && <Chip label="Done" tone="mint" size="sm" dot />}
                {isActive && <Chip label="Active" tone="forest" size="sm" dot />}
                {!isDone && !isActive && <Chip label="Upcoming" size="sm" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpensesTab({ project, plans, expenses, onAdded, nowMs }: { project: Project; plans: MaterialPlan[]; expenses: Expense[]; onAdded: () => void; nowMs: number; }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "labour", description: "", amount: "", linked_material_plan_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const current = expenses.filter(e => !("is_corrected" in e && e.is_corrected));
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const todayTotal = current.filter(e => e.spent_on === todayIso).reduce((s, e) => s + Number(e.amount), 0);
  const pendingTotal = current.filter(e => e.approval_status === "pending").reduce((s, e) => s + Number(e.amount), 0);

  const addExpense = async () => {
    const amt = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amt) || amt <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { category: form.category, description: form.description, amount: amt };
      if (form.category === "materials" && form.linked_material_plan_id) {
        payload.linked_material_plan_id = form.linked_material_plan_id;
      }
      const res = await fetch(`/api/projects/${project.id}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save expense");
      setForm({ category: "labour", description: "", amount: "", linked_material_plan_id: "" });
      setShowForm(false);
      onAdded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 16, marginBottom: 24, alignItems: "stretch" }}>
        {[
          { label: "Today", value: `₹${todayTotal.toLocaleString()}`, color: "var(--color-ink)" },
          { label: "Pending Approval", value: `₹${pendingTotal.toLocaleString()}`, color: "var(--color-amber)" },
          { label: "Entries", value: current.length, color: "var(--color-tan)" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "18px 20px", borderRadius: 18, background: "var(--color-paper-light)", boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)" }}>
            <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{s.label}</div>
            <div className="font-mono" style={{ fontSize: 24, fontWeight: 600, color: s.color }}>{s.value}</div>
          </div>
        ))}
        <button onClick={() => setShowForm(v => !v)} style={{ padding: "0 24px", borderRadius: 18, background: "var(--color-ink)", color: "#F3EFE7", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexShrink: 0, border: "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {showForm ? "Cancel" : "Add"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#C5543B18", border: "1px solid var(--color-rust)", fontSize: 13, color: "var(--color-rust)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div style={{ padding: "24px", borderRadius: 18, marginBottom: 20, background: "var(--color-paper-light)", border: "1px solid var(--color-line)", boxShadow: "var(--shadow-card)" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>New Expense</div>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 140px auto", gap: 12, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--bg-2)", fontSize: 13, outline: "none" }}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Description</label>
              <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Daily wage — 8 masons"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--bg-2)", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Amount (₹)</label>
              <input value={form.amount} onChange={e => set("amount", e.target.value)} type="number" placeholder="0"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--bg-2)", fontSize: 13, outline: "none", fontFamily: "var(--font-mono)" }} />
            </div>
            <button onClick={addExpense} disabled={saving}
              style={{ padding: "10px 20px", borderRadius: 10, background: "var(--color-forest)", color: "#FFF", fontSize: 13, fontWeight: 600, border: "none", opacity: saving ? .6 : 1 }}>
              Save
            </button>
          </div>
          {form.category === "materials" && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Link to material plan (optional)</label>
              <select
                value={form.linked_material_plan_id}
                onChange={(e) => set("linked_material_plan_id", e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--bg-2)", fontSize: 13, outline: "none" }}
              >
                <option value="">— no link —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.material_name} ({p.unit})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div style={{ background: "var(--color-paper-light)", borderRadius: 20, overflow: "hidden", boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)" }}>
        {expenses.length === 0 ? (
          <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--color-tan)", fontSize: 14 }}>
            No expenses logged yet.
          </div>
        ) : (
          expenses.slice(0, 30).map((e, i) => {
            const tone = CATEGORY_TONE[e.category] ?? "amber";
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px", borderBottom: i < expenses.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `rgba(var(--${tone}-rgb, 45,106,79),.1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: `var(--color-${tone})` }}>
                  {e.category.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.description ?? "—"}</div>
                  <div className="font-mono" style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>{formatDate(e.spent_on)}</div>
                </div>
                <Chip label={CATEGORY_LABELS[e.category] ?? e.category} tone={tone} size="sm" />
                <Chip
                  label={e.approval_status === "approved" ? "Approved" : e.approval_status === "rejected" ? "Rejected" : "Pending"}
                  tone={e.approval_status === "approved" ? "mint" : e.approval_status === "rejected" ? "rust" : "amber"}
                  size="sm"
                />
                <div className="font-mono" style={{ fontSize: 15, fontWeight: 600, minWidth: 80, textAlign: "right" }}>
                  ₹{Number(e.amount).toLocaleString()}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function UpdatesTab({ project, updates, onPosted, engineerId }: { project: Project; updates: FeedUpdate[]; onPosted: () => void; engineerId: string; }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <UpdateComposer projectId={project.id} onPosted={onPosted} />
      </div>
      <div style={{ background: "var(--color-paper-light)", borderRadius: 20, boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)", padding: "20px 24px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Project Updates</div>
        <UpdatesFeed updates={updates} projectId={project.id} currentUserId={engineerId} onChanged={onPosted} emptyText="No updates yet — post the first one above." />
      </div>
    </div>
  );
}

const TABS = [
  { id: "today",     label: "Today"     },
  { id: "details",   label: "Details"   },
  { id: "updates",   label: "Updates"   },
  { id: "materials", label: "Materials" },
  { id: "progress",  label: "Progress"  },
  { id: "expenses",  label: "Expenses"  },
  { id: "bridge",    label: "Bridge"    },
];

type Props = {
  engineer: Engineer;
  project: Project | undefined;
  projects: Project[];
  projectId: string;
  tab: string;
  plans: MaterialPlan[];
  expenses: Expense[];
  checkIns: CheckIn[];
  updates: FeedUpdate[];
  loading: boolean;
  nowMs: number;
  siteVisits: SiteVisit[];
  switchProject: (pid: string) => void;
  setTab: (tab: string) => void;
  refresh: () => void;
};

export function DesktopSiteEngineer({
  engineer, project, projects, projectId, tab, plans, expenses, checkIns, updates, loading, nowMs, siteVisits, switchProject, setTab, refresh
}: Props) {
  const avatarInitials = engineer.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  if (projects.length === 0) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(900px 500px at 80% -5%, #D8E2DC 0%, transparent 60%), radial-gradient(600px 400px at -10% 100%, #E8DFCC 0%, transparent 55%), var(--bg)"
      }}>
        <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center", color: "var(--color-tan)" }}>
          <div className="font-serif" style={{ fontSize: 32, marginBottom: 12 }}>No active sites</div>
          <div style={{ fontSize: 14 }}>You have no active projects assigned to you.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(900px 500px at 80% -5%, #D8E2DC 0%, transparent 60%), radial-gradient(600px 400px at -10% 100%, #E8DFCC 0%, transparent 55%), var(--bg)"
    }}>
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(243,239,231,.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--color-line)", marginBottom: 0 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar initials={avatarInitials} tone="teal" size={32} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{engineer.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Site Engineer</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Project</div>
              <select value={projectId} onChange={e => switchProject(e.target.value)}
                style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontSize: 13, fontWeight: 500, outline: "none", fontFamily: "inherit", color: "var(--color-ink)" }}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Chip label={project?.current_stage ? project.current_stage.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "Active"} tone="teal" dot />
            </div>
          </div>

          <div style={{ display: "flex", gap: 4, paddingBottom: 1 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 18px", borderRadius: "10px 10px 0 0", fontSize: 13, fontWeight: 500, background: tab === t.id ? "var(--color-paper-light)" : "transparent", color: tab === t.id ? "var(--color-ink)" : "var(--color-tan)", borderBottom: tab === t.id ? `2px solid var(--color-forest)` : "2px solid transparent", transition: "all .15s" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {project && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px 64px" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, color: "var(--color-tan)", letterSpacing: .6, textTransform: "uppercase", marginBottom: 6 }}>
              {project.site_location ?? "No location set"}
            </div>
            <h1 className="font-serif" style={{ margin: "0 0 4px", fontSize: 44, lineHeight: 1, fontWeight: 400, letterSpacing: -1 }}>
              {project.name}
            </h1>
          </div>

          {loading && (
            <div style={{ fontSize: 13, color: "var(--color-tan)", marginBottom: 16 }}>Loading…</div>
          )}

          {tab === "today"     && <TodayTab     project={project} checkIns={checkIns} onCheckin={refresh} nowMs={nowMs} siteVisits={siteVisits} />}
          {tab === "updates"   && <UpdatesTab   project={project} updates={updates}   onPosted={refresh} engineerId={engineer.id} />}
          {tab === "materials" && <MaterialsTab project={project} plans={plans}       onLogged={refresh} />}
          {tab === "progress"  && <ProgressTab  project={project} />}
          {tab === "expenses"  && <ExpensesTab  project={project} plans={plans} expenses={expenses} onAdded={refresh} nowMs={nowMs} />}
        </div>
      )}
    </div>
  );
}
