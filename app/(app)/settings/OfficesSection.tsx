"use client";

import { useEffect, useState } from "react";
import { parseMapsUrl } from "@/lib/geo/mapsUrl";
import S from "./settings.module.css";

// Office locations for attendance. The studio works out of more than one office
// (Mysore, Bangalore), and a member checks in at whichever one they are in —
// the app matches by GPS, nobody picks from a list.

type Office = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  is_active: boolean;
};

const RADII = [100, 200, 500, 1000];

const blank = { name: "", address: "", lat: "", lng: "", radius: "200" };

export default function OfficesSection() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blank);
  const [mapsUrl, setMapsUrl] = useState("");
  const [mapsMsg, setMapsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(blank);
  const [editMapsUrl, setEditMapsUrl] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/offices");
      if (!res.ok) return;
      const data = await res.json();
      setOffices(data.offices ?? []);
      setCanConfigure(!!data.can_configure);
    } finally {
      setLoaded(true);
    }
  }

  // Fetch-on-mount: setState happens in the awaited callback, not in the effect body.
  useEffect(() => { load(); }, []);

  function applyMaps(value: string, target: "new" | "edit") {
    if (target === "new") setMapsUrl(value); else setEditMapsUrl(value);
    if (!value.trim()) { setMapsMsg(null); return; }

    const parsed = parseMapsUrl(value);
    if (parsed.ok) {
      const patch = { lat: String(parsed.lat), lng: String(parsed.lng) };
      if (target === "new") setForm(f => ({ ...f, ...patch }));
      else setEditForm(f => ({ ...f, ...patch }));
      setMapsMsg({ ok: true, text: "Coordinates filled from the link." });
    } else if (parsed.reason === "short_link") {
      setMapsMsg({ ok: false, text: "Short links (maps.app.goo.gl) carry no coordinates. Open it in Maps, then copy the full URL from the address bar." });
    } else {
      setMapsMsg({ ok: false, text: "No coordinates found in that link." });
    }
  }

  async function create() {
    if (!form.name.trim() || !form.lat || !form.lng) {
      setMsg({ ok: false, text: "Name and location are required" });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/offices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || null,
          lat: parseFloat(form.lat),
          lng: parseFloat(form.lng),
          geofence_radius_m: parseInt(form.radius),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add office");
      setForm(blank); setMapsUrl(""); setMapsMsg(null); setAdding(false);
      setMsg({ ok: true, text: `${data.name} added` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not add office" });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(o: Office) {
    setEditId(o.id);
    setEditForm({
      name: o.name,
      address: o.address ?? "",
      lat: String(o.lat),
      lng: String(o.lng),
      radius: String(o.geofence_radius_m),
    });
    setEditMapsUrl("");
    setMapsMsg(null);
    setMsg(null);
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/offices/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          address: editForm.address.trim() || null,
          lat: parseFloat(editForm.lat),
          lng: parseFloat(editForm.lng),
          geofence_radius_m: parseInt(editForm.radius),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setEditId(null);
      setMsg({ ok: true, text: "Office updated" });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  async function setActive(o: Office, active: boolean) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/offices/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: active }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className={S.card}>
      <div className={S.cardHeader}>
        <div className={S.cardHeaderLeft}>
          <h2 className={`font-serif ${S.cardTitle}`}>Office locations</h2>
          <span className={S.cardSub}>
            Members check in at whichever office they are standing in — matched by GPS
          </span>
        </div>
        {canConfigure && !adding && (
          <button
            className={`${S.btn} ${S.btnSm}`}
            onClick={() => { setAdding(true); setMsg(null); setMapsMsg(null); }}
          >
            Add office
          </button>
        )}
      </div>

      {offices.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: "var(--color-tan)", padding: "8px 0" }}>
          No offices yet. Add one so office check-in can work.
        </div>
      )}

      {offices.map(o => (
        <div
          key={o.id}
          style={{
            padding: "14px 0",
            borderBottom: "1px solid rgba(30,28,24,.06)",
            opacity: o.is_active ? 1 : 0.55,
          }}
        >
          {editId === o.id ? (
            <div className={S.formGrid}>
              <div className={S.formRow} style={{ gridColumn: "1 / -1" }}>
                <label className={S.formLabel}>Office name</label>
                <input
                  className={S.formInput}
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  disabled={busy}
                />
              </div>
              <div className={S.formRow} style={{ gridColumn: "1 / -1" }}>
                <label className={S.formLabel}>Move it — paste a Google Maps link</label>
                <input
                  className={S.formInput}
                  value={editMapsUrl}
                  onChange={e => applyMaps(e.target.value, "edit")}
                  placeholder="https://www.google.com/maps/…"
                  disabled={busy}
                />
              </div>
              <div className={S.formRow}>
                <label className={S.formLabel}>Latitude</label>
                <input
                  className={S.formInput}
                  value={editForm.lat}
                  onChange={e => setEditForm(f => ({ ...f, lat: e.target.value }))}
                  disabled={busy}
                />
              </div>
              <div className={S.formRow}>
                <label className={S.formLabel}>Longitude</label>
                <input
                  className={S.formInput}
                  value={editForm.lng}
                  onChange={e => setEditForm(f => ({ ...f, lng: e.target.value }))}
                  disabled={busy}
                />
              </div>
              <div className={S.formRow}>
                <label className={S.formLabel}>Check-in radius (m)</label>
                <select
                  className={S.formInput}
                  value={editForm.radius}
                  onChange={e => setEditForm(f => ({ ...f, radius: e.target.value }))}
                  disabled={busy}
                >
                  {RADII.map(r => <option key={r} value={r}>{r} m</option>)}
                </select>
              </div>
              <div className={S.formRow} style={{ gridColumn: "1 / -1", flexDirection: "row", gap: 8 }}>
                <button className={`${S.btn} ${S.btnPrimary}`} onClick={saveEdit} disabled={busy}>
                  {busy ? "Saving…" : "Save office"}
                </button>
                <button className={S.btn} onClick={() => setEditId(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {o.name}
                  {!o.is_active && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-tan)" }}> · inactive</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 2 }}>
                  {o.lat.toFixed(6)}, {o.lng.toFixed(6)} · {o.geofence_radius_m} m radius
                </div>
                {o.address && (
                  <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 2 }}>{o.address}</div>
                )}
              </div>
              {canConfigure && (
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button className={`${S.btn} ${S.btnSm}`} onClick={() => startEdit(o)} disabled={busy}>
                    Edit
                  </button>
                  <button
                    className={`${S.btn} ${S.btnSm}`}
                    onClick={() => setActive(o, !o.is_active)}
                    disabled={busy}
                  >
                    {o.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {adding && (
        <div className={S.formGrid} style={{ marginTop: 14 }}>
          <div className={S.formRow} style={{ gridColumn: "1 / -1" }}>
            <label className={S.formLabel}>Office name</label>
            <input
              className={S.formInput}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Bangalore"
              disabled={busy}
            />
          </div>
          <div className={S.formRow} style={{ gridColumn: "1 / -1" }}>
            <label className={S.formLabel}>Location — paste a Google Maps link</label>
            <input
              className={S.formInput}
              value={mapsUrl}
              onChange={e => applyMaps(e.target.value, "new")}
              placeholder="https://www.google.com/maps/… — fills the coordinates"
              disabled={busy}
            />
            {mapsMsg && (
              <span style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: mapsMsg.ok ? "var(--color-forest)" : "#B4553F" }}>
                {mapsMsg.text}
              </span>
            )}
          </div>
          <div className={S.formRow}>
            <label className={S.formLabel}>Latitude</label>
            <input
              className={S.formInput}
              value={form.lat}
              onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="12.9716"
              disabled={busy}
            />
          </div>
          <div className={S.formRow}>
            <label className={S.formLabel}>Longitude</label>
            <input
              className={S.formInput}
              value={form.lng}
              onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
              placeholder="77.5946"
              disabled={busy}
            />
          </div>
          <div className={S.formRow}>
            <label className={S.formLabel}>Check-in radius (m)</label>
            <select
              className={S.formInput}
              value={form.radius}
              onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
              disabled={busy}
            >
              {RADII.map(r => <option key={r} value={r}>{r} m</option>)}
            </select>
          </div>
          <div className={S.formRow} style={{ gridColumn: "1 / -1" }}>
            <label className={S.formLabel}>Address (optional)</label>
            <input
              className={S.formInput}
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              disabled={busy}
            />
          </div>
          <div className={S.formRow} style={{ gridColumn: "1 / -1", flexDirection: "row", gap: 8 }}>
            <button className={`${S.btn} ${S.btnPrimary}`} onClick={create} disabled={busy}>
              {busy ? "Adding…" : "Add office"}
            </button>
            <button
              className={S.btn}
              onClick={() => { setAdding(false); setForm(blank); setMapsUrl(""); setMapsMsg(null); }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`${S.toast} ${msg.ok ? S.toastOk : S.toastErr}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
