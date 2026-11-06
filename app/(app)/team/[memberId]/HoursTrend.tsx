"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./member-detail.module.css";

export type TrendPoint = { date: string; minutes: number };

const H = 200;
const PAD = { top: 16, right: 12, bottom: 26, left: 34 };
const LINE = "var(--color-forest)";

const fmtH = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
};
const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * Stock-ticker style line of hours per worked day: one series, area fill,
 * change vs the earlier half of the range, crosshair + tooltip on hover.
 */
export function HoursTrend({ points }: { points: TrendPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const n = data.length;

  // Headline: average day, and how the later half compares with the earlier half.
  const avg = n ? data.reduce((s, p) => s + p.minutes, 0) / n : 0;
  const half = Math.floor(n / 2);
  const avgOf = (arr: TrendPoint[]) => (arr.length ? arr.reduce((s, p) => s + p.minutes, 0) / arr.length : 0);
  const early = avgOf(data.slice(0, half));
  const late = avgOf(data.slice(half));
  const change = n >= 4 && early > 0 ? Math.round(((late - early) / early) * 100) : null;

  const maxH = Math.max(1, Math.ceil(Math.max(...data.map((p) => p.minutes), 60) / 60));
  const yMax = maxH * 60;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (m: number) => PAD.top + plotH - (m / yMax) * plotH;

  const line = data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.minutes).toFixed(1)}`).join(" ");
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${PAD.top + plotH} L${x(0).toFixed(1)},${PAD.top + plotH} Z` : "";
  const ticks = [0, Math.round(maxH / 2), maxH].filter((v, i, a) => a.indexOf(v) === i);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n === 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const active = hover != null ? data[hover] : data[n - 1];

  return (
    <div ref={wrapRef} className={styles.trend}>
      <div className={styles.trendHead}>
        <div>
          <div className={styles.trendValue}>{active ? fmtH(active.minutes) : "—"}</div>
          <div className={styles.trendSub}>
            {active ? (hover != null ? fmtDay(active.date) : `Latest · ${fmtDay(active.date)}`) : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {change != null && (
            <div className={`${styles.trendChange} ${change >= 0 ? styles.trendUp : styles.trendDown}`}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
            </div>
          )}
          <div className={styles.trendSub}>
            Avg {fmtH(avg)}/day{change != null ? " · vs earlier in range" : ""}
          </div>
        </div>
      </div>

      <svg width={width} height={H} role="img" aria-label={`Hours per day, ${n} days, average ${fmtH(avg)}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="hoursTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2D6A4F" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2D6A4F" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t * 60)} y2={y(t * 60)} stroke="var(--color-line)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 8} y={y(t * 60) + 4} textAnchor="end" fontSize={10} fill="var(--color-tan)">{t}h</text>
          </g>
        ))}
        {n > 0 && (
          <>
            <text x={x(0)} y={H - 6} textAnchor={n === 1 ? "middle" : "start"} fontSize={10} fill="var(--color-tan)">{fmtDay(data[0].date)}</text>
            {n > 1 && <text x={x(n - 1)} y={H - 6} textAnchor="end" fontSize={10} fill="var(--color-tan)">{fmtDay(data[n - 1].date)}</text>}
          </>
        )}
        {n > 1 && <path d={area} fill="url(#hoursTrendFill)" />}
        {n > 1 && <path d={line} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {active && (
          <>
            {hover != null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-ink)" strokeOpacity={0.25} strokeWidth={1} />
            )}
            <circle cx={x(hover ?? n - 1)} cy={y(active.minutes)} r={5} fill={LINE} stroke="var(--color-paper-light)" strokeWidth={2} />
          </>
        )}
        <rect
          x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
          style={{ touchAction: "pan-y", cursor: "crosshair" }}
        />
      </svg>
    </div>
  );
}

/** Bars / Trend switch shown above the hours chart. */
export function ViewToggle({ value, onChange }: { value: "bars" | "trend"; onChange: (v: "bars" | "trend") => void }) {
  return (
    <div className={styles.rangeFilter} role="group" aria-label="Chart view" style={{ width: "fit-content", marginBottom: 14 }}>
      {(["bars", "trend"] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={`${styles.rangePill} ${value === v ? styles.rangePillActive : ""}`}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
        >
          {v === "bars" ? "Bars" : "Trend"}
        </button>
      ))}
    </div>
  );
}
