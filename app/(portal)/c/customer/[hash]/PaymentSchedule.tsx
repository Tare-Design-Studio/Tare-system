"use client";

import { useEffect, useRef } from "react";

// Horizontally scrolling payment schedule for the client portal.
//
// The vertical list this replaces made a 22-milestone project a wall of text
// the client had to scroll past. As a rail, each milestone is a card and the
// rail opens already scrolled to where the project actually is — the most
// recent paid milestone sits first, so the client lands on "here is where we
// got to" with the upcoming work to its right.

export type PortalPayment = {
  milestone_name: string;
  amount_due: number | string;
  amount_received: number | string;
  due_date: string | null;
  is_paid: boolean;
  wing: string | null;
  part: string | null;
  last_paid_on: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

// Mirrors the studio-side PaymentsCard rule exactly: an explicit is_paid flag
// settles a milestone even with no record behind it (waiver/adjustment), and a
// milestone is also paid once receipts cover what was billed.
function paymentStatus(pay: PortalPayment): "paid" | "partial" | "pending" {
  const due = Number(pay.amount_due);
  const got = Number(pay.amount_received);
  if (pay.is_paid || (due > 0 && got >= due)) return "paid";
  if (got > 0) return "partial";
  return "pending";
}

const WING_LABEL: Record<string, string> = { design: "Design", execution: "Execution" };
const PART_LABEL: Record<string, string> = { a: "Part A", b: "Part B" };

function groupLabel(wing: string | null, part: string | null): string {
  const w = wing ? (WING_LABEL[wing] ?? wing.replace(/_/g, " ")) : "";
  const p = part ? (PART_LABEL[part] ?? `Part ${part.toUpperCase()}`) : "";
  return [w, p].filter(Boolean).join(" · ");
}

export default function PaymentSchedule({ payments }: { payments: PortalPayment[] }) {
  // Group by wing AND part. Each part numbers from 1: the underlying
  // sequence_order is project-wide, so using it directly made Part B start at
  // 12 rather than 1.
  const groups: { key: string; label: string; rows: PortalPayment[] }[] = [];
  for (const pay of payments) {
    const key = `${pay.wing ?? ""}|${pay.part ?? ""}`;
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.rows.push(pay);
    else groups.push({ key, label: groupLabel(pay.wing, pay.part), rows: [pay] });
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {groups.map((g) => (
        // Labelled even when there is only one group: an unlabelled rail leaves
        // the client guessing which part of the engagement it bills.
        <PaymentRail key={g.key} label={g.label} rows={g.rows} showLabel={!!g.label} />
      ))}
    </div>
  );
}

function PaymentRail({ label, rows, showLabel }: { label: string; rows: PortalPayment[]; showLabel: boolean }) {
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // The card to open on: the LAST paid milestone in this part. Falling back to
  // the first unpaid one keeps a not-yet-started part pointing at what is next
  // rather than parking at an arbitrary position.
  let focusIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (paymentStatus(rows[i]) === "paid") focusIdx = i;
  }
  if (focusIdx === -1) {
    const firstUnpaid = rows.findIndex((r) => paymentStatus(r) !== "paid");
    focusIdx = firstUnpaid === -1 ? 0 : firstUnpaid;
  }

  useEffect(() => {
    const rail = railRef.current;
    const card = cardRefs.current[focusIdx];
    if (!rail || !card) return;
    // Scroll the rail itself rather than scrollIntoView, which would also drag
    // the whole page down to the rail on load.
    rail.scrollTo({ left: card.offsetLeft - rail.offsetLeft, behavior: "auto" });
  }, [focusIdx]);

  return (
    <div style={{ marginBottom: 16 }}>
      {showLabel && (
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", margin: "0 0 8px 2px" }}>
          {label}
        </div>
      )}
      <div
        ref={railRef}
        className="pay-rail"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: 8,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {rows.map((pay, i) => {
          const due = Number(pay.amount_due);
          const got = Number(pay.amount_received);
          const status = paymentStatus(pay);
          const accent = status === "paid" ? "var(--mint)" : status === "partial" ? "var(--amber)" : "var(--line-2)";
          const isFocus = i === focusIdx;

          return (
            <div
              key={`${pay.milestone_name}-${i}`}
              ref={(el) => { cardRefs.current[i] = el; }}
              style={{
                flex: "0 0 auto",
                width: 210,
                scrollSnapAlign: "start",
                background: "var(--bg)",
                border: `1px solid ${isFocus ? accent : "var(--line)"}`,
                borderRadius: 14,
                padding: "14px 14px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  background: status === "paid" ? accent : "var(--bg-2)",
                  border: `2px solid ${accent}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {status === "paid" && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#F3EFE7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  )}
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <div style={{
                fontSize: 13,
                fontWeight: status === "pending" ? 400 : 600,
                color: status === "pending" ? "var(--muted)" : "var(--ink)",
                lineHeight: 1.3,
              }}>
                {pay.milestone_name}
              </div>

              <div style={{ marginTop: "auto" }}>
                <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmtAmount(due)}</div>
                <div className="mono" style={{
                  fontSize: 10, marginTop: 2,
                  color: status === "paid" ? "var(--mint)" : status === "partial" ? "var(--amber)" : "var(--muted)",
                }}>
                  {status === "paid"
                    ? `Paid${pay.last_paid_on ? ` ${fmtDate(pay.last_paid_on)}` : ""}`
                    : status === "partial"
                      ? `${fmtAmount(due - got)} remaining`
                      : pay.due_date ? `Due ${fmtDate(pay.due_date)}` : "No due date"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
