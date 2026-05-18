"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/atoms";
import { PageHeader } from "../../PageHeader";
import { type CalEvent, eventHref, eventTone, fmtTime, MONTH_NAMES } from "../eventUtils";

const SOURCE_TYPES = ["manual", "reminder", "checkpoint", "payment"] as const;

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 28,
        padding: "5px 12px",
        borderRadius: 999,
        border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
        background: active ? "var(--color-ink)" : "var(--color-paper-light)",
        color: active ? "#F3EFE7" : "var(--color-ink)",
        fontSize: 12,
        fontWeight: 500,
        textTransform: "capitalize",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function ScheduleClient({ events }: { events: CalEvent[] }) {
  const [filter, setFilter] = useState<string>("");

  const groups = useMemo(() => {
    const filtered = filter ? events.filter((e) => (e.source_type ?? "manual") === filter) : events;
    const map = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      const key = dateKey(e.starts_at);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return Array.from(map.values());
  }, [events, filter]);

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader title="Full Schedule" subtitle="All upcoming events" />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <FilterChip label="All" active={!filter} onClick={() => setFilter("")} />
        {SOURCE_TYPES.map((t) => (
          <FilterChip key={t} label={t} active={filter === t} onClick={() => setFilter(t)} />
        ))}
      </div>

      {groups.length === 0 && (
        <Card>
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-tan)", fontSize: 13 }}>
            No upcoming events.
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {groups.map((dayEvents) => (
          <div key={dateKey(dayEvents[0].starts_at)}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
              {dateLabel(dayEvents[0].starts_at)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dayEvents.map((e) => {
                const t = eventTone(e);
                const href = eventHref(e);
                const inner = (
                  <div style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: t.bg,
                    color: t.fg,
                    boxShadow: "0 10px 24px -14px rgba(27,26,23,.2)",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.1 }}>{e.title}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.75 }}>{fmtTime(e.starts_at)}</span>
                      {e.source_type && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                          background: "rgba(255,255,255,.25)", textTransform: "capitalize",
                        }}>
                          {e.source_type}
                        </span>
                      )}
                    </div>
                  </div>
                );
                return href
                  ? <Link key={e.id} href={href} style={{ textDecoration: "none" }}>{inner}</Link>
                  : <div key={e.id}>{inner}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
