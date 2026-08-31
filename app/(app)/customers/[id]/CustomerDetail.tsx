"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PaymentsCard from "@/components/payments/PaymentsCard";
import PortalContentCard from "./PortalContentCard";
import { ConfirmPopover, Icon } from "@/components/atoms";

// ISO timestamp → value for <input type="datetime-local"> (local time, minute precision).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CARD: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const CATEGORIES = [
  { value: "meeting",    label: "Meeting"    },
  { value: "call",       label: "Call"       },
  { value: "quotation",  label: "Quotation"  },
  { value: "follow_up",  label: "Follow-up"  },
  { value: "site_visit", label: "Site Visit" },
  { value: "drawing",    label: "Drawing"    },
  { value: "other",      label: "Other"      },
];

const CATEGORY_COLOR: Record<string, string> = {
  meeting:    "var(--color-forest)",
  call:       "var(--color-teal)",
  quotation:  "var(--color-amber)",
  follow_up:  "var(--color-indigo)",
  site_visit: "var(--color-rust)",
  drawing:    "var(--color-mint)",
  other:      "var(--color-tan)",
};

const STATUS_COLOR: Record<string, string> = {
  active:    "var(--color-forest)",
  on_hold:   "var(--color-amber)",
  completed: "var(--color-mint)",
};

type Reminder = {
  id: string; remind_at: string; message: string | null;
  category: string; priority: string | null; is_done: boolean; done_at: string | null;
};

type Customer = {
  id: string; name: string; phone: string | null; email: string | null;
  address: string | null; created_at: string; created_from_enquiry_id: string | null;
  customer_portal_hash: string | null;
  customer_portal_enabled: boolean | null;
  enquiry_reminders: Reminder[];
};

type Project = { id: string; name: string; status: string; current_stage: string } | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtAmount(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const miniBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-line)",
  background: "transparent",
  fontSize: 11,
  cursor: "pointer",
};

export default function CustomerDetail({
  customer: initial, project, projects = [], paymentSchedule = [], paymentRecords = [],
  canManagePortal = false, members = [],
}: {
  customer: Customer;
  project: Project;
  projects?: { id: string; name: string; status: string; current_stage: string }[];
  paymentSchedule?: AnyRow[];
  paymentRecords?: AnyRow[];
  canManagePortal?: boolean;
  members?: { id: string; full_name: string }[];
}) {
  const [customer, setCustomer] = useState<Customer>(initial);
  const [portalHash, setPortalHash] = useState<string | null>(initial.customer_portal_hash);
  const [portalEnabled, setPortalEnabled] = useState<boolean>(initial.customer_portal_enabled === true);
  const [portalBusy, setPortalBusy] = useState(false);

  async function portalAction(action: "generate" | "revoke" | "regenerate") {
    if (action === "regenerate" && !confirm("Regenerate this customer's portal link? The old link will stop working.")) return;
    if (action === "revoke" && !confirm("Revoke portal access for this customer?")) return;
    setPortalBusy(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Request failed");
      }
      const data = await res.json();
      if (action === "revoke") {
        setPortalEnabled(false);
      } else {
        setPortalHash(data.hash ?? null);
        setPortalEnabled(true);
      }
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setPortalBusy(false);
    }
  }

  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (portalHash && portalEnabled) {
      setPortalUrl(`${window.location.origin}/c/customer/${portalHash}`);
    } else {
      setPortalUrl(null);
    }
  }, [portalHash, portalEnabled]);

  const totalFee = paymentSchedule.reduce((n: number, r: AnyRow) => n + (r.amount_due ?? 0), 0);
  const totalPaid = paymentSchedule.reduce((n: number, r: AnyRow) => n + (r.amount_received ?? 0), 0);
  const outstanding = totalFee - totalPaid;
  const [text, setText] = useState("");
  const [category, setCategory] = useState("follow_up");
  const [remindAt, setRemindAt] = useState("");
  const [showRemind, setShowRemind] = useState(false);
  const [busy, setBusy] = useState(false);

  const pending = customer.enquiry_reminders
    .filter((r) => !r.is_done)
    .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());

  const done = customer.enquiry_reminders
    .filter((r) => r.is_done)
    .sort((a, b) => new Date(b.remind_at).getTime() - new Date(a.remind_at).getTime());

  async function addReminder() {
    if (!text.trim() || !remindAt || busy) return;
    setBusy(true);
    const res = await fetch(`/api/customers/${customer.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text.trim(), category, remind_at: remindAt + ":00", priority: "normal" }),
    });
    if (res.ok) {
      const r: Reminder = await res.json();
      setCustomer((c) => ({ ...c, enquiry_reminders: [...c.enquiry_reminders, r] }));
      setText("");
      setRemindAt("");
      setShowRemind(false);
    }
    setBusy(false);
  }

  async function toggleDone(reminder: Reminder) {
    const res = await fetch(`/api/customers/${customer.id}/reminders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminder_id: reminder.id, is_done: !reminder.is_done }),
    });
    if (res.ok) {
      const updated: Reminder = await res.json();
      setCustomer((c) => ({
        ...c,
        enquiry_reminders: c.enquiry_reminders.map((r) => r.id === updated.id ? updated : r),
      }));
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState("");
  const [editCategory, setEditCategory] = useState("follow_up");
  const [editRemindAt, setEditRemindAt] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  function startEdit(r: Reminder) {
    setEditingId(r.id);
    setEditMsg(r.message ?? "");
    setEditCategory(r.category);
    setEditRemindAt(toLocalInput(r.remind_at));
  }

  async function saveEdit(reminder: Reminder) {
    if (!editRemindAt || editBusy) return;
    setEditBusy(true);
    const res = await fetch(`/api/customers/${customer.id}/reminders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reminder_id: reminder.id,
        message: editMsg.trim(),
        category: editCategory,
        remind_at: editRemindAt + ":00",
      }),
    });
    if (res.ok) {
      const updated: Reminder = await res.json();
      setCustomer((c) => ({
        ...c,
        enquiry_reminders: c.enquiry_reminders.map((r) => r.id === updated.id ? updated : r),
      }));
      setEditingId(null);
    }
    setEditBusy(false);
  }

  async function deleteReminder(reminder: Reminder) {
    const res = await fetch(`/api/customers/${customer.id}/reminders?reminder_id=${reminder.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCustomer((c) => ({
        ...c,
        enquiry_reminders: c.enquiry_reminders.filter((r) => r.id !== reminder.id),
      }));
      if (editingId === reminder.id) setEditingId(null);
    }
  }

  function ReminderRow({ r }: { r: Reminder }) {
    const isEditing = editingId === r.id;

    if (isEditing) {
      return (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: CATEGORY_COLOR[r.category] + "12", border: `1px solid ${CATEGORY_COLOR[r.category]}30` }}>
          <textarea
            value={editMsg}
            onChange={(e) => setEditMsg(e.target.value)}
            rows={2}
            placeholder="Reminder note…"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontSize: 13, color: "var(--color-ink)", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ padding: "7px 10px", borderRadius: 9, fontSize: 12, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", color: "var(--color-ink)", fontFamily: "inherit", cursor: "pointer" }}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input type="datetime-local" value={editRemindAt} onChange={(e) => setEditRemindAt(e.target.value)} style={{ padding: "7px 10px", borderRadius: 9, fontSize: 12, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", color: "var(--color-ink)", fontFamily: "inherit" }} />
            <button onClick={() => saveEdit(r)} disabled={!editRemindAt || editBusy} style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600, background: !editRemindAt ? "var(--color-line)" : "var(--color-forest)", color: "#FFF", border: "none", cursor: !editRemindAt ? "default" : "pointer" }}>
              {editBusy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditingId(null)} style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--color-tan)", border: "1px solid var(--color-line)", cursor: "pointer" }}>
              Cancel
            </button>
            <ConfirmPopover title="Delete reminder?" message="This can't be undone." confirmLabel="Delete" onConfirm={() => deleteReminder(r)}>
              {(open) => (
                <button onClick={open} aria-label="Delete reminder" style={{ marginLeft: "auto", padding: "7px 10px", borderRadius: 9, fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--color-rust)", border: "1px solid var(--color-rust)40", cursor: "pointer" }}>
                  Delete
                </button>
              )}
            </ConfirmPopover>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        display: "flex", gap: 12, alignItems: "flex-start",
        padding: "12px 14px", borderRadius: 12,
        background: r.is_done ? "var(--color-bg)" : CATEGORY_COLOR[r.category] + "12",
        border: r.is_done ? "none" : `1px solid ${CATEGORY_COLOR[r.category]}30`,
        opacity: r.is_done ? 0.55 : 1,
      }}>
        <button
          onClick={() => toggleDone(r)}
          style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
            border: "1.5px solid",
            borderColor: r.is_done ? "var(--color-forest)" : "var(--color-line)",
            background: r.is_done ? "var(--color-forest)" : "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {r.is_done && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: r.message ? 4 : 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
              background: CATEGORY_COLOR[r.category] ?? "var(--color-tan)", color: "#FFF",
            }}>
              {r.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-tan)" }}>{fmt(r.remind_at)}</span>
          </div>
          {r.message && (
            <div style={{ fontSize: 13, color: "var(--color-ink)", lineHeight: 1.5 }}>{r.message}</div>
          )}
        </div>
        <button
          onClick={() => startEdit(r)}
          aria-label="Edit reminder"
          title="Reschedule or edit"
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", color: "var(--color-tan)" }}
        >
          <Icon name="pencil" size={13} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Back */}
      <Link href="/customers" style={{
        display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20,
        fontSize: 13, color: "var(--color-tan)", textDecoration: "none",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
        </svg>
        Customers
      </Link>

      {/* Profile card */}
      <div style={{ ...CARD, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-forest)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Customer
            </div>
            <div style={{ fontSize: 28, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>
              {customer.name}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
              {customer.phone && (
                <a href={`tel:${customer.phone}`} style={{ fontSize: 13, color: "var(--color-ink)", textDecoration: "none" }}>
                  📞 {customer.phone}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} style={{ fontSize: 13, color: "var(--color-ink)", textDecoration: "none" }}>
                  ✉ {customer.email}
                </a>
              )}
            </div>
            {customer.address && (
              <div style={{ fontSize: 13, color: "var(--color-tan)", marginTop: 4 }}>{customer.address}</div>
            )}
            <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 8 }}>
              Customer since {fmtDate(customer.created_at)}
            </div>
          </div>
          {customer.created_from_enquiry_id && (
            <Link href={`/enquiries/${customer.created_from_enquiry_id}`} style={{
              fontSize: 11, padding: "6px 12px", borderRadius: 10,
              background: "rgba(30,28,24,.05)", color: "var(--color-tan)",
              textDecoration: "none", fontWeight: 600,
            }}>
              View Enquiry
            </Link>
          )}
        </div>

        {/* Financial summary — only when a project with milestones is linked */}
        {paymentSchedule.length > 0 && (
          <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 20 }}>
            {[
              { label: "Total Invoiced",  value: fmtAmount(totalFee),     color: "var(--color-ink)" },
              { label: "Paid to Date",    value: fmtAmount(totalPaid),    color: "var(--color-mint)" },
              { label: "Outstanding",     value: fmtAmount(outstanding),  color: outstanding > 0 ? "var(--color-amber)" : "var(--color-ink)" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--color-bg)" }}>
                <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600, color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* All linked projects */}
        {projects.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 8 }}>
              {projects.length === 1 ? "Linked Project" : `${projects.length} Linked Projects`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {projects.map((proj) => (
                <Link key={proj.id} href={`/projects/${proj.id}`} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", borderRadius: 14,
                  background: "var(--color-bg)", textDecoration: "none",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>{proj.name}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                      background: (STATUS_COLOR[proj.status] ?? "var(--color-tan)") + "18",
                      color: STATUS_COLOR[proj.status] ?? "var(--color-tan)",
                    }}>
                      {proj.status.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "capitalize" }}>
                      {proj.current_stage}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Customer Portal */}
        <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 14, background: "var(--color-bg)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Customer Portal</div>
            {portalEnabled && portalHash && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => portalAction("regenerate")} disabled={portalBusy} style={miniBtn}>Regenerate</button>
                <button onClick={() => portalAction("revoke")} disabled={portalBusy} style={miniBtn}>Revoke</button>
              </div>
            )}
          </div>
          {portalEnabled && portalUrl ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                readOnly
                value={portalUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{ flex: 1, fontSize: 11, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-paper-light)", fontFamily: "var(--font-mono)" }}
              />
              <button onClick={() => { if (portalUrl) navigator.clipboard.writeText(portalUrl); }} style={miniBtn}>Copy</button>
            </div>
          ) : (
            <button onClick={() => portalAction("generate")} disabled={portalBusy} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "#FBF8F2", fontSize: 12, fontWeight: 600, cursor: portalBusy ? "wait" : "pointer" }}>
              {portalBusy ? "Generating…" : "Generate Customer Portal Link"}
            </button>
          )}
        </div>
      </div>

      {/* Payments — only shown when a project is linked */}
      {project && (
        <div style={{ ...CARD, marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400, marginBottom: 16 }}>
            Payments
          </div>
          <PaymentsCard
            projectId={project.id}
            schedule={paymentSchedule}
            records={paymentRecords}
          />
        </div>
      )}

      {/* Client portal content — capability-gated; the API routes re-check. */}
      {canManagePortal && (
        <div style={{ marginBottom: 18 }}>
          <PortalContentCard
            customerId={customer.id}
            projects={projects.map(p => ({ id: p.id, name: p.name }))}
            members={members}
          />
        </div>
      )}

      {/* Reminders */}
      <div style={{ ...CARD, marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400, marginBottom: 16 }}>
          Reminders
          {pending.length > 0 && (
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 7px",
              borderRadius: 999, background: "var(--color-rust)", color: "#FFF",
            }}>
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 && done.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)" }}>No reminders yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((r) => <ReminderRow key={r.id} r={r} />)}
            {done.length > 0 && pending.length > 0 && (
              <div style={{ height: 1, background: "var(--color-line)", margin: "4px 0" }} />
            )}
            {done.map((r) => <ReminderRow key={r.id} r={r} />)}
          </div>
        )}
      </div>

      {/* Add reminder */}
      <div style={{ ...CARD }}>
        <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400, marginBottom: 16 }}>
          New Reminder
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Send revised quotation, Confirm site visit date…"
          rows={3}
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 12,
            border: "1px solid var(--color-line)", background: "var(--color-bg)",
            fontSize: 14, color: "var(--color-ink)", fontFamily: "inherit",
            resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 10, fontSize: 12,
              border: "1px solid var(--color-line)", background: "var(--color-bg)",
              color: "var(--color-ink)", fontFamily: "inherit", cursor: "pointer",
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 10, fontSize: 12,
              border: "1px solid var(--color-line)", background: "var(--color-bg)",
              color: "var(--color-ink)", fontFamily: "inherit",
            }}
          />

          <button
            onClick={addReminder}
            disabled={!text.trim() || !remindAt || busy}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: (!text.trim() || !remindAt) ? "var(--color-line)" : "var(--color-forest)",
              color: "#FFF", border: "none", cursor: (!text.trim() || !remindAt) ? "default" : "pointer",
            }}
          >
            {busy ? "Saving…" : "Set Reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
