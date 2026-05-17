"use client";

import React, { useState } from "react";
import { Chip } from "@/components/atoms";

type Checkpoint = {
  id: string;
  name: string;
  sequence_order: number;
  due_date: string;
  started_at: string | null;
  completed_at: string | null;
  requires_approval: boolean;
  approved_at: string | null;
  remarks: string | null;
  completion_percentage: number | null;
};

type CheckpointStatus = "complete" | "in_progress" | "overdue" | "pending";

// `nowMs` (server clock) is passed in rather than calling `new Date()` here,
// so the "overdue" decision is identical on server and client — otherwise the
// rendered output diverges and hydration breaks.
function checkpointStatus(cp: Checkpoint, nowMs: number): CheckpointStatus {
  if (cp.approved_at || cp.completed_at) return "complete";
  if (cp.started_at) return "in_progress";
  if (new Date(cp.due_date).getTime() < nowMs) return "overdue";
  return "pending";
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProgressTimelineClient({ checkpoints, nowMs }: { checkpoints: Checkpoint[]; nowMs: number }) {
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const activeCp = activePopover ? checkpoints.find(c => c.id === activePopover) : null;
  const activeStatus = activeCp ? checkpointStatus(activeCp, nowMs) : null;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", position: "relative", overflowX: "auto", padding: "10px 16px 24px", margin: "0 -16px" }}>
        <div style={{ position: "absolute", top: 21, left: 26, right: 26, height: 2, background: "var(--color-line)", zIndex: 0 }} />
        {checkpoints.map((cp) => {
          const s = checkpointStatus(cp, nowMs);
          const dotBg = s === "complete"
            ? "var(--color-forest)"
            : s === "in_progress"
              ? "var(--color-amber)"
              : s === "overdue"
                ? "var(--color-rust)"
                : "var(--color-line)";
          const isPopoverOpen = activePopover === cp.id;

          return (
            <div
              key={cp.id}
              style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 100, flex: "0 0 100px" }}
            >
              <div
                style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: dotBg, border: "3px solid var(--color-paper-light)",
                  marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  boxShadow: "0 0 0 1px " + dotBg,
                  cursor: "pointer",
                }}
                onClick={() => setActivePopover(isPopoverOpen ? null : cp.id)}
              >
                {s === "complete" && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="0" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {s === "overdue" && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, textAlign: "center", lineHeight: 1.25, width: "100%", overflowWrap: "anywhere" }}>
                {cp.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.2, color: "var(--color-tan)", marginTop: 2, width: "100%", textAlign: "center" }}>
                {formatDate(cp.due_date)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Popover rendered outside loop to escape stacking context issues */}
      {activeCp && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setActivePopover(null)}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "var(--color-paper-light)", border: "1px solid var(--color-line)",
            borderRadius: 16, padding: "20px", width: 280, zIndex: 101,
            boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)", textAlign: "left",
            color: "var(--color-ink)",
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{activeCp.name}</span>
              <Chip
                label={`${activeCp.completion_percentage ?? (activeStatus === "complete" ? 100 : 0)}%`}
                tone={activeStatus === "complete" ? "mint" : activeStatus === "in_progress" ? "amber" : "sand"}
                size="sm"
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <span><b>Due:</b> {formatDate(activeCp.due_date)}</span>
              {activeCp.completed_at && <span><b>Done:</b> {formatDate(activeCp.completed_at)}</span>}
            </div>

            <div style={{ fontSize: 13, background: "var(--color-bg)", padding: 10, borderRadius: 8, fontStyle: activeCp.remarks ? "normal" : "italic", color: activeCp.remarks ? "var(--color-ink)" : "var(--color-tan)" }}>
              {activeCp.remarks || "No remarks added."}
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <Chip
                label={(activeStatus ?? "pending").replace("_", " ").toUpperCase()}
                tone={activeStatus === "complete" ? "forest" : activeStatus === "overdue" ? "rust" : activeStatus === "in_progress" ? "amber" : "sand"}
                size="sm" dot
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
