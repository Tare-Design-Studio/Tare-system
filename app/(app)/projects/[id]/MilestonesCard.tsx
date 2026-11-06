"use client";

import React, { useState } from "react";

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

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 28, padding: 28, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
      <h2 className="font-serif" style={{ fontSize: 24, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>{title}</h2>
      <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 999, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

export default function MilestonesCard({
  initialSchedule,
  paymentRecords = [],
}: {
  initialSchedule: Milestone[];
  paymentRecords?: PaymentRecord[];
}) {
  const schedule: Milestone[] = Array.isArray(initialSchedule) ? initialSchedule : [];

  // View popup
  const [viewing, setViewing] = useState<Milestone | null>(null);

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
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {sorted.map((m) => {
            const { label, bg, color } = chipProps(m);
            return (
              <div
                key={m.schedule_id}
                onClick={() => setViewing(m)}
                style={{
                  width: 140, height: 120, boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column",
                  padding: "10px 12px", borderRadius: 12,
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
                <div title={m.milestone_name} style={{ fontSize: 12, fontWeight: 600, marginTop: 4, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.milestone_name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, marginTop: "auto" }}>
                  {fmt(m.amount_due)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)", marginTop: 2 }}>
                  Due {new Date(m.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
              </div>
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

    </>
  );
}
