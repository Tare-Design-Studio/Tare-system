"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/atoms";
import { useDragReorder, reorderMilestone } from "./useDragReorder";

// "Show all" view of a payment schedule as a snakes-and-ladders board: every
// milestone of a wing is one square, Part A then Part B, winding left→right
// then right→left. The pencil on a Part turns on drag-to-reorder for it; every
// other action stays on the payments card.

type Wing = "design" | "execution";

interface BoardRow {
  schedule_id: string;
  milestone_name: string;
  wing: Wing;
  part: "a" | "b";
  amount_due: number;
  amount_received: number;
  due_date: string;
  sequence_order: number;
  is_paid: boolean;
  triggered_at: string | null;
}

const COLS = 5;

function fmtAmount(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function status(r: BoardRow): "paid" | "partial" | "due" | "pending" {
  if (r.is_paid || (r.amount_due > 0 && r.amount_received >= r.amount_due)) return "paid";
  if (r.amount_received > 0) return "partial";
  if (r.triggered_at) return "due";
  return "pending";
}

const SQUARE: Record<ReturnType<typeof status>, { bg: string; fg: string; label: string }> = {
  paid:    { bg: "var(--color-forest)", fg: "#FBF8F2", label: "Received" },
  partial: { bg: "var(--color-amber)",  fg: "#1B1A17", label: "Partial" },
  due:     { bg: "var(--color-rust)",   fg: "#FBF8F2", label: "Due" },
  pending: { bg: "var(--color-paper-light)", fg: "var(--color-ink)", label: "Pending" },
};

export default function PaymentsBoard({
  projectId, schedule, scope, canReorder = false, onClose,
}: {
  projectId: string;
  schedule: BoardRow[];
  scope: "design_only" | "design_and_execution";
  canReorder?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reorderPart, setReorderPart] = useState<"a" | "b" | null>(null);
  const wings: Wing[] = scope === "design_only" ? ["design"] : ["design", "execution"];
  const [wing, setWing] = useState<Wing>("design");

  const path = schedule
    .filter((r) => r.wing === wing)
    .sort((a, b) => (a.part === b.part ? a.sequence_order - b.sequence_order : a.part < b.part ? -1 : 1));

  // First square not yet settled across the wing — the counter sits here.
  const hereId = path.find((r) => status(r) !== "paid")?.schedule_id ?? null;

  // Each Part is its own board, numbered from 1, so A and B never run together.
  const parts = (["a", "b"] as const)
    .map((pt) => ({ part: pt, rows: path.filter((r) => r.part === pt) }))
    .filter((g) => g.rows.length > 0);

  const due = path.reduce((n, r) => n + r.amount_due, 0);
  const got = path.reduce((n, r) => n + r.amount_received, 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, background: "rgba(27,26,23,0.55)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-paper)", borderRadius: 28, padding: 24, width: "100%", maxWidth: 640,
          maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>All payments</span>
          {wings.length > 1 && (
            <span style={{ display: "inline-flex", border: "1px solid var(--color-line)", borderRadius: 99, padding: 2 }}>
              {wings.map((w) => (
                <button key={w} type="button" onClick={() => { setWing(w); setReorderPart(null); }} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, border: "none", cursor: "pointer",
                  background: wing === w ? "var(--color-ink)" : "transparent",
                  color: wing === w ? "#FBF8F2" : "var(--color-tan)",
                }}>{w === "design" ? "Design" : "Execution"}</button>
              ))}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-tan)" }}>
            {fmtAmount(got)} / {fmtAmount(due)}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)", fontSize: 18, padding: 4,
          }}>✕</button>
        </div>

        {path.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", textAlign: "center", padding: 24 }}>
            No milestones in this wing.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {parts.map((g) => {
              const sum = g.rows.reduce((n, r) => n + r.amount_due, 0);
              const recv = g.rows.reduce((n, r) => n + r.amount_received, 0);
              return (
                <section key={g.part} style={{
                  border: "1px solid var(--color-line)", borderRadius: 16, padding: 12,
                  background: g.part === "a" ? "rgba(45,106,79,.05)" : "rgba(226,166,75,.07)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                      padding: "3px 10px", borderRadius: 99, color: "#FBF8F2",
                      background: g.part === "a" ? "var(--color-forest)" : "var(--color-amber)",
                    }}>Part {g.part.toUpperCase()}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--color-tan)" }}>
                      {g.rows.length} milestone{g.rows.length === 1 ? "" : "s"} · {fmtAmount(recv)} / {fmtAmount(sum)}
                      {canReorder && (
                        <button
                          type="button"
                          onClick={() => setReorderPart((p) => p === g.part ? null : g.part)}
                          aria-label={reorderPart === g.part ? "Done reordering" : `Reorder Part ${g.part.toUpperCase()}`}
                          title={reorderPart === g.part ? "Done" : "Drag to reorder"}
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            height: 26, minWidth: 26, padding: reorderPart === g.part ? "0 10px" : 0,
                            borderRadius: 8, border: "1px solid var(--color-line)", cursor: "pointer", fontSize: 11,
                            background: reorderPart === g.part ? "var(--color-ink)" : "var(--color-paper-light)",
                            color: reorderPart === g.part ? "#FBF8F2" : "var(--color-tan)",
                          }}
                        >
                          {reorderPart === g.part ? "Done" : <Icon name="pencil" size={12} />}
                        </button>
                      )}
                    </span>
                  </div>
                  <Snake
                    group={`board-${wing}-${g.part}`}
                    rows={g.rows}
                    version={schedule}
                    hereId={hereId}
                    reordering={reorderPart === g.part}
                    onCommit={async (row, target) => {
                      const ok = await reorderMilestone(projectId, row, target);
                      if (ok) router.refresh();
                      return ok;
                    }}
                  />
                </section>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, fontSize: 11, color: "var(--color-tan)" }}>
          {(Object.keys(SQUARE) as (keyof typeof SQUARE)[]).map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: SQUARE[k].bg, border: "1px solid var(--color-line)" }} />
              {SQUARE[k].label}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-ink)" }} />
            Next payment
          </span>
        </div>
      </div>
    </div>
  );
}

function Snake({
  group, rows: items, version, hereId, reordering, onCommit,
}: {
  group: string;
  rows: BoardRow[];
  version: unknown;
  hereId: string | null;
  reordering: boolean;
  onCommit: (row: BoardRow, targetIndex: number) => Promise<boolean>;
}) {
  const { ordered: list, dragging, itemProps } = useDragReorder({
    group, items, version, getId: (r) => r.schedule_id, commit: onCommit,
  });
  const rows: BoardRow[][] = [];
  for (let i = 0; i < list.length; i += COLS) rows.push(list.slice(i, i + COLS));
  return (
    <div>
      {rows.map((row, ri) => {
        const reversed = ri % 2 === 1;
        return (
          <div key={ri}>
            <div style={{
              display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 6,
              direction: reversed ? "rtl" : "ltr",
            }}>
              {row.map((r, ci) => {
                const idx = ri * COLS + ci;
                const sq = SQUARE[status(r)];
                const here = r.schedule_id === hereId;
                const { style: dragStyle, ...drag } = reordering ? itemProps(idx) : { style: undefined };
                return (
                  <div key={r.schedule_id} {...drag} title={`${r.milestone_name} · ${sq.label}`} style={{
                    ...dragStyle,
                    outline: dragging === r.schedule_id ? "2px solid var(--color-ink)" : reordering ? "1px dashed var(--color-tan)" : "none",
                    outlineOffset: 2,
                    direction: "ltr", position: "relative", aspectRatio: "1 / 1", borderRadius: 10,
                    background: sq.bg, color: sq.fg, padding: 6,
                    border: here ? "2px solid var(--color-ink)" : "1px solid var(--color-line)",
                    display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0,
                  }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", opacity: .8 }}>{idx + 1}</span>
                    <div style={{ fontSize: 10, lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {r.milestone_name}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{fmtAmount(r.amount_due)}</div>
                    {here && (
                      <span style={{
                        position: "absolute", top: -7, right: -7, width: 16, height: 16, borderRadius: "50%",
                        background: "var(--color-ink)", border: "2px solid var(--color-paper)",
                      }} title="Next payment" />
                    )}
                  </div>
                );
              })}
            </div>
            {ri < rows.length - 1 && (
              <div style={{ display: "flex", justifyContent: reversed ? "flex-start" : "flex-end", padding: "0 calc(10% - 6px)" }}>
                <div style={{ width: 3, height: 14, background: "#D6CDBA", borderRadius: 2 }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
