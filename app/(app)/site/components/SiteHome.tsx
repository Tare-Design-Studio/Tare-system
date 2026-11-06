"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClientNow } from "@/lib/useClientNow";
import { UpdateComposer } from "@/components/updates/UpdateComposer";
import { UpdatesFeed, type FeedUpdate } from "@/components/updates/UpdatesFeed";
import {
  Project, Engineer, MaterialPlan, Expense, CheckIn, SiteVisit,
  CATEGORY_LABELS, formatDate, formatTime, formatMinutes,
} from "./shared";
import s from "../site.module.css";

const CATEGORY_ICON: Record<string, string> = { materials: "🧱", labour: "👷", transport: "🚚", misc: "🧾" };

// Offered in the materials dropdown alongside this project's planned materials.
const COMMON_MATERIALS = ["Cement", "Sand", "Steel", "Bricks", "Blocks", "Aggregate", "Tiles", "Paint", "Plumbing items", "Electrical items", "Wood", "Hardware"];

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function sameDay(iso: string, d: Date) {
  const x = new Date(iso);
  return x.getDate() === d.getDate() && x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear();
}

// Site engineer expenses are recorded as approved — no sign-off step (130).
function StatusTag({ e }: { e: Expense }) {
  if (e.approval_status === "approved") return <span className={`${s.tag} ${s.tagOk}`}>Recorded</span>;
  if (e.approval_status === "rejected") return <span className={`${s.tag} ${s.tagNo}`}>Rejected</span>;
  return <span className={`${s.tag} ${s.tagWait}`}>Awaiting approval</span>;
}

function ExpenseRows({ expenses }: { expenses: Expense[] }) {
  if (expenses.length === 0) return <div className={s.muted}>Nothing recorded yet.</div>;
  return (
    <div>
      {expenses.map(e => (
        <div key={e.id} className={s.row}>
          <div className={s.rowMain}>
            <div className={s.rowTitle}>{e.description || CATEGORY_LABELS[e.category] || e.category}</div>
            <div className={s.rowMeta}>{CATEGORY_LABELS[e.category] ?? e.category} · {formatDate(e.spent_on)}</div>
          </div>
          <StatusTag e={e} />
          <div className={s.amount}>{inr(Number(e.amount))}</div>
        </div>
      ))}
    </div>
  );
}

// ── Check in / out ─────────────────────────────────────────────────────
function PresenceCard({ project, checkIns, nowMs, onDone }: { project: Project; checkIns: CheckIn[]; nowMs: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useClientNow() ?? new Date(nowMs);
  const today = new Date(nowMs);

  const open = checkIns.find(ci => ci.checked_out_at == null) ?? null;
  const minutes = checkIns.filter(ci => sameDay(ci.checked_in_at, today)).reduce((sum, ci) =>
    sum + (ci.duration_minutes ?? (ci.checked_out_at ? 0 : Math.max(0, Math.floor((now.getTime() - new Date(ci.checked_in_at).getTime()) / 60000)))), 0);

  const submit = async () => {
    const action = open ? "check_out" : "check_in";
    setBusy(true);
    setError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10_000 }));
      const res = await fetch(`/api/projects/${project.id}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(json.error ?? (open ? "Check-out failed" : "Check-in failed"));
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not get your location. Turn on location and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`${s.card} ${s.presence} ${open ? s.presenceOn : ""}`}>
        <div>
          <div className={s.cardTitle}>{open ? "You're on site" : "Not checked in"}</div>
          <div className={s.cardSub} style={{ marginBottom: 0 }}>
            {open ? `Since ${formatTime(open.checked_in_at)} · ${formatMinutes(minutes)} today` : minutes > 0 ? `${formatMinutes(minutes)} on site today` : "Tap when you reach the site"}
          </div>
        </div>
        <button className={`${s.bigBtn} ${open ? s.bigBtnOut : ""}`} onClick={submit} disabled={busy}>
          {busy ? "Getting location…" : open ? "Check out" : "Check in"}
        </button>
      </div>
      {error && <div className={s.notice}>{error}</div>}
    </>
  );
}

// ── Add expense ────────────────────────────────────────────────────────
function ExpenseForm({ project, plans, onSaved }: { project: Project; plans: MaterialPlan[]; onSaved: () => void }) {
  const [category, setCategory] = useState("materials");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Materials dropdown value: "plan:<id>", a common material name, or "other".
  const [material, setMaterial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = parseFloat(amount);
  const valid = !isNaN(amt) && amt > 0;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { category, amount: amt };
      const plan = material.startsWith("plan:") ? plans.find(p => `plan:${p.id}` === material) : undefined;
      const description = category !== "materials" || material === "other" || !material
        ? note.trim()
        : [plan?.material_name ?? material, note.trim()].filter(Boolean).join(" — ");
      if (description) payload.description = description;
      if (plan) payload.linked_material_plan_id = plan.id;
      const res = await fetch(`/api/projects/${project.id}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not save expense");
      setAmount("");
      setNote("");
      setMaterial("");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save expense");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${s.card} ${s.expCard}`}>
      <div className={s.expHead}>
        <div className={s.expHeadTop}>
          <span>Add expense</span>
          <span className={s.expProject}>{project.name}</span>
        </div>
        <label className={s.expAmount}>
          <span>₹</span>
          <input type="number" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount in rupees" />
        </label>
      </div>
      <div className={s.form}>
        <div className={s.tiles}>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <button key={v} type="button" className={`${s.tile} ${category === v ? s.tileOn : ""}`} onClick={() => setCategory(v)}>
              <span className={s.tileIcon}>{CATEGORY_ICON[v]}</span>{l}
            </button>
          ))}
        </div>
        {category === "materials" ? (
          <>
            <select className={s.field} value={material} onChange={e => setMaterial(e.target.value)} aria-label="Which material">
              <option value="">Which material?</option>
              {plans.length > 0 && (
                <optgroup label="This project's plan">
                  {plans.map(p => <option key={p.id} value={`plan:${p.id}`}>{p.material_name} ({p.unit})</option>)}
                </optgroup>
              )}
              <optgroup label="Common">
                {COMMON_MATERIALS.filter(m => !plans.some(p => p.material_name.toLowerCase() === m.toLowerCase()))
                  .map(m => <option key={m} value={m}>{m}</option>)}
              </optgroup>
              <option value="other">Other…</option>
            </select>
            {material && (
              <input className={s.field} placeholder={material === "other" ? "Which material?" : "Details (optional) — e.g. 20 bags"} value={note} onChange={e => setNote(e.target.value)} maxLength={400} />
            )}
          </>
        ) : (
          <input className={s.field} placeholder="What was it for? (optional)" value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
        )}
        <div className={s.hint}>{category === "materials" ? "✓ Recorded instantly — no approval needed" : "Sent to the office for approval"}</div>
        {error && <div className={s.notice}>{error}</div>}
        <button className={s.save} onClick={save} disabled={busy || !valid}>{busy ? "Saving…" : valid ? `Save ${inr(amt)}` : "Enter amount"}</button>
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────
function HomeTab({ engineer, project, checkIns, expenses, plans, siteVisits, nowMs, refresh, go }: {
  engineer: Engineer; project: Project; checkIns: CheckIn[]; expenses: Expense[]; plans: MaterialPlan[];
  siteVisits: SiteVisit[]; nowMs: number; refresh: () => void; go: (tab: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const today = new Date(nowMs);
  const firstName = engineer.name.split(" ")[0] ?? "";

  const checkpoints = [...project.project_checkpoints].sort((a, b) => a.sequence_order - b.sequence_order);
  const done = checkpoints.filter(c => c.completed_at).length;
  const pct = checkpoints.length ? Math.round((done / checkpoints.length) * 100) : 0;
  const next = checkpoints.find(c => !c.completed_at);

  const current = expenses.filter(e => !e.is_corrected);
  const todayIso = today.toISOString().slice(0, 10);
  const todaySpend = current.filter(e => e.spent_on === todayIso).reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className={s.wrap}>
      <div>
        <div className={s.dayLabel}>{today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</div>
        <h1 className={s.hello}>Hey, <em>{firstName}</em></h1>
        <div className={s.sub}>{project.name}{project.site_location ? ` · ${project.site_location}` : ""}</div>
      </div>

      <PresenceCard project={project} checkIns={checkIns} nowMs={nowMs} onDone={refresh} />

      <div className={s.actions}>
        <button className={`${s.action} ${s.actionPrimary}`} onClick={() => setAdding(v => !v)}>{adding ? "Close" : "₹ Add expense"}</button>
        <button className={s.action} onClick={() => go("updates")}>Post update</button>
      </div>

      {adding && <ExpenseForm project={project} plans={plans} onSaved={() => { setAdding(false); refresh(); }} />}

      <div className={s.grid}>
        <div className={s.card}>
          <div className={s.cardTitle}>Progress</div>
          <div className={s.cardSub}>{done} of {checkpoints.length} checkpoints done</div>
          <div className={s.big} style={{ color: "var(--color-forest)" }}>{pct}%</div>
          <div className={s.bar}><div className={s.barFill} style={{ width: `${pct}%` }} /></div>
          <div className={s.muted}>{next ? `Next: ${next.name} · due ${formatDate(next.due_date)}` : checkpoints.length ? "All checkpoints complete" : "No checkpoints yet"}</div>
        </div>

        <div className={s.card}>
          <div className={s.cardTitle}>Spent today</div>
          <div className={s.cardSub}>This project</div>
          <div className={s.big}>{inr(todaySpend)}</div>
          <div style={{ marginTop: 10 }}><ExpenseRows expenses={current.slice(0, 3)} /></div>
        </div>
      </div>

      {siteVisits.length > 0 && (
        <div className={s.card}>
          <div className={s.cardTitle}>Upcoming site visits</div>
          <div className={s.cardSub}>Scheduled by the owner</div>
          {siteVisits.map(v => (
            <div key={v.id} className={s.row}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>{v.customer_name ?? "Customer"}{v.project_names.length ? ` · ${v.project_names.join(", ")}` : ""}</div>
                {v.message && <div className={s.rowMeta}>{v.message}</div>}
              </div>
              <div className={s.rowMeta}>{formatDate(v.remind_at)} · {formatTime(v.remind_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpensesTab({ project, plans, expenses, refresh }: { project: Project; plans: MaterialPlan[]; expenses: Expense[]; refresh: () => void }) {
  return (
    <div className={s.wrap}>
      <ExpenseForm project={project} plans={plans} onSaved={refresh} />
      <div className={s.card}>
        <div className={s.cardTitle}>Recent expenses</div>
        <div className={s.cardSub}>Last 30 entries</div>
        <ExpenseRows expenses={expenses.slice(0, 30)} />
      </div>
    </div>
  );
}

function UpdatesTab({ project, updates, engineerId, refresh }: { project: Project; updates: FeedUpdate[]; engineerId: string; refresh: () => void }) {
  return (
    <div className={s.wrap}>
      <UpdateComposer projectId={project.id} onPosted={refresh} green />
      <div className={s.card}>
        <div className={s.cardTitle}>Updates</div>
        <div className={s.cardSub}>{project.name}</div>
        <UpdatesFeed updates={updates} projectId={project.id} currentUserId={engineerId} onChanged={refresh} emptyText="No updates yet — post the first one above." />
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────
type Props = {
  engineer: Engineer;
  project: Project | undefined;
  projects: Project[];
  tab: string;
  plans: MaterialPlan[];
  expenses: Expense[];
  checkIns: CheckIn[];
  updates: FeedUpdate[];
  nowMs: number;
  siteVisits: SiteVisit[];
  refresh: () => void;
};

export function SiteHome({ engineer, project, projects, tab, plans, expenses, checkIns, updates, nowMs, siteVisits, refresh }: Props) {
  const router = useRouter();

  if (projects.length === 0 || !project) {
    return (
      <div className={s.empty}>
        <div className={s.hello} style={{ fontSize: 32, marginBottom: 12 }}>No active sites</div>
        <div>You have no active projects assigned to you.</div>
      </div>
    );
  }

  const go = (t: string) => router.push(`/site?tab=${t}&project=${project.id}`);

  if (tab === "expenses") return <ExpensesTab project={project} plans={plans} expenses={expenses} refresh={refresh} />;
  if (tab === "updates") return <UpdatesTab project={project} updates={updates} engineerId={engineer.id} refresh={refresh} />;
  return <HomeTab engineer={engineer} project={project} checkIns={checkIns} expenses={expenses} plans={plans} siteVisits={siteVisits} nowMs={nowMs} refresh={refresh} go={go} />;
}
