"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, Icon } from "@/components/atoms";
import { useDragReorder } from "@/components/payments/useDragReorder";

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

// Snake layout: checkpoints wrap into rows that alternate direction
// (left→right, then right→left), joined by a U-turn at the row ends.
const MIN_CELL_PX = 120;
const ROW_H = 104;
const DOT_Y = 21; // vertical centre of the dot within a row
const LINE = 2;

// Connector runs a green gradient from the first checkpoint to the last.
function green(t: number): string {
  return `color-mix(in srgb, #2D6A4F ${Math.round((1 - t) * 100)}%, #74C69D)`;
}

// ─── Edit mode ───────────────────────────────────────────────────────────────
// Pencil (top right of the card) swaps the snake for a list: drag rows to
// reorder, and add a circle at any position. Both go through the migration-123
// RPCs behind /api/projects/[id]/checkpoints, which re-check project:edit.

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line-2)",
  background: "var(--bg-2)", fontSize: 13, color: "var(--color-ink)", boxSizing: "border-box", fontFamily: "inherit",
};

function TimelineEditor({ projectId, checkpoints }: { projectId: string; checkpoints: Checkpoint[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const last = checkpoints[checkpoints.length - 1];
  const [after, setAfter] = useState<number>(last?.sequence_order ?? 0);
  const [saving, setSaving] = useState(false);

  const { ordered, dragging, itemProps } = useDragReorder({
    group: `timeline-${projectId}`,
    items: checkpoints,
    version: checkpoints,
    getId: (c) => c.id,
    commit: async (cp, target) => {
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/checkpoints/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint_id: cp.id, target_index: target }),
      });
      if (!res.ok) { setError("Couldn't reorder — try again."); return false; }
      router.refresh();
      return true;
    },
  });

  async function add() {
    if (!name.trim() || !due || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), due_date: due, after_order: after }),
      });
      if (!res.ok) { setError("Couldn't add circle — try again."); return; }
      setName("");
      setDue("");
      setAfter((a) => a + 1);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {ordered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ordered.map((cp, i) => {
            const { style: dragStyle, ...drag } = itemProps(i);
            return (
              <div key={cp.id} {...drag} style={{
                ...dragStyle,
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12,
                background: "var(--color-paper-light)",
                border: `1px ${dragging === cp.id ? "solid var(--color-ink)" : "dashed var(--line-2)"}`,
                boxShadow: dragging === cp.id ? "0 12px 24px -12px rgba(30,28,24,.35)" : "none",
              }}>
                <span aria-hidden style={{ color: "var(--color-tan)", fontSize: 14 }}>⠿</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-tan)", width: 20 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cp.name}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-tan)", flexShrink: 0 }}>
                  {formatDate(cp.due_date)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ padding: 14, borderRadius: 14, border: "1px solid var(--line-2)", background: "var(--bg-2)", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>
          Add circle
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name — e.g. Slab casting" maxLength={200} aria-label="Circle name" style={{ ...fieldStyle, background: "var(--color-paper-light)" }} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" style={{ ...fieldStyle, background: "var(--color-paper-light)" }} />
          <select value={after} onChange={(e) => setAfter(Number(e.target.value))} aria-label="Position" style={{ ...fieldStyle, background: "var(--color-paper-light)" }}>
            <option value={0}>At the start</option>
            {checkpoints.map((cp, i) => (
              <option key={cp.id} value={cp.sequence_order}>After {String(i + 1).padStart(2, "0")} · {cp.name}</option>
            ))}
          </select>
        </div>
        {error && <div style={{ fontSize: 12, color: "var(--color-rust)" }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={add} disabled={!name.trim() || !due || saving} style={{
            padding: "8px 16px", borderRadius: 999, border: "none", background: "var(--color-ink)", color: "#F3EFE7",
            fontSize: 12, fontWeight: 600, fontFamily: "inherit",
            cursor: !name.trim() || !due || saving ? "not-allowed" : "pointer", opacity: !name.trim() || !due || saving ? 0.45 : 1,
          }}>{saving ? "Adding…" : "+ Add circle"}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProgressTimelineClient({ projectId, checkpoints, nowMs, canEdit = false, overallProgress, labelStyle }: {
  projectId: string;
  checkpoints: Checkpoint[];
  nowMs: number;
  /** project:edit — shows the pencil. */
  canEdit?: boolean;
  overallProgress: number;
  labelStyle: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const activeCp = activePopover ? checkpoints.find(c => c.id === activePopover) : null;
  const activeStatus = activeCp ? checkpointStatus(activeCp, nowMs) : null;

  const hasCheckpoints = checkpoints.length > 0;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
    // The snake unmounts in edit mode / when empty; re-attach when it returns.
  }, [editing, hasCheckpoints]);

  const perRow = width ? Math.max(2, Math.floor(width / MIN_CELL_PX)) : 6;
  const cols = Math.max(1, Math.min(perRow, checkpoints.length));
  const rows: Checkpoint[][] = [];
  for (let i = 0; i < checkpoints.length; i += cols) rows.push(checkpoints.slice(i, i + cols));
  const cellPct = 100 / cols;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span>Progress Timeline</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {checkpoints.length > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{overallProgress}% complete</span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              aria-pressed={editing}
              aria-label={editing ? "Done editing timeline" : "Edit timeline"}
              title={editing ? "Done" : "Add or reorder circles"}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                height: 28, minWidth: 28, padding: editing ? "0 12px" : 0, borderRadius: 8,
                border: "1px solid var(--color-line)", cursor: "pointer", fontSize: 11, fontWeight: 600,
                textTransform: "none", letterSpacing: 0, fontFamily: "inherit",
                background: editing ? "var(--color-ink)" : "transparent",
                color: editing ? "#FBF8F2" : "var(--color-tan)",
              }}
            >
              {editing ? "Done" : <Icon name="pencil" size={13} />}
            </button>
          )}
        </span>
      </div>

      {editing ? (
        <TimelineEditor projectId={projectId} checkpoints={checkpoints} />
      ) : checkpoints.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--color-tan)", fontStyle: "italic" }}>No checkpoints yet.</div>
      ) : (
      <div ref={wrapRef} style={{ position: "relative" }}>
        {rows.map((row, r) => {
          const reversed = r % 2 === 1;
          const hasNext = r < rows.length - 1;
          const tStart = green(r / rows.length);
          const tEnd = green((r + 1) / rows.length);
          return (
            <div key={r} style={{ position: "relative", height: ROW_H, display: "flex", flexDirection: reversed ? "row-reverse" : "row" }}>
              {/* Horizontal run through this row's dots */}
              {row.length > 1 && (
                <div style={{
                  position: "absolute", top: DOT_Y - LINE / 2, height: LINE, zIndex: 0,
                  background: `linear-gradient(${reversed ? "270deg" : "90deg"}, ${tStart}, ${tEnd})`,
                  [reversed ? "right" : "left"]: `${cellPct / 2}%`,
                  width: `${(row.length - 1) * cellPct}%`,
                }} />
              )}
              {/* U-turn down to the next row, on the side this row ends */}
              {hasNext && (
                <div style={{
                  position: "absolute", top: DOT_Y - LINE / 2, height: ROW_H + LINE, zIndex: 0, boxSizing: "border-box",
                  width: `${cellPct / 2}%`,
                  [reversed ? "left" : "right"]: 0,
                  // Longhands only: with a `border` shorthand, React re-applies it
                  // when tEnd changes (after width is measured) and the open side
                  // grows back as a stray vertical line through the labels.
                  borderTop: `${LINE}px solid ${tEnd}`,
                  borderBottom: `${LINE}px solid ${tEnd}`,
                  [reversed ? "borderLeft" : "borderRight"]: `${LINE}px solid ${tEnd}`,
                  borderRadius: reversed ? "24px 0 0 24px" : "0 24px 24px 0",
                }} />
              )}
              {row.map((cp) => {
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
                    style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", width: `${cellPct}%`, flex: "0 0 auto", paddingTop: DOT_Y - 11, paddingInline: 12, boxSizing: "border-box" }}
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
                    <div style={{ fontSize: 11, fontWeight: 600, textAlign: "center", lineHeight: 1.25, width: "100%", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={cp.name}>
                      {cp.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.2, color: "var(--color-tan)", marginTop: 2, width: "100%", textAlign: "center" }}>
                      {formatDate(cp.due_date)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      )}

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
