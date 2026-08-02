"use client";

import { useEffect, useState } from "react";
import S from "./settings.module.css";

// Owner-editable KPI policy (client requests #9 and #10). Weights are stored as
// fractions (0.30) but shown and edited as percentages, which is how the client
// talks about them.

type Settings = {
  weight_efficiency: number;
  weight_quality: number;
  weight_delivery: number;
  weight_client_rating: number;
  include_client_rating: boolean;
  efficiency_multiplier: number;
  error_penalty: number;
  revision_penalty: number;
  delay_penalty: number;
};

const DEFAULTS: Settings = {
  weight_efficiency: 0.3,
  weight_quality: 0.4,
  weight_delivery: 0.3,
  weight_client_rating: 0,
  include_client_rating: false,
  efficiency_multiplier: 2,
  error_penalty: 4,
  revision_penalty: 2,
  delay_penalty: 2,
};

const pct = (v: number) => Math.round(v * 1000) / 10;

export default function KpiSettingsSection() {
  const [form, setForm] = useState<Settings | null>(null);
  const [canConfigure, setCanConfigure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/kpi-settings");
        if (!res.ok) return;
        const data = await res.json();
        setForm(data.settings ?? DEFAULTS);
        setCanConfigure(!!data.can_configure);
      } catch {
        // Card simply does not render if this fails.
      }
    })();
  }, []);

  if (!form) return null;

  const weightSum =
    form.weight_efficiency + form.weight_quality + form.weight_delivery +
    (form.include_client_rating ? form.weight_client_rating : 0);
  const sumOk = Math.round(weightSum * 1000) === 1000;

  function setWeightPct(key: keyof Settings, percent: number) {
    setForm(f => (f ? { ...f, [key]: Math.max(0, Math.min(100, percent)) / 100 } : f));
    setMsg(null);
  }

  function setNum(key: keyof Settings, value: number) {
    setForm(f => (f ? { ...f, [key]: value } : f));
    setMsg(null);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/kpi-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setMsg({ ok: true, text: "KPI updated — scores recalculate immediately" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  const weights: { key: keyof Settings; label: string; hint: string }[] = [
    { key: "weight_efficiency", label: "Efficiency", hint: "Volume of work completed" },
    { key: "weight_quality", label: "Quality", hint: "Fewer errors and revisions" },
    { key: "weight_delivery", label: "Delivery", hint: "Deadlines met, site delays" },
  ];

  const penalties: { key: keyof Settings; label: string; hint: string }[] = [
    { key: "efficiency_multiplier", label: "Points per completed item", hint: "Efficiency score = items × this, capped at 100" },
    { key: "error_penalty", label: "Points lost per error", hint: "Deducted from the quality score" },
    { key: "revision_penalty", label: "Points lost per revision", hint: "Deducted from the quality score" },
    { key: "delay_penalty", label: "Points lost per delay day", hint: "Deducted from the delivery score" },
  ];

  return (
    <div className={S.card}>
      <div className={S.cardHeader}>
        <div className={S.cardHeaderLeft}>
          <h2 className={`font-serif ${S.cardTitle}`}>Performance scoring</h2>
          <span className={S.cardSub}>
            {canConfigure
              ? "How every team member's KPI is calculated"
              : "How your KPI is calculated (read-only)"}
          </span>
        </div>
      </div>

      <div style={{ padding: "0 0 8px", fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Pillar weights
      </div>

      <div className={S.formGrid}>
        {weights.map(w => (
          <div className={S.formRow} key={w.key}>
            <label className={S.formLabel}>{w.label} (%)</label>
            <input
              type="number"
              className={S.formInput}
              value={pct(form[w.key] as number)}
              onChange={e => setWeightPct(w.key, Number(e.target.value))}
              min={0}
              max={100}
              disabled={!canConfigure || saving}
            />
            <span style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 4 }}>{w.hint}</span>
          </div>
        ))}

        <div className={S.formRow}>
          <label className={S.formLabel}>Client rating (%)</label>
          <input
            type="number"
            className={S.formInput}
            value={pct(form.weight_client_rating)}
            onChange={e => setWeightPct("weight_client_rating", Number(e.target.value))}
            min={0}
            max={100}
            disabled={!canConfigure || saving || !form.include_client_rating}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--color-tan)", marginTop: 6 }}>
            <input
              type="checkbox"
              checked={form.include_client_rating}
              onChange={e => setForm(f => (f ? { ...f, include_client_rating: e.target.checked } : f))}
              disabled={!canConfigure || saving}
            />
            Count customer feedback in the score
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, marginTop: 4, color: sumOk ? "var(--color-tan)" : "#B4553F" }}>
        Weights total {Math.round(weightSum * 1000) / 10}%{sumOk ? "" : " — must be 100% to save"}
      </div>

      <div style={{ padding: "18px 0 8px", fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Scoring rules
      </div>

      <div className={S.formGrid}>
        {penalties.map(p => (
          <div className={S.formRow} key={p.key}>
            <label className={S.formLabel}>{p.label}</label>
            <input
              type="number"
              step="0.5"
              className={S.formInput}
              value={form[p.key] as number}
              onChange={e => setNum(p.key, Number(e.target.value))}
              min={0}
              disabled={!canConfigure || saving}
            />
            <span style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 4 }}>{p.hint}</span>
          </div>
        ))}
      </div>

      {canConfigure && (
        <div className={S.formActions}>
          <button
            className={`${S.btn} ${S.btnPrimary}`}
            onClick={save}
            disabled={saving || !sumOk}
          >
            {saving ? "Saving…" : "Save KPI settings"}
          </button>
          {msg && (
            <span className={`${S.toast} ${msg.ok ? S.toastOk : S.toastErr}`}>{msg.text}</span>
          )}
        </div>
      )}
    </div>
  );
}
