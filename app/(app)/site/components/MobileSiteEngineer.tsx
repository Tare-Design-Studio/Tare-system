"use client";

import { useState } from "react";
import { Chip, Avatar } from "@/components/atoms";
import { useClientNow } from "@/lib/useClientNow";
import { Project, Engineer, MaterialPlan, Expense, CheckIn, SiteVisit, CATEGORY_LABELS, CATEGORY_TONE, formatDate, formatTime, formatMinutes } from "./shared";
import { UpdateComposer } from "@/components/updates/UpdateComposer";
import { UpdatesFeed, type FeedUpdate } from "@/components/updates/UpdatesFeed";
import SiteVisitsCard from "./SiteVisitsCard";
import { signOut } from "@/app/(auth)/actions";

// ── Icons ──────────────────────────────────────────────────────────────
type IconName = "check" | "pin" | "plus" | "dashboard" | "list" | "trending" | "credit" | "feed" | "info" | "bridge";
const ICON_PATHS: Record<IconName, string> = {
  check: "M20 6 9 17l-5-5",
  pin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  plus: "M12 5v14M5 12h14",
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  trending: "M23 6l-9.5 9.5-5-5L1 18 M23 6v6 M23 6h-6",
  credit: "M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM3 8h18v2H3V8zm0 8v-4h18v4H3z",
  feed: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01",
  bridge: "M2 12h20 M4 12V9a8 8 0 0 1 16 0v3 M7 12v6 M12 12v6 M17 12v6 M2 18h20",
};
const Icon = ({ name, size = 24, stroke = 1.5, color = "currentColor" }: { name: IconName; size?: number; stroke?: number; color?: string }) => {
  const p = ICON_PATHS[name] ?? "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={p}/>
    </svg>
  );
};

// ── Tab Bar ────────────────────────────────────────────────────────────
const TabBar = ({ active, onTab }: { active: string; onTab: (id: string) => void }) => {
  const tabs = [
    { id: "today",     label: "Today",     icon: "dashboard" as IconName },
    { id: "details",   label: "Details",   icon: "info"      as IconName },
    { id: "updates",   label: "Updates",   icon: "feed"      as IconName },
    { id: "materials", label: "Materials", icon: "list"      as IconName },
    { id: "progress",  label: "Progress",  icon: "trending"  as IconName },
    { id: "expenses",  label: "Expenses",  icon: "credit"    as IconName },
    { id: "bridge",    label: "Bridge",    icon: "bridge"    as IconName },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, height: 96, zIndex: 40,
      paddingBottom: 28,
      background: "rgba(251,248,242,.85)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderTop: "1px solid rgba(30,28,24,.06)",
      display: "flex",
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onTab(t.id)} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          color: active === t.id ? "var(--color-forest)" : "var(--color-tan)",
          border: "none", background: "none", padding: 0, cursor: "pointer"
        }}>
          <Icon name={t.icon} size={22} stroke={active === t.id ? 2 : 1.7} />
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: .1 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

// ── Screens ────────────────────────────────────────────────────────────

function SiteCheckInScreen({ project, checkIns, onCheckin, nowMs, siteVisits }: { project: Project; checkIns: CheckIn[]; onCheckin: () => void; nowMs: number; siteVisits: SiteVisit[]; }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date(nowMs);
  const isToday = (iso: string) => {
    const d = new Date(iso);
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  };
  const todayCheckins = checkIns.filter(ci => isToday(ci.checked_in_at));

  // Open session = my latest check-in on this project that has no check-out yet.
  const openSession = checkIns.find(ci => ci.checked_out_at == null) ?? null;
  const isOnSite = !!openSession;

  // Today's worked minutes on this site: closed sessions today + the open one so far.
  const clientNow = useClientNow();
  const nowDate = clientNow ?? today;
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

  const todayDateStr = today.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <div style={{ paddingTop: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: .6 }}>{todayDateStr}</div>
        <div className="font-serif" style={{ fontSize: 32, letterSpacing: -.8, lineHeight: 1.1, marginTop: 4 }}>Site Check-In</div>
      </div>

      <div style={{ padding: "20px", borderRadius: 20, background: isOnSite ? "var(--color-forest)" : "var(--color-paper-light)", color: isOnSite ? "#F3EFE7" : "var(--color-ink)", boxShadow: "0 1px 0 rgba(255,255,255,.15) inset, 0 16px 40px -20px rgba(30,28,24,.2)", marginBottom: 20, transition: "all .3s" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: isOnSite ? "rgba(243,239,231,.65)" : "var(--color-tan)", textTransform: "uppercase", letterSpacing: .8, marginBottom: 7 }}>Project</div>
          <div style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${isOnSite ? "rgba(255,255,255,.2)" : "var(--color-line)"}`, background: isOnSite ? "rgba(255,255,255,.1)" : "var(--bg-2)", fontSize: 14, fontWeight: 500 }}>
            {project.name}
          </div>
        </div>

        {isOnSite && openSession && (
          <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 12 }}>
            <div>
              <div style={{ opacity: .65, textTransform: "uppercase", letterSpacing: .6, fontSize: 10 }}>Since</div>
              <div className="font-mono" style={{ fontWeight: 600, marginTop: 2 }}>{formatTime(openSession.checked_in_at)}</div>
            </div>
            <div>
              <div style={{ opacity: .65, textTransform: "uppercase", letterSpacing: .6, fontSize: 10 }}>Today on site</div>
              <div className="font-mono" style={{ fontWeight: 600, marginTop: 2 }}>{formatMinutes(todayMinutes)}</div>
            </div>
          </div>
        )}

        <button onClick={() => submit(isOnSite ? "check_out" : "check_in")} disabled={checking} style={{ width: "100%", padding: "14px", borderRadius: 14, background: isOnSite ? "var(--color-rust)" : "var(--color-ink)", color: "#F3EFE7", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, border: "none", opacity: checking ? .6 : 1 }}>
          <Icon name="pin" size={16} color="#F3EFE7" stroke={2} /> {checking ? "Getting GPS…" : isOnSite ? "Check Out" : "Check In"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#C5543B18", border: "1px solid var(--color-rust)", fontSize: 13, color: "var(--color-rust)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div className="font-serif" style={{ fontSize: 20, letterSpacing: -.3 }}>Today&apos;s Check-ins</div>
      </div>
      <div style={{ background: "var(--color-paper-light)", borderRadius: 16, padding: "14px", boxShadow: "0 1px 0 #FFF inset", display: "flex", flexDirection: "column", gap: 10 }}>
        {todayCheckins.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", fontStyle: "italic", textAlign: "center", padding: "12px 0" }}>No check-ins today.</div>
        ) : (
          todayCheckins.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 10, alignItems: "center" }}>
              <Avatar initials={(c.engineer?.full_name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2)} tone="amber" size={32} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{c.engineer?.full_name ?? "Unknown"}</div>
                <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 1 }}>
                  {formatTime(c.checked_in_at)}{c.checked_out_at ? ` – ${formatTime(c.checked_out_at)}` : " · on site"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>{c.checked_out_at ? formatMinutes(c.duration_minutes) : "—"}</div>
                {c.within_geofence ? (
                  <div style={{ fontSize: 10, color: "var(--color-forest)", marginTop: 2 }}>GPS ✓</div>
                ) : (
                  <div style={{ fontSize: 10, color: "var(--color-amber)", marginTop: 2 }}>Out of range</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <SiteVisitsCard siteVisits={siteVisits} />
      </div>
    </div>
  );
}

function MaterialsScreen({ project, plans, onLogged }: { project: Project; plans: MaterialPlan[]; onLogged: () => void; }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const overrunCount = plans.filter(m => m.pct_used > 115).length;
  const onPlanCount = plans.filter(m => m.pct_used <= 115).length;

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <div style={{ paddingTop: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: .6 }}>{project.name}</div>
        <div className="font-serif" style={{ fontSize: 32, letterSpacing: -.8, lineHeight: 1.1, marginTop: 4 }}>Materials</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {[
          { label: "On Plan", value: onPlanCount, tone: "forest" },
          { label: "Over 15%", value: overrunCount, tone: "rust" },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "12px 14px", borderRadius: 14, background: "var(--color-paper-light)", boxShadow: "0 1px 0 #FFF inset" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: .8, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.tone === "forest" ? "var(--color-forest)" : "var(--color-rust)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "#C5543B18", border: "1px solid var(--color-rust)", fontSize: 13, color: "var(--color-rust)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {plans.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--color-tan)", fontSize: 14, background: "var(--color-paper-light)", borderRadius: 16 }}>
          No material plan for this project.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {plans.map((item, i) => {
            const p = Math.min(item.pct_used, 130);
            const isOver = item.pct_used > 115;
            return (
              <div key={i} style={{ padding: "14px 16px", borderRadius: 16, background: "var(--color-paper-light)", boxShadow: "0 1px 0 #FFF inset", border: isOver ? "1px solid #F0C9BE" : "1px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.material_name}</div>
                  </div>
                  {isOver && <Chip tone="rust" size="sm" label={`+${Math.round(item.pct_used - 100)}% over`} />}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: "var(--color-tan)" }}>Used: <b style={{ color: "var(--color-ink)" }}>{item.consumed} {item.unit}</b></span>
                  <span style={{ color: "var(--color-tan)" }}>Plan: <b>{item.planned_quantity} {item.unit}</b></span>
                </div>
                <div style={{ height: 6, background: "var(--bg-2)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ width: p + "%", height: "100%", background: isOver ? "var(--color-rust)" : "var(--color-forest)", borderRadius: 99 }} />
                </div>
                {editing === item.id ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <input
                      autoFocus
                      value={inputVal}
                      onChange={e => setInputVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveConsumption(item.id, item.material_name, item.unit);
                        if (e.key === "Escape") { setEditing(null); setInputVal(""); }
                      }}
                      placeholder={`Qty (${item.unit})`}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-forest)", outline: "none", fontSize: 13, fontFamily: "var(--font-mono)" }}
                    />
                    <button
                      onClick={() => saveConsumption(item.id, item.material_name, item.unit)}
                      disabled={saving}
                      style={{ padding: "8px 16px", borderRadius: 8, background: "var(--color-forest)", color: "#FFF", fontSize: 13, fontWeight: 600, border: "none" }}
                    >✓</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditing(item.id); setInputVal(""); }} style={{ width: "100%", padding: "8px", borderRadius: 8, background: "var(--bg-2)", color: "var(--color-ink)", fontWeight: 500, fontSize: 12, border: "none" }}>
                    + Log Consumption
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressScreen({ project }: { project: Project }) {
  const checkpoints = [...project.project_checkpoints].sort((a, b) => a.sequence_order - b.sequence_order);
  const done = checkpoints.filter(c => c.completed_at).length;
  const pct = checkpoints.length ? Math.round((done / checkpoints.length) * 100) : 0;

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <div style={{ paddingTop: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: .6 }}>{project.name}</div>
        <div className="font-serif" style={{ fontSize: 32, letterSpacing: -.8, lineHeight: 1.1, marginTop: 4 }}>Progress</div>
      </div>

      <div style={{ padding: "14px 16px", borderRadius: 16, background: "var(--color-paper-light)", boxShadow: "0 1px 0 #FFF inset", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
          <span style={{ color: "var(--color-tan)" }}>Checkpoints</span>
          <span className="font-mono" style={{ fontWeight: 600 }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: "var(--bg-2)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", background: "var(--color-forest)", borderRadius: 99, transition: "width .3s" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {checkpoints.map((cp, i) => {
          const isDone = !!cp.completed_at;
          const isActive = !isDone && checkpoints.slice(0, i).every(c => c.completed_at);

          return (
            <div key={cp.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 14, background: isActive ? "rgba(45,106,79,.06)" : "var(--color-paper-light)", boxShadow: "0 1px 0 #FFF inset" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: isDone ? "var(--color-forest)" : "transparent", border: `2px solid ${isDone || isActive ? "var(--color-forest)" : "var(--color-line)"}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isDone && <Icon name="check" size={12} color="#FFF" stroke={3} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: isActive ? 600 : 500, color: isDone || isActive ? "var(--color-ink)" : "var(--color-tan)" }}>{cp.name}</div>
                <div className="font-mono" style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>
                  {isDone ? `Done ${formatDate(cp.completed_at)}` : `Due ${formatDate(cp.due_date)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpensesScreen({ project, expenses, onAdded, nowMs }: { project: Project; expenses: Expense[]; onAdded: () => void; nowMs: number; }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: "labour", description: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const current = expenses.filter(e => !("is_corrected" in e && e.is_corrected));
  const weekTotal = current.reduce((s, e) => s + Number(e.amount), 0);
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const todayTotal = current.filter(e => e.spent_on === todayIso).reduce((s, e) => s + Number(e.amount), 0);

  const addExpense = async () => {
    const amt = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amt) || amt <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: form.category, description: form.description, amount: amt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save expense");
      setForm({ category: "labour", description: "", amount: "" });
      setShowForm(false);
      onAdded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <div style={{ paddingTop: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: .6 }}>{project.name}</div>
        <div className="font-serif" style={{ fontSize: 32, letterSpacing: -.8, lineHeight: 1.1, marginTop: 4 }}>Expenses</div>
      </div>

      <div style={{ padding: "16px", borderRadius: 18, background: "linear-gradient(135deg, var(--color-slate-2, #1E2530), var(--color-slate, #2A3340))", color: "#F3EFE7", marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "rgba(243,239,231,.55)", marginBottom: 6 }}>Logged Total</div>
        <div className="font-serif" style={{ fontSize: 36, letterSpacing: -1, lineHeight: 1 }}>₹{weekTotal.toLocaleString()}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontSize: 10, color: "rgba(243,239,231,.55)", textTransform: "uppercase", letterSpacing: .8 }}>Today</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>₹{todayTotal.toLocaleString()}</div>
          </div>
          <div style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontSize: 10, color: "rgba(243,239,231,.55)", textTransform: "uppercase", letterSpacing: .8 }}>Entries</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{current.length}</div>
          </div>
        </div>
      </div>

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1.5px dashed var(--color-line)", color: "var(--color-tan)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20, background: "transparent" }}>
          <Icon name="plus" size={15} stroke={2} /> Add Expense
        </button>
      ) : (
        <div style={{ padding: "16px", borderRadius: 16, background: "var(--color-paper-light)", boxShadow: "0 1px 0 #FFF inset", marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>New Expense</div>
          <select value={form.category} onChange={e => set("category", e.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--bg-2)", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Description" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--bg-2)", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <input value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="Amount (₹)" type="number" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--bg-2)", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addExpense} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 12, background: "var(--color-ink)", color: "#FFF", fontWeight: 600, fontSize: 13, border: "none" }}>Save</button>
            <button onClick={() => setShowForm(false)} style={{ padding: "11px 16px", borderRadius: 12, background: "var(--bg-2)", fontSize: 13, border: "none" }}>Cancel</button>
          </div>
          {error && <div style={{ color: "var(--color-rust)", fontSize: 12 }}>{error}</div>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div className="font-serif" style={{ fontSize: 20, letterSpacing: -.3 }}>Recent</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {expenses.slice(0, 20).map((e, i) => {
          const tone = CATEGORY_TONE[e.category] ?? "amber";
          return (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 14px", borderRadius: 14, background: "var(--color-paper-light)", boxShadow: "0 1px 0 #FFF inset" }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <Chip tone={tone} size="sm" label={CATEGORY_LABELS[e.category] ?? e.category} />
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--color-tan)" }}>{formatDate(e.spent_on)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{e.description ?? "—"}</div>
              </div>
              <div className="font-mono" style={{ fontWeight: 700, fontSize: 15, alignSelf: "center" }}>₹{Number(e.amount).toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpdatesScreen({ project, updates, onPosted, engineerId }: { project: Project; updates: FeedUpdate[]; onPosted: () => void; engineerId: string; }) {
  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <div style={{ paddingTop: 8, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: .6 }}>{project.name}</div>
        <div className="font-serif" style={{ fontSize: 32, letterSpacing: -.8, lineHeight: 1.1, marginTop: 4 }}>Updates</div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <UpdateComposer projectId={project.id} onPosted={onPosted} compact />
      </div>

      <UpdatesFeed updates={updates} projectId={project.id} currentUserId={engineerId} onChanged={onPosted} emptyText="No updates yet — post the first one above." />
    </div>
  );
}

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

export function MobileSiteEngineer({
  engineer, project, projects, projectId, tab, plans, expenses, checkIns, updates, nowMs, siteVisits, switchProject, setTab, refresh
}: Props) {
  if (projects.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", color: "var(--color-tan)" }}>
        <div>
          <div className="font-serif" style={{ fontSize: 28, marginBottom: 12 }}>No active sites</div>
          <div style={{ fontSize: 14 }}>You have no active projects assigned.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      paddingBottom: 100,
      background: "radial-gradient(900px 500px at 80% -5%, #D8E2DC 0%, transparent 60%), radial-gradient(600px 400px at -10% 100%, #E8DFCC 0%, transparent 55%), var(--bg)"
    }}>
      {/* Top project selector for mobile */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(243,239,231,.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--color-line)", padding: "12px 20px", display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <select value={projectId} onChange={e => switchProject(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontSize: 14, fontWeight: 600, outline: "none", fontFamily: "inherit", color: "var(--color-ink)", width: "100%", textAlign: "center", appearance: "none" }}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <Icon name="list" size={16} color="var(--color-tan)" />
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-paper-light)", border: "1px solid var(--color-line)", borderRadius: 10, padding: 9, cursor: "pointer", color: "var(--color-tan)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
      </div>

      {project && (
        <div style={{ animation: "fadeIn 0.3s ease-out" }}>
          {tab === "today"     && <SiteCheckInScreen project={project} checkIns={checkIns} onCheckin={refresh} nowMs={nowMs} siteVisits={siteVisits} />}
          {tab === "updates"   && <UpdatesScreen     project={project} updates={updates}   onPosted={refresh} engineerId={engineer.id} />}
          {tab === "materials" && <MaterialsScreen   project={project} plans={plans}       onLogged={refresh} />}
          {tab === "progress"  && <ProgressScreen    project={project} />}
          {tab === "expenses"  && <ExpensesScreen    project={project} expenses={expenses} onAdded={refresh} nowMs={nowMs} />}
        </div>
      )}

      <TabBar active={tab} onTab={setTab} />
    </div>
  );
}
