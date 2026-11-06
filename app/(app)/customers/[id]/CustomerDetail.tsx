"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PaymentsCard from "@/components/payments/PaymentsCard";
import PaymentsBoard from "@/components/payments/PaymentsBoard";
import LinkProjectModal from "@/components/customers/LinkProjectModal";
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
  borderRadius: 28,
  padding: 24,
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--line-2)",
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

// The portal has no login, so a user agent is the only clue about who opened a
// link. It identifies a browser and platform, never a person — two people on
// the same phone model are indistinguishable here, and the UI says so.
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const platform =
    /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad" :
    /Android/i.test(ua)          ? "Android" :
    /Macintosh|Mac OS X/i.test(ua) ? "Mac" :
    /Windows/i.test(ua)          ? "Windows" :
    /Linux/i.test(ua)            ? "Linux" : "Unknown";
  const browser =
    /Edg\//i.test(ua)     ? "Edge" :
    /OPR\/|Opera/i.test(ua) ? "Opera" :
    /Chrome\//i.test(ua)  ? "Chrome" :
    /Firefox\//i.test(ua) ? "Firefox" :
    /Safari\//i.test(ua)  ? "Safari" : "Browser";
  return `${platform} · ${browser}`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// COUNT() is bigint, which PostgREST serialises as a string to avoid precision
// loss — so these arrive as strings, not numbers, and are coerced at the point
// of use rather than being mistyped here.
type PortalAccess = {
  view_count: number | string;
  distinct_ips: number | string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
};

type PortalView = {
  id: number;
  viewed_at: string;
  ip: string | null;
  user_agent: string | null;
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
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
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

const PORTAL_MUTED = "#FFFFFF";

const portalBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,.28)",
  background: "rgba(255,255,255,.08)",
  color: "#FFFFFF",
  fontSize: 11,
  cursor: "pointer",
};

export default function CustomerDetail({
  customer: initial, project, projects = [], paymentSchedule = [], paymentRecords = [],
  canManagePortal = false, members = [],
  portalAccess = null, portalViews = [],
}: {
  customer: Customer;
  project: Project;
  projects?: { id: string; name: string; status: string; current_stage: string; scope?: string }[];
  paymentSchedule?: AnyRow[];
  paymentRecords?: AnyRow[];
  canManagePortal?: boolean;
  portalAccess?: PortalAccess | null;
  portalViews?: PortalView[];
  members?: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer>(initial);
  const [showLink, setShowLink] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [showPortalContent, setShowPortalContent] = useState(false);
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
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-forest)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
          Customer
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "relative" }}>
            <div style={{ fontSize: 28, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>
              {customer.name}
            </div>
            {projects.length === 0 ? (
              <button onClick={() => setShowLink(true)} style={{
                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                border: "1px dashed var(--color-tan)", background: "transparent", color: "var(--color-tan)",
              }}>
                + Link
              </button>
            ) : projects.length === 1 ? (
              <Link href={`/projects/${projects[0].id}`} title={projects[0].name} style={{
                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, textDecoration: "none",
                background: "rgba(45,106,79,.12)", color: "var(--color-forest)",
              }}>
                Linked
              </Link>
            ) : (
              <>
                <button onClick={() => setShowProjects((v) => !v)} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, cursor: "pointer", border: "none",
                  background: "rgba(45,106,79,.12)", color: "var(--color-forest)",
                }}>
                  Linked · {projects.length}
                </button>
                {showProjects && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 20, minWidth: 240,
                    background: "var(--color-paper-light)", borderRadius: 12, padding: 6,
                    border: "1px solid var(--color-line)", boxShadow: "0 12px 30px -12px rgba(30,28,24,.3)",
                  }}>
                    {projects.map((proj) => (
                      <Link key={proj.id} href={`/projects/${proj.id}`} style={{
                        display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 10px",
                        borderRadius: 8, textDecoration: "none", fontSize: 13, color: "var(--color-ink)",
                      }}>
                        <span style={{ fontWeight: 600 }}>{proj.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[proj.status] ?? "var(--color-tan)" }}>
                          {proj.status.replace(/_/g, " ")}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            {customer.email && (
              <a href={`mailto:${customer.email}`} style={{ fontSize: 13, color: "var(--color-ink)", textDecoration: "none" }}>
                ✉ {customer.email}
              </a>
            )}
            <div style={{ fontSize: 11, color: "var(--color-tan)" }}>
              Customer since {fmtDate(customer.created_at)}
            </div>
            {customer.created_from_enquiry_id && (
              <Link href={`/enquiries/${customer.created_from_enquiry_id}`} style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 10, marginTop: 2,
                background: "rgba(30,28,24,.05)", color: "var(--color-tan)",
                textDecoration: "none", fontWeight: 600,
              }}>
                View Enquiry
              </Link>
            )}
          </div>
        </div>
        {(customer.phone || customer.address) && (
          <div style={{ marginTop: 8 }}>
            {customer.phone && (
              <a href={`tel:${customer.phone}`} style={{ fontSize: 13, color: "var(--color-ink)", textDecoration: "none" }}>
                📞 {customer.phone}
              </a>
            )}
            {customer.address && (
              <div style={{ fontSize: 13, color: "var(--color-tan)", marginTop: 4 }}>{customer.address}</div>
            )}
          </div>
        )}

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
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600, color: s.color, whiteSpace: "nowrap" }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Customer Portal — green mesh card (Planwise style). Text on it uses
            the light tokens below; the shared miniBtn/--color-tan read poorly. */}
        <div style={{
          marginTop: 18, padding: "18px 20px", borderRadius: 18, color: "#FFFFFF",
          background: "radial-gradient(60% 80% at 0 0,#3d8a65 0,#0000 70%),radial-gradient(50% 70% at 100% 100%,#8fe0b8 0,#0000 70%),#1e5b47",
          boxShadow: "0 20px 40px -24px rgba(15,53,39,.6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: PORTAL_MUTED, textTransform: "uppercase", letterSpacing: 1 }}>Client Portal</div>
            {portalEnabled && portalHash && canManagePortal && (
              <button onClick={() => setShowPreview(true)} style={{
                padding: "6px 14px", borderRadius: 999, cursor: "pointer",
                border: "1px solid rgba(255,255,255,.6)", background: "rgba(255,255,255,.14)",
                color: "#FFFFFF", fontSize: 12, fontWeight: 600,
              }}>
                Preview
              </button>
            )}
          </div>
          {portalEnabled && portalUrl ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                readOnly
                value={portalUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{ flex: "1 1 200px", minWidth: 0, fontSize: 11, padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,.22)", background: "rgba(10,19,13,.25)", color: "#FFFFFF", fontFamily: "var(--font-mono)" }}
              />
              <button onClick={() => { if (portalUrl) navigator.clipboard.writeText(portalUrl); }} style={portalBtn}>Copy</button>
              <button onClick={() => portalAction("regenerate")} disabled={portalBusy} style={portalBtn}>Regenerate</button>
              <button onClick={() => portalAction("revoke")} disabled={portalBusy} style={portalBtn}>Revoke</button>
            </div>
          ) : (
            <button onClick={() => portalAction("generate")} disabled={portalBusy} style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.6)", color: "#FFFFFF", fontSize: 12, fontWeight: 600, cursor: portalBusy ? "wait" : "pointer" }}>
              {portalBusy ? "Generating…" : "Generate Customer Portal Link"}
            </button>
          )}

          {/* Access history. Only meaningful once a link exists, and the
              counter is not reset by regenerate — history is of the customer,
              not of a particular hash. */}
          {portalEnabled && portalHash && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.18)" }}>
              {portalAccess && Number(portalAccess.view_count) > 0 ? (
                <>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
                    <div>
                      <span style={{ fontSize: 17, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{Number(portalAccess.view_count)}</span>
                      <span style={{ fontSize: 11, color: PORTAL_MUTED, marginLeft: 5 }}>
                        {Number(portalAccess.view_count) === 1 ? "open" : "opens"}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 17, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{Number(portalAccess.distinct_ips)}</span>
                      <span style={{ fontSize: 11, color: PORTAL_MUTED, marginLeft: 5 }}>
                        {Number(portalAccess.distinct_ips) === 1 ? "device/network" : "devices/networks"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: PORTAL_MUTED }}>
                      Last opened {fmtDateTime(portalAccess.last_viewed_at)}
                    </div>
                  </div>

                  {portalViews.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 11, color: PORTAL_MUTED, cursor: "pointer" }}>
                        Recent opens
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {portalViews.map((v) => (
                          <div key={v.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.14)" }}>
                            <span>{deviceLabel(v.user_agent)}</span>
                            <span style={{ color: PORTAL_MUTED, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                              {fmtDateTime(v.viewed_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: PORTAL_MUTED, marginTop: 8, lineHeight: 1.5 }}>
                        The portal link needs no login, so these show the device and
                        network a link was opened from — not a verified identity.
                        Anyone the link is forwarded to appears here too.
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: PORTAL_MUTED }}>
                  Not opened yet — no one has visited this link.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Payments — only shown when a project is linked */}
      {project && (
        <div style={{ ...CARD, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
              Payments
            </div>
            {paymentSchedule.length > 0 && (
              <button onClick={() => setShowBoard(true)} style={miniBtn}>Show all</button>
            )}
          </div>
          <PaymentsCard
            layout="rail"
            projectId={project.id}
            schedule={paymentSchedule}
            records={paymentRecords}
            scope={projects.find(p => p.id === project.id)?.scope === "design_only"
              ? "design_only" : "design_and_execution"}
          />
          {showBoard && (
            <PaymentsBoard
              projectId={project.id}
              canReorder
              schedule={paymentSchedule}
              scope={projects.find(p => p.id === project.id)?.scope === "design_only"
                ? "design_only" : "design_and_execution"}
              onClose={() => setShowBoard(false)}
            />
          )}
        </div>
      )}

      {/* Client portal content — capability-gated; the API routes re-check. */}
      {canManagePortal && (
        <div style={{ marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setShowPortalContent((v) => !v)}
            aria-expanded={showPortalContent}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "4px 4px",
              background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--color-ink)",
              fontFamily: "inherit",
            }}
          >
            Make changes to client portal
            <span style={{ flex: 1, height: 1, background: "var(--color-line)" }} />
            <span style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "#1e5b47", color: "#FFFFFF",
              transform: showPortalContent ? "rotate(180deg)" : "none", transition: "transform .2s",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>
              </svg>
            </span>
          </button>
          {showPortalContent && (
            <PortalContentCard
              customerId={customer.id}
              projects={projects.map(p => ({ id: p.id, name: p.name }))}
              members={members}
            />
          )}
        </div>
      )}

      {/* Reminders */}
      <div style={{ ...CARD, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
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
          <button onClick={() => setShowRemind(true)} aria-label="New reminder" title="New reminder" style={{
            width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "var(--color-forest)", color: "#FFF", fontSize: 18, lineHeight: 1,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>+</button>
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

      {/* New reminder — opened from the + on the Reminders card */}
      {showRemind && (
      <div
        onClick={(e) => e.target === e.currentTarget && setShowRemind(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(27,26,23,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}
      >
      <div className="modal-mobile-full" style={{ ...CARD, width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
            New Reminder
          </div>
          <button onClick={() => setShowRemind(false)} aria-label="Close" style={{
            background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", fontSize: 18, padding: 4,
          }}>✕</button>
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
      )}

      {showLink && (
        <LinkProjectModal
          customerId={customer.id}
          onClose={() => setShowLink(false)}
          onLinked={() => { setShowLink(false); router.refresh(); }}
        />
      )}

      {/* Portal preview: the real portal page in an iframe (?preview=1 skips the
          name gate and the open log for capability holders — see 127), beside
          the same visibility controls as Client Portal Content. Every change
          reloads the frame. */}
      {showPreview && portalHash && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000, background: "rgba(27,26,23,0.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "stretch", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            background: "var(--color-paper)", borderRadius: 28, width: "100%", maxWidth: 1280,
            display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20 }}>Client portal preview</span>
              <span style={{ fontSize: 11, color: "var(--color-tan)" }}>Changes on the left apply to the live portal.</span>
              <button onClick={() => setShowPreview(false)} aria-label="Close" style={{
                marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", fontSize: 18, padding: 4,
              }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", overflow: "auto" }}>
              <div style={{ flex: "1 1 360px", maxWidth: 480, minWidth: 0, overflowY: "auto", padding: 16, borderRight: "1px solid var(--color-line)" }}>
                <PortalContentCard
                  customerId={customer.id}
                  projects={projects.map(p => ({ id: p.id, name: p.name }))}
                  members={members}
                  onChange={() => setPreviewKey((k) => k + 1)}
                />
              </div>
              <iframe
                key={previewKey}
                src={`/c/customer/${portalHash}?preview=1`}
                title="Client portal preview"
                style={{ flex: "2 1 420px", minHeight: 560, border: "none", background: "#F3EFE7" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
