"use client";

import { useState } from "react";

// Pointer-based drag-to-reorder for one list of milestones. Pointer events (not
// HTML5 drag-and-drop) so it works with touch as well as a mouse. Each tile
// spreads `itemProps(i)`; the tile under the pointer is found by hit-testing,
// scoped to `group` so two lists on one screen never swap items.
//
// After a drop the new order is held locally until `version` (the schedule
// prop) changes, i.e. until router.refresh() brings the server's order back.

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function useDragReorder<T>({
  group, items, version, getId, commit,
}: {
  group: string;
  items: T[];
  version: unknown;
  getId: (item: T) => string;
  commit: (item: T, targetIndex: number) => Promise<boolean>;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [pending, setPending] = useState<{ version: unknown; ids: string[] } | null>(null);

  let base = items;
  if (pending && pending.version === version) {
    const byId = new Map(items.map((i) => [getId(i), i]));
    base = pending.ids.map((id) => byId.get(id)).filter((i): i is T => i !== undefined);
  }
  const ordered = drag ? moved(base, drag.from, drag.over) : base;

  async function drop() {
    const d = drag;
    setDrag(null);
    if (!d || d.from === d.over) return;
    const next = moved(base, d.from, d.over);
    setPending({ version, ids: next.map(getId) });
    const ok = await commit(base[d.from], d.over);
    if (!ok) setPending(null);
  }

  function itemProps(index: number) {
    return {
      "data-reorder-group": group,
      "data-reorder-idx": index,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ from: index, over: index });
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (!drag) return;
        const el = document.elementFromPoint(e.clientX, e.clientY)
          ?.closest(`[data-reorder-group="${group}"]`);
        if (!el) return;
        const over = Number(el.getAttribute("data-reorder-idx"));
        if (over !== drag.over) setDrag({ ...drag, over });
      },
      onPointerUp: () => { void drop(); },
      onPointerCancel: () => setDrag(null),
      style: { touchAction: "none", cursor: drag ? "grabbing" : "grab", userSelect: "none" } as React.CSSProperties,
    };
  }

  return { ordered, dragging: drag ? getId(ordered[drag.over]) : null, itemProps };
}

// Move one milestone to a 0-based index within its own (wing, part) group. The
// renumber runs server-side in one transaction (reorder_payment_milestone).
export async function reorderMilestone(
  projectId: string,
  row: { schedule_id: string; wing: string; part: string },
  targetIndex: number,
): Promise<boolean> {
  const res = await fetch(`/api/projects/${projectId}/payments/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule_id: row.schedule_id, wing: row.wing, part: row.part, target_index: targetIndex }),
  });
  if (!res.ok) alert((await res.text()) || "Reorder failed");
  return res.ok;
}
