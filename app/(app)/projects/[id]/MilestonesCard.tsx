"use client";

import React, { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

type Milestone = {
  schedule_id: string;
  milestone_name: string;
  amount_due: number;
  amount_received: number;
  due_date: string;
  is_paid: boolean;
  triggered_at: string | null;
  sequence_order: number;
  notes?: string | null;
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

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10,
  border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
  fontSize: 13, fontFamily: "inherit", color: "var(--color-ink)",
  outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--color-tan)",
  textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5,
};

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 28, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
      <h2 className="font-serif" style={{ fontSize: 24, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>{title}</h2>
      <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

export default function MilestonesCard({
  projectId,
  initialSchedule,
  paymentRecords = [],
  canEdit,
}: {
  projectId: string;
  initialSchedule: Milestone[];
  paymentRecords?: PaymentRecord[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<Milestone[]>(Array.isArray(initialSchedule) ? initialSchedule : []);

  async function refreshSchedule() {
    const res = await fetch(`/api/projects/${projectId}/payments`);
    if (res.ok) {
      const data = await res.json();
      setSchedule(Array.isArray(data) ? data : Array.isArray(data.schedule) ? data.schedule : []);
    }
  }

  // View popup
  const [viewing, setViewing] = useState<Milestone | null>(null);

  // Add popup: insertAfterOrder = null means append at end
  const [addingAfter, setAddingAfter] = useState<number | null | "closed">("closed");
  const [addForm, setAddForm] = useState({ milestone_name: "", amount_due: "", due_date: "", notes: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase",
    letterSpacing: "0.1em", marginBottom: 12,
  };

  const totalDue = schedule.reduce((s, m) => s + Number(m.amount_due), 0);
  const totalRec = schedule.reduce((s, m) => s + Number(m.amount_received), 0);
  const balance = totalDue - totalRec;

  function chipProps(m: Milestone): { label: string; bg: string; color: string } {
    const isPaid = m.is_paid;
    const isPartial = !isPaid && m.amount_received > 0;
    const isDue = !isPaid && m.triggered_at;
    const label = isPaid ? "Paid" : isPartial ? "Partial" : isDue ? "Due" : "Pending";
    const bg = isPaid ? "var(--color-forest)" : isPartial ? "var(--color-amber)" : isDue ? "var(--color-rust)" : "var(--color-line)";
    const color = isPaid || isDue ? "#FBF8F2" : "var(--color-ink)";
    return { label, bg, color };
  }

  async function submitAdd() {
    if (!addForm.milestone_name.trim() || !addForm.amount_due || !addForm.due_date) {
      setAddError("Name, amount and due date are required.");
      return;
    }
    setAddLoading(true); setAddError(null);

    // Determine sequence_order: insert after a given order, shifting the rest
    const sorted = [...schedule].sort((a, b) => a.sequence_order - b.sequence_order);
    let newOrder: number;
    if (addingAfter === null || addingAfter === "closed") {
      newOrder = (sorted[sorted.length - 1]?.sequence_order ?? 0) + 1;
    } else {
      newOrder = addingAfter + 1;
      // Re-sequence milestones that come after to make room
      for (const m of sorted) {
        if (m.sequence_order >= newOrder) {
          await fetch(`/api/projects/${projectId}/payments/${m.schedule_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sequence_order: m.sequence_order + 1 }),
          });
        }
      }
    }

    const res = await fetch(`/api/projects/${projectId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestone_name: addForm.milestone_name.trim(),
        amount_due: Number(addForm.amount_due),
        due_date: addForm.due_date,
        sequence_order: newOrder,
        notes: addForm.notes || undefined,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      setAddError(d.error ?? "Failed to add milestone");
      setAddLoading(false);
      return;
    }

    setAddingAfter("closed");
    setAddForm({ milestone_name: "", amount_due: "", due_date: "", notes: "" });
    setAddLoading(false);
    await refreshSchedule();
    router.refresh();
  }

  const renderInsertButton = (afterOrder: number | null) => (
    <button
      onClick={() => { setAddingAfter(afterOrder); setAddForm({ milestone_name: "", amount_due: "", due_date: "", notes: "" }); setAddError(null); }}
      title="Add milestone here"
      style={{
        width: 20, height: 20, borderRadius: "50%", border: "1.5px dashed var(--color-line)",
        background: "var(--color-bg)", cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0, color: "var(--color-tan)", transition: "border-color .15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--color-ink)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--color-line)")}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  );

  const sorted = [...schedule].sort((a, b) => a.sequence_order - b.sequence_order);

  return (
    <>
      <div style={{ ...sectionLabel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Payment Milestones</span>
        <span style={{ color: "var(--color-amber)", fontSize: 10 }}>Owner Only</span>
      </div>

      {/* Summary tiles */}
      {schedule.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { label: "Total Due", value: fmt(totalDue), color: "var(--color-ink)" },
            { label: "Received", value: fmt(totalRec), color: "var(--color-forest)" },
            { label: "Balance", value: fmt(balance), color: balance > 0 ? "var(--color-rust)" : "var(--color-forest)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: "8px 10px", background: "var(--color-bg)", borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, marginTop: 2, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cards row */}
      {schedule.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-tan)", fontStyle: "italic" }}>No milestones yet.</div>
          {canEdit && renderInsertButton(null)}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {canEdit && renderInsertButton(0)}
          {sorted.map((m) => {
            const { label, bg, color } = chipProps(m);
            return (
              <Fragment key={m.schedule_id}>
              <div
                onClick={() => setViewing(m)}
                style={{
                  minWidth: 128, padding: "10px 12px", borderRadius: 12,
                  border: "1px solid var(--color-line)",
                  background: m.is_paid ? "var(--color-bg)" : "var(--color-paper-light)",
                  flexShrink: 0, cursor: "pointer",
                  transition: "box-shadow .15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 12px -4px rgba(27,26,23,.15)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: bg, color }}>{label}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, lineHeight: 1.3 }}>{m.milestone_name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                  {fmt(m.amount_due)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)", marginTop: 2 }}>
                  Due {new Date(m.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
              </div>
              {canEdit && renderInsertButton(m.sequence_order)}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* View popup */}
      {viewing && (
        <Overlay onClose={() => setViewing(null)}>
          <ModalHeader title={viewing.milestone_name} onClose={() => setViewing(null)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(() => {
              const records = paymentRecords.filter(r => r.payment_schedule_id === viewing.schedule_id);
              const latest = records[0] ?? null;
              return (
                <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Amount Due", value: fmt(viewing.amount_due) },
                { label: "Received", value: fmt(viewing.amount_received) },
                { label: "Balance", value: fmt(viewing.amount_due - viewing.amount_received) },
                { label: "Due Date", value: fmtDate(viewing.due_date) },
                { label: "Paid Date", value: latest ? fmtDate(latest.paid_on) : "—" },
                { label: "Payment Type", value: latest?.method ? latest.method.toUpperCase() : "—" },
                { label: "UTR / Reference", value: latest?.reference ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, marginTop: 3 }}>{value}</div>
                </div>
                ))}
            </div>
            {records.length > 1 && (
              <div style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Payment Records</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {records.map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, fontSize: 12 }}>
                      <span>{fmtDate(r.paid_on)} · {(r.method ?? "Payment").toUpperCase()}{r.reference ? ` · ${r.reference}` : ""}</span>
                      <strong style={{ fontFamily: "var(--font-mono)" }}>{fmt(r.amount_paid)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
                </>
              );
            })()}
            <div style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Status</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(() => {
                  const { label, bg, color } = chipProps(viewing);
                  return (
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: bg, color }}>{label}</span>
                  );
                })()}
              </div>
            </div>
            {viewing.notes && (
              <div style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>{viewing.notes}</div>
              </div>
            )}
            <div style={{ padding: "10px 12px", background: "var(--color-bg)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: "var(--color-tan)" }}>
                Milestone #{viewing.sequence_order} · To update status, use <strong>Edit Project</strong>.
              </div>
            </div>
          </div>
        </Overlay>
      )}

      {/* Add popup */}
      {addingAfter !== "closed" && (
        <Overlay onClose={() => setAddingAfter("closed")}>
          <ModalHeader
            title={addingAfter === null || addingAfter === 0 ? "Add Milestone" : `Add Milestone after #${addingAfter}`}
            onClose={() => setAddingAfter("closed")}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Milestone Name *</label>
              <input
                style={inputStyle}
                value={addForm.milestone_name}
                onChange={e => setAddForm(f => ({ ...f, milestone_name: e.target.value }))}
                placeholder="e.g. Foundation Complete"
                autoFocus
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Amount Due (₹) *</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="0"
                  value={addForm.amount_due}
                  onChange={e => setAddForm(f => ({ ...f, amount_due: e.target.value }))}
                  placeholder="500000"
                />
              </div>
              <div>
                <label style={labelStyle}>Due Date *</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={addForm.due_date}
                  onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input
                style={inputStyle}
                value={addForm.notes}
                onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            {addError && (
              <div style={{ padding: "9px 12px", borderRadius: 9, background: "#C5543B18", color: "var(--color-rust)", fontSize: 12 }}>{addError}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAddingAfter("closed")} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={submitAdd} disabled={addLoading} style={{ padding: "9px 20px", borderRadius: 10, background: addLoading ? "var(--color-tan)" : "var(--color-ink)", color: "#FBF8F2", fontSize: 13, fontWeight: 600, border: "none", cursor: addLoading ? "not-allowed" : "pointer" }}>
                {addLoading ? "Adding…" : "Add Milestone"}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
