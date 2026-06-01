"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import S from "./settings.module.css";
import { PageHeader } from "../PageHeader";

type Profile = {
  full_name: string;
  phone: string | null;
  role: string;
  mfa_enrolled_at: string | null;
  password_last_changed_at: string | null;
};

type TenantSettings = {
  name: string;
  office_lat: number | null;
  office_lng: number | null;
  office_geofence_radius_m: number;
  gps_retention_days: number;
  soft_delete_retention_days: number;
  variance_threshold_pct: number;
  material_excess_threshold_pct: number;
} | null;

interface Props {
  profile: Profile;
  tenant: TenantSettings;
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Profile section ────────────────────────────────────────────────

function ProfileSection({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name.trim(), phone: phone.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={S.card}>
      <div className={S.cardHeader}>
        <div className={S.cardHeaderLeft}>
          <h2 className={`font-serif ${S.cardTitle}`}>Profile</h2>
          <span className={S.cardSub}>Your display name and contact info</span>
        </div>
      </div>
      <div className={S.formGrid}>
        <div className={S.formRow}>
          <label className={S.formLabel}>Full Name</label>
          <input
            className={S.formInput}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>Phone</label>
          <input
            className={S.formInput}
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>Role</label>
          <input className={S.formInput} value={profile.role.replace("_", " ")} disabled />
        </div>
      </div>
      <div className={S.formActions}>
        <button className={`${S.btn} ${S.btnPrimary}`} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {msg && (
          <span className={`${S.toast} ${msg.ok ? S.toastOk : S.toastErr}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

// ── Security section ───────────────────────────────────────────────

function SecuritySection({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const [pwSaving, setPwSaving] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPwForm, setShowPwForm] = useState(false);

  const mfaOn = !!profile.mfa_enrolled_at;

  async function changePassword() {
    if (pwNew !== pwConfirm) {
      setPwMsg({ ok: false, text: "Passwords do not match" });
      return;
    }
    if (pwNew.length < 12) {
      setPwMsg({ ok: false, text: "Minimum 12 characters" });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw new Error(error.message);
      setPwMsg({ ok: true, text: "Password updated" });
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setShowPwForm(false);
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className={S.card}>
      <div className={S.cardHeader}>
        <div className={S.cardHeaderLeft}>
          <h2 className={`font-serif ${S.cardTitle}`}>Security</h2>
          <span className={S.cardSub}>Password and two-factor authentication</span>
        </div>
      </div>

      <div className={S.secRow}>
        <div className={S.secRowLeft}>
          <span className={S.secRowLabel}>Password</span>
          <span className={S.secRowMeta}>Last changed: {fmtDate(profile.password_last_changed_at)}</span>
        </div>
        <button
          className={`${S.btn} ${S.btnSm}`}
          onClick={() => { setShowPwForm(v => !v); setPwMsg(null); }}
        >
          {showPwForm ? "Cancel" : "Change password"}
        </button>
      </div>

      {showPwForm && (
        <div style={{ paddingBottom: 16, borderBottom: `1px solid var(--color-line)` }}>
          <div className={S.formGrid} style={{ marginBottom: 14 }}>
            <div className={S.formRow}>
              <label className={S.formLabel}>Current password</label>
              <input
                type="password"
                className={S.formInput}
                value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)}
                disabled={pwSaving}
                autoComplete="current-password"
              />
            </div>
            <div className={S.formRow}>
              <label className={S.formLabel}>New password</label>
              <input
                type="password"
                className={S.formInput}
                value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                disabled={pwSaving}
                autoComplete="new-password"
                placeholder="Min. 12 characters"
              />
            </div>
            <div className={S.formRow}>
              <label className={S.formLabel}>Confirm new password</label>
              <input
                type="password"
                className={S.formInput}
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                disabled={pwSaving}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className={S.formActions} style={{ marginTop: 0 }}>
            <button
              className={`${S.btn} ${S.btnPrimary}`}
              onClick={changePassword}
              disabled={pwSaving || !pwNew}
            >
              {pwSaving ? "Updating…" : "Update password"}
            </button>
            {pwMsg && (
              <span className={`${S.toast} ${pwMsg.ok ? S.toastOk : S.toastErr}`}>{pwMsg.text}</span>
            )}
          </div>
        </div>
      )}

      <div className={S.secRow}>
        <div className={S.secRowLeft}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className={`${S.dot} ${mfaOn ? S.dotOn : S.dotOff}`} />
            <span className={S.secRowLabel}>Two-factor authentication (TOTP)</span>
          </div>
          <span className={S.secRowMeta}>
            {mfaOn
              ? `Enrolled on ${fmtDate(profile.mfa_enrolled_at)}`
              : profile.role === "owner"
              ? "Required for Owner — enroll now"
              : "Not enrolled — optional but recommended"}
          </span>
        </div>
        {!mfaOn && (
          <a
            href="/login/verify?enroll=1"
            className={`${S.btn} ${S.btnSm} ${profile.role === "owner" ? S.btnPrimary : ""}`}
          >
            Enroll
          </a>
        )}
        {mfaOn && (
          <span className={`${S.toast} ${S.toastOk}`}>Active</span>
        )}
      </div>
    </div>
  );
}

// ── Access section ─────────────────────────────────────────────────

function AccessSection({ role }: { role: string }) {
  return (
    <div className={S.card}>
      <div className={S.cardHeader}>
        <div className={S.cardHeaderLeft}>
          <h2 className={`font-serif ${S.cardTitle}`}>Access</h2>
          <span className={S.cardSub}>What you can see and do in the app</span>
        </div>
      </div>
      {role === "owner" && (
        <div className={S.accessLinkRow}>
          <div className={S.secRowLeft}>
            <span className={S.secRowLabel}>Access Matrix</span>
            <span className={S.secRowMeta}>View your full capability list, grouped by area</span>
          </div>
          <Link href="/settings/access-matrix" className={`${S.btn} ${S.btnSm}`}>
            View matrix
          </Link>
        </div>
      )}
      <div className={S.accessLinkRow}>
        <div className={S.secRowLeft}>
          <span className={S.secRowLabel}>Table Presets</span>
          <span className={S.secRowMeta}>Manage reusable project table templates</span>
        </div>
        <Link href="/settings/table-presets" className={`${S.btn} ${S.btnSm}`}>
          Manage presets
        </Link>
      </div>
    </div>
  );
}

// ── Workspace section (Owner only) ─────────────────────────────────

function WorkspaceSection({ tenant }: { tenant: NonNullable<TenantSettings> }) {
  const [form, setForm] = useState({
    office_lat: tenant.office_lat?.toString() ?? "",
    office_lng: tenant.office_lng?.toString() ?? "",
    office_geofence_radius_m: tenant.office_geofence_radius_m.toString(),
    gps_retention_days: tenant.gps_retention_days.toString(),
    soft_delete_retention_days: tenant.soft_delete_retention_days.toString(),
    variance_threshold_pct: tenant.variance_threshold_pct.toString(),
    material_excess_threshold_pct: tenant.material_excess_threshold_pct.toString(),
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, number | null> = {
        office_geofence_radius_m: parseInt(form.office_geofence_radius_m),
        gps_retention_days: parseInt(form.gps_retention_days),
        soft_delete_retention_days: parseInt(form.soft_delete_retention_days),
        variance_threshold_pct: parseFloat(form.variance_threshold_pct),
        material_excess_threshold_pct: parseFloat(form.material_excess_threshold_pct),
      };
      if (form.office_lat.trim()) body.office_lat = parseFloat(form.office_lat);
      else body.office_lat = null;
      if (form.office_lng.trim()) body.office_lng = parseFloat(form.office_lng);
      else body.office_lng = null;

      const res = await fetch("/api/settings/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ ok: true, text: "Workspace settings saved" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={S.card}>
      <div className={S.cardHeader}>
        <div className={S.cardHeaderLeft}>
          <h2 className={`font-serif ${S.cardTitle}`}>Workspace</h2>
          <span className={S.cardSub}>{tenant.name} · tenant-wide settings</span>
        </div>
      </div>

      <div className={S.formGrid}>
        <div className={S.formRow}>
          <label className={S.formLabel}>Office latitude</label>
          <input
            className={S.formInput}
            value={form.office_lat}
            onChange={set("office_lat")}
            placeholder="e.g. 12.9716"
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>Office longitude</label>
          <input
            className={S.formInput}
            value={form.office_lng}
            onChange={set("office_lng")}
            placeholder="e.g. 77.5946"
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>Geofence radius (m)</label>
          <input
            type="number"
            className={S.formInput}
            value={form.office_geofence_radius_m}
            onChange={set("office_geofence_radius_m")}
            min={50}
            max={5000}
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>GPS retention (days)</label>
          <input
            type="number"
            className={S.formInput}
            value={form.gps_retention_days}
            onChange={set("gps_retention_days")}
            min={1}
            max={365}
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>Soft-delete retention (days)</label>
          <input
            type="number"
            className={S.formInput}
            value={form.soft_delete_retention_days}
            onChange={set("soft_delete_retention_days")}
            min={7}
            max={365}
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>Budget variance flag (%)</label>
          <input
            type="number"
            className={S.formInput}
            value={form.variance_threshold_pct}
            onChange={set("variance_threshold_pct")}
            min={0}
            max={100}
            step={0.5}
            disabled={saving}
          />
        </div>
        <div className={S.formRow}>
          <label className={S.formLabel}>Material excess flag (%)</label>
          <input
            type="number"
            className={S.formInput}
            value={form.material_excess_threshold_pct}
            onChange={set("material_excess_threshold_pct")}
            min={0}
            max={100}
            step={0.5}
            disabled={saving}
          />
        </div>
      </div>

      <div className={S.formActions}>
        <button className={`${S.btn} ${S.btnPrimary}`} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save workspace settings"}
        </button>
        {msg && (
          <span className={`${S.toast} ${msg.ok ? S.toastOk : S.toastErr}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────

export default function SettingsClient({ profile, tenant }: Props) {
  return (
    <div className={S.surface}>
      <PageHeader title="Settings" subtitle="Tenant configuration" />

      <div className={S.sectionStack}>
        <ProfileSection profile={profile} />
        <SecuritySection profile={profile} />
        <AccessSection role={profile.role} />
        {tenant && <WorkspaceSection tenant={tenant} />}
      </div>
    </div>
  );
}
