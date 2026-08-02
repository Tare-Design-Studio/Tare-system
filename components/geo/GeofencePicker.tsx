"use client";

import { useState } from "react";
import { parseMapsUrl } from "@/lib/geo/mapsUrl";

/**
 * Site geofence input. Replaces the raw latitude/longitude number fields:
 * the owner pastes a Google Maps link, coordinates are extracted from it, and
 * the geofence radius is chosen from presets. Coordinates stay visible (and
 * clearable) so an existing project's saved position is never a mystery.
 */

const RADIUS_PRESETS = [100, 200, 500, 1000] as const;
export const DEFAULT_RADIUS_M = 200;

type Props = {
  lat: string;
  lng: string;
  radius: string;
  onChange: (next: { lat: string; lng: string; radius: string }) => void;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
};

export default function GeofencePicker({ lat, lng, radius, onChange, labelStyle, inputStyle }: Props) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const hasCoords = lat !== "" && lng !== "";
  const effectiveRadius = radius === "" ? String(DEFAULT_RADIUS_M) : radius;

  function applyUrl(value: string) {
    setUrl(value);
    if (!value.trim()) { setMsg(null); return; }

    const parsed = parseMapsUrl(value);
    if (parsed.ok) {
      onChange({ lat: String(parsed.lat), lng: String(parsed.lng), radius: effectiveRadius });
      setMsg({ ok: true, text: `Location set — ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}` });
    } else if (parsed.reason === "short_link") {
      setMsg({ ok: false, text: "Short links (maps.app.goo.gl) don't contain coordinates. Open it in Maps, then copy the full URL from the address bar." });
    } else {
      setMsg({ ok: false, text: "No coordinates found in that link." });
    }
  }

  function clear() {
    onChange({ lat: "", lng: "", radius: "" });
    setUrl("");
    setMsg(null);
  }

  return (
    <div style={{ padding: 16, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-2)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Site Geofence
      </div>

      <div>
        <label style={labelStyle}>Google Maps link</label>
        <input
          style={inputStyle}
          type="text"
          value={url}
          onChange={(e) => applyUrl(e.target.value)}
          placeholder="Paste a Google Maps URL — coordinates fill in automatically"
        />
        {msg && (
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: msg.ok ? "var(--color-forest)" : "var(--color-clay, #B4553F)" }}>
            {msg.text}
          </div>
        )}
      </div>

      {hasCoords ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--color-tan)" }}>
            <span>
              Pinned at <strong style={{ color: "var(--color-ink)" }}>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</strong>
            </span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-forest)", textDecoration: "underline" }}
            >
              View
            </a>
            <button
              type="button"
              onClick={clear}
              style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, fontSize: 12, color: "var(--color-tan)", textDecoration: "underline", cursor: "pointer" }}
            >
              Clear
            </button>
          </div>

          <div>
            <label style={labelStyle}>Check-in radius</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {RADIUS_PRESETS.map((r) => {
                const active = Number(effectiveRadius) === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onChange({ lat, lng, radius: String(r) })}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: active ? "var(--color-ink)" : "transparent",
                      color: active ? "#FBF8F2" : "var(--color-tan)",
                      border: `1px solid ${active ? "var(--color-ink)" : "var(--color-line)"}`,
                    }}
                  >
                    {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 6 }}>
              Site check-ins outside this radius are flagged.
            </div>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: "var(--color-tan)", lineHeight: 1.5 }}>
          No site location set. Paste a Maps link above to enable geofenced check-ins.
        </div>
      )}
    </div>
  );
}
