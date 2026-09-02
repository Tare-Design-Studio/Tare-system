"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────

type Wing = "design" | "execution";
type Part = "a" | "b";

interface ScheduleRow {
  schedule_id: string;
  project_id: string;
  milestone_name: string;
  wing: Wing;
  part: Part;
  amount_due: number;
  amount_received: number;
  variance: number;
  due_date: string;
  sequence_order: number;
  notes: string | null;
  is_paid: boolean;
  triggered_at: string | null;
  deleted_at: string | null;
}

interface PaymentRecord {
  id: string;
  payment_schedule_id: string;
  amount_paid: number;
  paid_on: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
}

interface PaymentsCardProps {
  projectId: string;
  schedule: ScheduleRow[];
  records: PaymentRecord[];
  /** readonly: hides action buttons (used for client-facing summary) */
  readonly?: boolean;
  /** design_only projects have no execution wing — it is not rendered at all. */
  scope?: "design_only" | "design_and_execution";
}

const WING_LABEL: Record<Wing, string> = {
  design: "Design",
  execution: "Execution",
};

const PART_LABEL: Record<Part, string> = {
  a: "Part A",
  b: "Part B",
};

const PARTS: Part[] = ["a", "b"];

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtAmount(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

type PayStatus = "paid" | "partial" | "due" | "pending";

function payStatus(row: ScheduleRow): PayStatus {
  if (row.is_paid || (row.amount_due > 0 && row.amount_received >= row.amount_due)) return "paid";
  if (row.amount_received > 0) return "partial";
  if (row.triggered_at) return "due";
  return "pending";
}

const STATUS_CHIP: Record<PayStatus, { label: string; bg: string; color: string }> = {
  paid: { label: "Received", bg: "var(--color-forest)", color: "#FBF8F2" },
  partial: { label: "Partial", bg: "var(--color-amber)", color: "#1B1A17" },
  due: { label: "Due", bg: "var(--color-rust)", color: "#FBF8F2" },
  pending: { label: "Pending", bg: "var(--color-paper-light)", color: "var(--color-tan)" },
};

// ── Shared modal shell ────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(27,26,23,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div className="modal-mobile-full" style={{
        background: "var(--color-paper)", borderRadius: 22,
        padding: "28px 28px 24px", width: "100%", maxWidth: 420,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>{title}</span>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--color-tan)", fontSize: 18, lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 12,
  border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
  fontSize: 14, fontFamily: "inherit", color: "var(--color-ink)",
  outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--color-tan)",
  textTransform: "uppercase", letterSpacing: "0.08em",
  display: "block", marginBottom: 5,
};

// ── Add Milestone Modal ───────────────────────────────────────────────────

function AddMilestoneModal({ projectId, nextOrder, wing, part, afterOrder, onClose, onSuccess }: {
  projectId: string;
  nextOrder: number;
  wing: Wing;
  part: Part;
  /** Insert AFTER this sequence_order (0 = first in group). undefined = append. */
  afterOrder?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    milestone_name: "", amount_due: "", due_date: "", notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.milestone_name.trim() || !form.amount_due || !form.due_date) {
      setError("Name, amount, and due date are required"); return;
    }
    setLoading(true); setError(null);
    const res = await fetch(`/api/projects/${projectId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestone_name: form.milestone_name.trim(),
        amount_due: Number(form.amount_due),
        due_date: form.due_date,
        sequence_order: nextOrder,
        notes: form.notes.trim() || undefined,
        wing,
        part,
        ...(afterOrder !== undefined ? { after_order: afterOrder } : {}),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onSuccess();
  }

  return (
    <ModalShell
      title={afterOrder !== undefined ? "Insert Payment Milestone" : "Add Payment Milestone"}
      onClose={onClose}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Destination is fixed by where the user clicked; shown, not editable. */}
        <div style={{
          fontSize: 12, color: "var(--color-tan)", padding: "8px 12px",
          borderRadius: 10, background: "var(--color-paper-light)",
        }}>
          {WING_LABEL[wing]} · {PART_LABEL[part]}
          {afterOrder !== undefined && (
            <span> · inserted {afterOrder === 0 ? "at the top" : `after #${afterOrder}`}</span>
          )}
        </div>
        <div>
          <label style={labelStyle}>Milestone Name</label>
          <input style={inputStyle} placeholder="e.g. 30% on Design Approval"
            value={form.milestone_name} onChange={(e) => set("milestone_name", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount Due (₹)</label>
            <input style={inputStyle} type="number" min="1" step="0.01" placeholder="0"
              value={form.amount_due} onChange={(e) => set("amount_due", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input style={inputStyle} type="date"
              value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
            placeholder="Any notes about this milestone…"
            value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {error && <div style={{ fontSize: 13, color: "var(--color-rust)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "1px solid var(--color-line)",
            borderRadius: 12, padding: "9px 18px", cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button type="submit" disabled={loading} style={{
            background: "var(--color-forest)", color: "#FBF8F2", border: "none",
            borderRadius: 12, padding: "9px 18px", cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1,
          }}>{loading ? "Saving…" : "Add Milestone"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Edit Milestone Modal ──────────────────────────────────────────────────

function EditMilestoneModal({ projectId, row, allowExecution, onClose, onSuccess }: {
  projectId: string;
  row: ScheduleRow;
  /** false on design-only projects — the execution wing is not offered. */
  allowExecution: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    milestone_name: row.milestone_name,
    amount_due: String(row.amount_due),
    due_date: row.due_date,
    wing: row.wing,
    part: row.part,
    notes: row.notes ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await fetch(`/api/projects/${projectId}/payments/${row.schedule_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestone_name: form.milestone_name.trim(),
        amount_due: Number(form.amount_due),
        due_date: form.due_date,
        wing: form.wing,
        part: form.part,
        notes: form.notes.trim() || null,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onSuccess();
  }

  return (
    <ModalShell title="Edit Milestone" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Milestone Name</label>
          <input style={inputStyle}
            value={form.milestone_name} onChange={(e) => set("milestone_name", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount Due (₹)</label>
            <input style={inputStyle} type="number" min="1" step="0.01"
              value={form.amount_due} onChange={(e) => set("amount_due", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input style={inputStyle} type="date"
              value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Wing</label>
            <select style={inputStyle} value={form.wing}
              onChange={(e) => set("wing", e.target.value as Wing)}>
              <option value="design">Design</option>
              {/* Not offered on design-only projects; the API and a DB trigger
                  refuse it there too. */}
              {allowExecution && <option value="execution">Execution</option>}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Part</label>
            <select style={inputStyle} value={form.part}
              onChange={(e) => set("part", e.target.value as Part)}>
              <option value="a">Part A</option>
              <option value="b">Part B</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
            value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {error && <div style={{ fontSize: 13, color: "var(--color-rust)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "1px solid var(--color-line)",
            borderRadius: 12, padding: "9px 18px", cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button type="submit" disabled={loading} style={{
            background: "var(--color-forest)", color: "#FBF8F2", border: "none",
            borderRadius: 12, padding: "9px 18px", cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1,
          }}>{loading ? "Saving…" : "Save Changes"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Edit Record Modal ─────────────────────────────────────────────────────

function EditRecordModal({ projectId, scheduleId, record, onClose, onSuccess }: {
  projectId: string;
  scheduleId: string;
  record: PaymentRecord;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    amount_paid: String(record.amount_paid),
    paid_on: record.paid_on,
    method: (record.method ?? "") as "" | "bank" | "neft" | "upi" | "cheque" | "cash",
    reference: record.reference ?? "",
    notes: record.notes ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount_paid || !form.paid_on) {
      setError("Amount and date are required"); return;
    }
    setLoading(true); setError(null);
    const res = await fetch(
      `/api/projects/${projectId}/payments/${scheduleId}/records/${record.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_paid: Number(form.amount_paid),
          paid_on: form.paid_on,
          method: form.method || null,
          reference: form.reference.trim() || null,
          notes: form.notes.trim() || null,
        }),
      }
    );
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onSuccess();
  }

  return (
    <ModalShell title="Edit Payment Record" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount Paid (₹)</label>
            <input style={inputStyle} type="number" min="0.01" step="0.01"
              value={form.amount_paid} onChange={(e) => set("amount_paid", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input style={inputStyle} type="date"
              value={form.paid_on} onChange={(e) => set("paid_on", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Method</label>
            <select style={{ ...inputStyle, cursor: "pointer" }}
              value={form.method} onChange={(e) => set("method", e.target.value)}>
              <option value="">—</option>
              <option value="bank">Bank Transfer</option>
              <option value="neft">NEFT</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Reference</label>
            <input style={inputStyle} placeholder="UTR / cheque no."
              value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <input style={inputStyle}
            value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {error && <div style={{ fontSize: 13, color: "var(--color-rust)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "1px solid var(--color-line)",
            borderRadius: 12, padding: "9px 18px", cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button type="submit" disabled={loading} style={{
            background: "var(--color-forest)", color: "#FBF8F2", border: "none",
            borderRadius: 12, padding: "9px 18px", cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1,
          }}>{loading ? "Saving…" : "Save Changes"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────

function RecordPaymentModal({ projectId, row, existingRecords, onClose, onSuccess }: {
  projectId: string;
  row: ScheduleRow;
  existingRecords: PaymentRecord[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const remaining = Math.max(0, row.amount_due - row.amount_received);
  const [form, setForm] = useState({
    amount_paid: remaining > 0 ? String(remaining) : "",
    paid_on: new Date().toISOString().split("T")[0],
    method: "" as "" | "bank" | "neft" | "upi" | "cheque" | "cash",
    reference: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function deleteRecord(r: PaymentRecord) {
    if (!confirm(`Delete this payment of ${fmtAmount(r.amount_paid)}? This cannot be undone.`)) return;
    await fetch(
      `/api/projects/${projectId}/payments/${row.schedule_id}/records/${r.id}`,
      { method: "DELETE" }
    );
    onSuccess();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount_paid || !form.paid_on) {
      setError("Amount and date are required"); return;
    }
    setLoading(true); setError(null);
    const res = await fetch(`/api/projects/${projectId}/payments/${row.schedule_id}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_paid: Number(form.amount_paid),
        paid_on: form.paid_on,
        method: form.method || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    onSuccess();
  }

  if (editingRecord) {
    return (
      <EditRecordModal
        projectId={projectId}
        scheduleId={row.schedule_id}
        record={editingRecord}
        onClose={() => setEditingRecord(null)}
        onSuccess={() => { setEditingRecord(null); onSuccess(); }}
      />
    );
  }

  return (
    <ModalShell title={`Payments — ${row.milestone_name}`} onClose={onClose}>
      <div style={{
        background: "var(--color-paper-light)", borderRadius: 12,
        padding: "10px 14px", marginBottom: 14, fontSize: 13,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "var(--color-tan)" }}>Total Due</span>
          <span style={{ fontWeight: 600 }}>{fmtAmount(row.amount_due)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "var(--color-tan)" }}>Received</span>
          <span style={{ color: "var(--color-forest)", fontWeight: 600 }}>
            {fmtAmount(row.amount_received)}
          </span>
        </div>
        {remaining > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-tan)" }}>Remaining</span>
            <span style={{ color: "var(--color-rust)", fontWeight: 600 }}>{fmtAmount(remaining)}</span>
          </div>
        )}
        {/* Existing records — each row editable */}
        {existingRecords.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-line)" }}>
            <div style={{ fontSize: 11, color: "var(--color-tan)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Payment History
            </div>
            {existingRecords.map((r) => (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 0", borderBottom: "1px solid var(--color-line)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtAmount(r.amount_paid)}</div>
                  <div style={{ fontSize: 11, color: "var(--color-tan)" }}>
                    {fmtDate(r.paid_on)}
                    {r.method && ` · ${r.method}`}
                    {r.reference && ` · ${r.reference}`}
                  </div>
                  {r.notes && (
                    <div style={{ fontSize: 11, color: "var(--color-tan)", fontStyle: "italic" }}>{r.notes}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setEditingRecord(r)}
                    style={{
                      fontSize: 11, padding: "3px 8px", borderRadius: 7,
                      border: "1px solid var(--color-line)", background: "none",
                      cursor: "pointer", color: "var(--color-ink)",
                    }}
                  >Edit</button>
                  <button
                    type="button"
                    onClick={() => deleteRecord(r)}
                    style={{
                      fontSize: 11, padding: "3px 8px", borderRadius: 7,
                      border: "1px solid var(--color-rust)", background: "none",
                      cursor: "pointer", color: "var(--color-rust)",
                    }}
                  >Del</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Amount Paid (₹)</label>
            <input style={inputStyle} type="number" min="0.01" step="0.01"
              value={form.amount_paid} onChange={(e) => set("amount_paid", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input style={inputStyle} type="date"
              value={form.paid_on} onChange={(e) => set("paid_on", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Method</label>
            <select style={{ ...inputStyle, cursor: "pointer" }}
              value={form.method} onChange={(e) => set("method", e.target.value)}>
              <option value="">—</option>
              <option value="bank">Bank Transfer</option>
              <option value="neft">NEFT</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Reference</label>
            <input style={inputStyle} placeholder="UTR / cheque no."
              value={form.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <input style={inputStyle} placeholder="Any notes…"
            value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {error && <div style={{ fontSize: 13, color: "var(--color-rust)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "1px solid var(--color-line)",
            borderRadius: 12, padding: "9px 18px", cursor: "pointer", fontSize: 13,
          }}>Cancel</button>
          <button type="submit" disabled={loading} style={{
            background: "var(--color-forest)", color: "#FBF8F2", border: "none",
            borderRadius: 12, padding: "9px 18px", cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600, opacity: loading ? 0.6 : 1,
          }}>{loading ? "Saving…" : "Record Payment"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── PaymentsCard ──────────────────────────────────────────────────────────

// ── One milestone row ─────────────────────────────────────────────────────
// Extracted so the wing/part sections can each render their own list without
// duplicating the row markup.

function MilestoneRow({
  row, records, readonly, isFirst, isLast, moving,
  onEdit, onDelete, onRecord, onMove, onInsertAfter,
}: {
  row: ScheduleRow;
  records: PaymentRecord[];
  readonly: boolean;
  isFirst: boolean;
  isLast: boolean;
  moving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRecord: () => void;
  onMove: (delta: -1 | 1) => void;
  onInsertAfter: () => void;
}) {
  const status = payStatus(row);
  const chip = STATUS_CHIP[status];
  const pct = row.amount_due > 0
    ? Math.min(100, (row.amount_received / row.amount_due) * 100)
    : 0;
  const rowRecords = records;
  const canEdit = !row.is_paid && !row.deleted_at;

  return (
            <div key={row.schedule_id} style={{
              border: "1px solid var(--color-line)",
              borderRadius: 14, padding: "12px 14px",
              background: "var(--color-paper-light)",
            }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", marginBottom: 2 }}>
                    {row.sequence_order}. {row.milestone_name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-tan)" }}>
                    Due {fmtDate(row.due_date)}
                    {row.triggered_at && !row.is_paid && (
                      <span style={{ marginLeft: 8, color: "var(--color-rust)" }}>
                        · Milestone approved
                      </span>
                    )}
                  </div>
                  {row.notes && (
                    <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 2, fontStyle: "italic" }}>
                      {row.notes}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99,
                    background: chip.bg, color: chip.color,
                  }}>{chip.label}</span>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtAmount(row.amount_due)}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{
                height: 4, borderRadius: 2, background: "var(--color-line)",
                overflow: "hidden", marginBottom: 8,
              }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: status === "paid" ? "var(--color-forest)"
                    : status === "partial" ? "var(--color-amber)"
                      : "var(--color-line-2)",
                  transition: "width 0.3s",
                }} />
              </div>

              {/* Amount detail + actions */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "var(--color-tan)" }}>
                  {fmtAmount(row.amount_received)} received
                  {row.amount_received > 0 && row.amount_received < row.amount_due && (
                    <span style={{ marginLeft: 6, color: "var(--color-rust)" }}>
                      ({fmtAmount(row.amount_due - row.amount_received)} remaining)
                    </span>
                  )}
                  {rowRecords.length > 0 && (
                    <span style={{ marginLeft: 6 }}>· {rowRecords.length} payment{rowRecords.length > 1 ? "s" : ""}</span>
                  )}
                </div>
                {!readonly && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {/* Reorder within this Part. Disabled at the ends of the
                        group; a cross-wing move is done from Edit instead. */}
                    <button
                      type="button"
                      onClick={() => onMove(-1)}
                      disabled={isFirst || moving}
                      title="Move up"
                      style={{
                        fontSize: 11, padding: "4px 7px", borderRadius: 8,
                        border: "1px solid var(--color-line)", background: "none",
                        cursor: isFirst || moving ? "not-allowed" : "pointer",
                        color: "var(--color-tan)", opacity: isFirst || moving ? 0.4 : 1,
                      }}
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => onMove(1)}
                      disabled={isLast || moving}
                      title="Move down"
                      style={{
                        fontSize: 11, padding: "4px 7px", borderRadius: 8,
                        border: "1px solid var(--color-line)", background: "none",
                        cursor: isLast || moving ? "not-allowed" : "pointer",
                        color: "var(--color-tan)", opacity: isLast || moving ? 0.4 : 1,
                      }}
                    >↓</button>
                    <button
                      type="button"
                      onClick={onInsertAfter}
                      title="Insert a milestone below this one"
                      style={{
                        fontSize: 11, padding: "4px 8px", borderRadius: 8,
                        border: "1px solid var(--color-line)", background: "none",
                        cursor: "pointer", color: "var(--color-tan)",
                      }}
                    >+ Below</button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit()}
                          style={{
                            fontSize: 11, padding: "4px 10px", borderRadius: 8,
                            border: "1px solid var(--color-line)", background: "none",
                            cursor: "pointer", color: "var(--color-ink)",
                          }}
                        >Edit</button>
                        <button
                          type="button"
                          onClick={() => onDelete()}
                          style={{
                            fontSize: 11, padding: "4px 10px", borderRadius: 8,
                            border: "1px solid var(--color-rust)", background: "none",
                            cursor: "pointer", color: "var(--color-rust)",
                          }}
                        >Delete</button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => onRecord()}
                      style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 8,
                        border: "none",
                        background: row.is_paid ? "var(--color-paper-light)" : "var(--color-forest)",
                        color: row.is_paid ? "var(--color-tan)" : "#FBF8F2",
                        cursor: "pointer", fontWeight: 600,
                      }}
                    >{row.is_paid ? "View Payments" : "Record Payment"}</button>
                  </div>
                )}
              </div>
            </div>
  );
}

export default function PaymentsCard({
  projectId, schedule, records, readonly = false, scope = "design_and_execution",
}: PaymentsCardProps) {
  const router = useRouter();
  const [modal, setModal] = useState<
    | { type: "add"; wing: Wing; part: Part; afterOrder?: number }
    | { type: "edit"; row: ScheduleRow }
    | { type: "record"; row: ScheduleRow }
    | null
  >(null);
  const [moving, setMoving] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setModal(null);
    router.refresh();
  }, [router]);

  async function softDelete(row: ScheduleRow) {
    if (!confirm(`Delete milestone "${row.milestone_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/projects/${projectId}/payments/${row.schedule_id}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  }

  // Move a milestone one slot up or down inside its own (wing, part) group.
  // The whole renumber happens server-side in one transaction.
  async function move(row: ScheduleRow, delta: -1 | 1) {
    const group = rowsFor(row.wing, row.part);
    const idx = group.findIndex((r) => r.schedule_id === row.schedule_id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= group.length) return;

    setMoving(row.schedule_id);
    const res = await fetch(`/api/projects/${projectId}/payments/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_id: row.schedule_id,
        wing: row.wing,
        part: row.part,
        target_index: target,
      }),
    });
    setMoving(null);
    if (res.ok) router.refresh();
  }

  const recordsForRow = (scheduleId: string) =>
    records.filter((r) => r.payment_schedule_id === scheduleId);

  const rowsFor = (wing: Wing, part: Part) =>
    schedule
      .filter((r) => r.wing === wing && r.part === part)
      .sort((a, b) => a.sequence_order - b.sequence_order);

  // A design-only project has no execution wing at all. Existing execution rows
  // are kept in the database (nothing is deleted on a scope change) but are not
  // rendered while the project is design-only.
  const wings: Wing[] = scope === "design_only" ? ["design"] : ["design", "execution"];

  const totalDue = schedule.reduce((s, r) => s + r.amount_due, 0);
  const totalReceived = schedule.reduce((s, r) => s + r.amount_received, 0);

  const nextOrder = schedule.length > 0
    ? Math.max(...schedule.map((r) => r.sequence_order)) + 1
    : 1;

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "var(--color-tan)",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
    display: "flex", justifyContent: "space-between", alignItems: "center",
  };

  return (
    <div>
      {/* Summary bar */}
      {schedule.length > 0 && (
        <div style={{
          display: "flex", gap: 16, marginBottom: 14,
          padding: "10px 14px", borderRadius: 12,
          background: "var(--color-paper-light)",
          fontSize: 13,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--color-tan)", fontSize: 11, marginBottom: 2 }}>Total Due</div>
            <div style={{ fontWeight: 600 }}>{fmtAmount(totalDue)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--color-tan)", fontSize: 11, marginBottom: 2 }}>Received</div>
            <div style={{ fontWeight: 600, color: "var(--color-forest)" }}>{fmtAmount(totalReceived)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--color-tan)", fontSize: 11, marginBottom: 2 }}>Balance</div>
            <div style={{ fontWeight: 600, color: totalReceived < totalDue ? "var(--color-rust)" : "var(--color-forest)" }}>
              {fmtAmount(totalDue - totalReceived)}
            </div>
          </div>
        </div>
      )}

      {/* Milestone rows — grouped into wings, then Part A / Part B */}
      {schedule.length === 0 && readonly ? (
        <div style={{
          padding: "12px 16px", borderRadius: 12,
          border: "1px dashed var(--line-2)", color: "var(--color-tan)",
          fontSize: 13, textAlign: "center",
        }}>
          No payment milestones yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {wings.map((wing) => {
            const wingRows = schedule.filter((r) => r.wing === wing);
            const wingDue = wingRows.reduce((t, r) => t + r.amount_due, 0);
            const wingReceived = wingRows.reduce((t, r) => t + r.amount_received, 0);

            // A wing with nothing in it still shows on an editable card, so the
            // owner has somewhere to add the first milestone.
            if (wingRows.length === 0 && readonly) return null;

            return (
              <div key={wing}>
                {/* Wing heading */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  paddingBottom: 6, marginBottom: 10,
                  borderBottom: "1px solid var(--color-line)",
                }}>
                  <span style={{
                    fontFamily: "'Instrument Serif', serif", fontSize: 17,
                    color: "var(--color-ink)",
                  }}>{WING_LABEL[wing]}</span>
                  <span style={{ fontSize: 11, color: "var(--color-tan)" }}>
                    {fmtAmount(wingReceived)} / {fmtAmount(wingDue)}
                  </span>
                </div>

                {PARTS.map((part) => {
                  const group = rowsFor(wing, part);
                  if (group.length === 0 && readonly) return null;

                  return (
                    <div key={part} style={{ marginBottom: 12 }}>
                      {/* Part heading */}
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: "var(--color-tan)",
                        textTransform: "uppercase", letterSpacing: "0.08em",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 8,
                      }}>
                        <span>{PART_LABEL[part]}</span>
                        {!readonly && (
                          <button
                            type="button"
                            onClick={() => setModal({ type: "add", wing, part })}
                            style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 7,
                              border: "1px solid var(--color-line)", background: "none",
                              cursor: "pointer", color: "var(--color-tan)",
                              textTransform: "none", letterSpacing: 0,
                            }}
                          >+ Add</button>
                        )}
                      </div>

                      {group.length === 0 ? (
                        <div style={{
                          padding: "10px 14px", borderRadius: 12,
                          border: "1px dashed var(--color-line)", color: "var(--color-tan)",
                          fontSize: 12, textAlign: "center",
                        }}>
                          No milestones in {PART_LABEL[part]}.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {group.map((row, idx) => (
                            <MilestoneRow
                              key={row.schedule_id}
                              row={row}
                              records={recordsForRow(row.schedule_id)}
                              readonly={readonly}
                              isFirst={idx === 0}
                              isLast={idx === group.length - 1}
                              moving={moving === row.schedule_id}
                              onEdit={() => setModal({ type: "edit", row })}
                              onDelete={() => softDelete(row)}
                              onRecord={() => setModal({ type: "record", row })}
                              onMove={(delta) => move(row, delta)}
                              onInsertAfter={() => setModal({
                                type: "add", wing, part, afterOrder: row.sequence_order,
                              })}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modal?.type === "add" && (
        <AddMilestoneModal
          projectId={projectId}
          nextOrder={nextOrder}
          wing={modal.wing}
          part={modal.part}
          afterOrder={modal.afterOrder}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
      {modal?.type === "edit" && (
        <EditMilestoneModal
          projectId={projectId}
          row={modal.row}
          allowExecution={scope !== "design_only"}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
      {modal?.type === "record" && (
        <RecordPaymentModal
          projectId={projectId}
          row={modal.row}
          existingRecords={recordsForRow(modal.row.schedule_id)}
          onClose={() => setModal(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
