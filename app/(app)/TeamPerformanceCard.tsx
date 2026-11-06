"use client";

import { useEffect, useState } from "react";
import type { TeamPerformanceDay, TeamPerformanceRow } from "@/app/api/team-performance/route";

// Overview: one metric at a time over a chosen day or range — either one bar
// per member (Compare) or a daily line graph for the team or one member (Graph).

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 28,
  padding: 24,
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--line-2)",
};

type MetricKey = "minutes" | "tasks_done" | "updates" | "site_visits";

const METRICS: { key: MetricKey; label: string; step: number; format: (v: number) => string }[] = [
  { key: "minutes", label: "Hours in office", step: 240, format: (v) => (v ? `${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}m` : ""}` : "0h") },
  { key: "tasks_done", label: "Tasks done", step: 4, format: (v) => String(v) },
  { key: "updates", label: "Updates posted", step: 4, format: (v) => String(v) },
  { key: "site_visits", label: "Site visits", step: 4, format: (v) => String(v) },
];

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const control: React.CSSProperties = {
  height: 32, padding: "0 12px", borderRadius: 999, border: "1px solid var(--color-line)",
  background: "var(--color-paper)", color: "var(--color-ink)", fontSize: 12, fontFamily: "inherit",
};

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "inline-flex", padding: 3, borderRadius: 999, background: "var(--color-paper)", border: "1px solid var(--color-line)" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{
              height: 26, padding: "0 12px", borderRadius: 999, border: "none", cursor: "pointer",
              fontSize: 12, fontFamily: "inherit", fontWeight: on ? 600 : 400,
              background: on ? "var(--color-ink)" : "transparent",
              color: on ? "#FBF8F2" : "var(--color-tan)",
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

// Line + area per day, stock-chart style; single series, so no legend — the
// subtitle names it. The SVG stretches to the card (non-scaling stroke keeps
// the line 2px); markers and tooltip are HTML so they never distort.
function TrendGraph({ days, values, format, label, step }: {
  days: string[]; values: number[]; format: (v: number) => string; label: string;
  step: number; // axis max rounds up to a multiple of this, so quarter ticks are whole
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 200;
  const max = Math.max(step, Math.ceil((Math.max(0, ...values) * 1.1) / step) * step);
  const n = days.length;
  const xPct = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v: number) => 100 - (v / max) * 100;
  const pts = values.map((v, i) => `${xPct(i)},${yPct(v)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${xPct(n - 1)},100 L${xPct(0)},100 Z`;
  const last = values[n - 1] ?? 0;
  const first = values[0] ?? 0;
  const gridLines = [0.25, 0.5, 0.75];

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = n === 1 ? 0 : Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const shown = hover ?? n - 1;
  const tick = (i: number) => i === 0 || i === n - 1 || (n > 6 && i === Math.floor((n - 1) / 2));

  return (
    <div>
      {/* Readout: the hovered day, or the latest day when idle. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 28, fontFamily: "'Instrument Serif', serif", letterSpacing: -0.5, lineHeight: 1 }}>{format(values[shown] ?? 0)}</span>
        <span style={{ fontSize: 12, color: "var(--color-tan)" }}>
          {shortDate(days[shown])}
          {hover === null && n > 1 && ` · ${last >= first ? "up" : "down"} ${format(Math.abs(last - first))} since ${shortDate(days[0])}`}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
        <div
          role="img"
          aria-label={`${label}, ${shortDate(days[0])} to ${shortDate(days[n - 1])}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ position: "relative", height: H, cursor: "crosshair" }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
            <defs>
              <linearGradient id="perf-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-forest)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-forest)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {gridLines.map((g) => (
              <line key={g} x1="0" x2="100" y1={g * 100} y2={g * 100} stroke="var(--color-line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2="100" y1="100" y2="100" stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
            {n > 1 && <path d={area} fill="url(#perf-area)" />}
            {n > 1 && (
              <path d={line} fill="none" stroke="var(--color-forest)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
            {hover !== null && (
              <line x1={xPct(hover)} x2={xPct(hover)} y1="0" y2="100" stroke="var(--color-tan)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div style={{
            position: "absolute", left: `${xPct(shown)}%`, top: `${yPct(values[shown] ?? 0)}%`,
            width: 10, height: 10, borderRadius: "50%", transform: "translate(-50%, -50%)",
            background: "var(--color-forest)", boxShadow: "0 0 0 2px var(--color-paper-light)", pointerEvents: "none",
          }} />
        </div>
        {/* Value axis on the right, as on a price chart. */}
        <div style={{ position: "relative", height: H, width: 44 }}>
          {[1, ...gridLines, 0].map((g) => (
            <span key={g} style={{
              position: "absolute", top: `${(1 - g) * 100}%`, right: 0, transform: "translateY(-50%)",
              fontSize: 10, color: "var(--color-tan)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap",
            }}>{format(Math.round(max * g))}</span>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", height: 18, marginTop: 8, marginRight: 54 }}>
        {days.map((d, i) => tick(i) && (
          <span key={d} style={{
            position: "absolute", left: `${xPct(i)}%`,
            transform: n > 1 && i === 0 ? "none" : n > 1 && i === n - 1 ? "translateX(-100%)" : "translateX(-50%)",
            fontSize: 11, color: "var(--color-tan)", whiteSpace: "nowrap",
          }}>{shortDate(d)}</span>
        ))}
      </div>
    </div>
  );
}

export default function TeamPerformanceCard() {
  const today = istToday();
  const [mode, setMode] = useState<"day" | "range">("range");
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(shiftDay(today, -6));
  const [to, setTo] = useState(today);
  const [metric, setMetric] = useState<MetricKey>("minutes");
  const [view, setView] = useState<"compare" | "trend">("compare");
  const [who, setWho] = useState("all");
  const [result, setResult] = useState<{ key: string; rows?: TeamPerformanceRow[]; daily?: TeamPerformanceDay[]; error?: string } | null>(null);

  const qFrom = mode === "day" ? day : from;
  const qTo = mode === "day" ? day : to;
  const key = `${qFrom}|${qTo}`;
  // Stale results (from a previous range) read as loading.
  const rows = result?.key === key ? result.rows ?? null : null;
  const daily = result?.key === key ? result.daily ?? [] : [];
  const error = result?.key === key ? result.error ?? null : null;

  useEffect(() => {
    if (!qFrom || !qTo || qFrom > qTo) return;
    let cancelled = false;
    fetch(`/api/team-performance?from=${qFrom}&to=${qTo}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load");
        if (!cancelled) setResult({ key: `${qFrom}|${qTo}`, rows: body.data, daily: body.daily });
      })
      .catch((e) => { if (!cancelled) setResult({ key: `${qFrom}|${qTo}`, error: e instanceof Error ? e.message : "Could not load" }); });
    return () => { cancelled = true; };
  }, [qFrom, qTo]);

  const m = METRICS.find((x) => x.key === metric)!;
  const sorted = rows ? [...rows].sort((a, b) => b[metric] - a[metric] || a.full_name.localeCompare(b.full_name)) : [];
  const max = Math.max(1, ...sorted.map((r) => r[metric]));
  const total = sorted.reduce((s, r) => s + r[metric], 0);
  const person = rows?.find((r) => r.user_id === who);
  const trendDays = qFrom && qTo && qFrom <= qTo ? daysBetween(qFrom, qTo) : [];
  const trendValues = trendDays.map((d) =>
    daily.filter((x) => x.date === d && (who === "all" || x.user_id === who)).reduce((s, x) => s + x[metric], 0),
  );

  return (
    <div style={C}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", letterSpacing: -0.3, lineHeight: 1.1 }}>Team performance</div>
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 6 }}>
            {rows ? `${m.label}: ${m.format(total)} across the team` : error ? "Couldn't load" : "Loading…"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Segmented label="Period" value={mode} onChange={setMode} options={[{ value: "day", label: "Day" }, { value: "range", label: "Range" }]} />
          {mode === "day" ? (
            <input type="date" aria-label="Day" value={day} max={today} onChange={(e) => setDay(e.target.value)} style={control} />
          ) : (
            <>
              <input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={control} />
              <span style={{ fontSize: 12, color: "var(--color-tan)" }}>to</span>
              <input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} style={control} />
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <Segmented label="Metric" value={metric} onChange={setMetric} options={METRICS.map((x) => ({ value: x.key, label: x.label }))} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {view === "trend" && rows && rows.length > 0 && (
            <select aria-label="Member" value={who} onChange={(e) => setWho(e.target.value)} style={control}>
              <option value="all">Whole team</option>
              {rows.map((r) => <option key={r.user_id} value={r.user_id}>{r.full_name}</option>)}
            </select>
          )}
          <Segmented label="View" value={view} onChange={setView} options={[{ value: "compare", label: "Compare" }, { value: "trend", label: "Graph" }]} />
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--color-rose)" }}>{error}</div>}
      {rows && rows.length === 0 && <div style={{ fontSize: 13, color: "var(--color-tan)" }}>No team members yet. Invite people from Team.</div>}

      {rows && rows.length > 0 && view === "trend" && trendDays.length > 0 && (
        <TrendGraph
          days={trendDays}
          values={trendValues}
          format={m.format}
          step={m.step}
          label={`${m.label} per day, ${person ? person.full_name : "whole team"}`}
        />
      )}

      {rows && rows.length > 0 && view === "compare" && (
        <div role="list" aria-label={`${m.label} by member`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((r) => {
            const v = r[metric];
            return (
              <div
                key={r.user_id}
                role="listitem"
                title={`${r.full_name}: ${m.format(v)}`}
                style={{ display: "grid", gridTemplateColumns: "minmax(110px, 180px) 1fr 64px", alignItems: "center", gap: 14 }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.full_name}</span>
                <div style={{ height: 14, borderRadius: 4, background: "var(--color-line)", opacity: 1, position: "relative" }}>
                  <div style={{
                    position: "absolute", inset: "0 auto 0 0", width: `${(v / max) * 100}%`,
                    minWidth: v > 0 ? 4 : 0, borderRadius: 4, background: "var(--color-forest)",
                    transition: "width .3s ease",
                  }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, textAlign: "right" }}>{m.format(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
