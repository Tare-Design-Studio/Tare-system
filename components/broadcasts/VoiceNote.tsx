"use client";

import { useState } from "react";

// Playback for a voice broadcast. The audio lives in a private bucket, so the
// URL is signed on demand rather than embedded in the page — signing every
// broadcast up front would hand out links nobody plays.

export default function VoiceNote({ path, durationS }: { path: string; durationS?: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/broadcasts/voice?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load audio");
      setUrl((await res.json()).url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audio");
    } finally {
      setLoading(false);
    }
  }

  if (url) {
    return <audio controls autoPlay src={url} style={{ height: 34, maxWidth: "100%", marginTop: 6 }} />;
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={load}
        disabled={loading}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999,
          fontSize: 12, fontWeight: 600, cursor: loading ? "default" : "pointer",
          background: "transparent", color: "var(--color-ink)", border: "1px solid var(--color-line)",
        }}
      >
        <span aria-hidden>▶</span>
        {loading ? "Loading…" : `Voice note${durationS ? ` · ${durationS}s` : ""}`}
      </button>
      {error && <div style={{ fontSize: 11, color: "#B4553F", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
