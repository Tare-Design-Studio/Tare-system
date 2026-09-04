"use client";

import { useState } from "react";

// Door screen for the customer portal.
//
// The portal has no login — the hashed URL is the only credential, and anyone
// holding the link gets in. This asks who is looking so the studio can see the
// names behind an open alongside the IP / user-agent signals already recorded.
//
// It is a courtesy prompt, NOT authentication: the name is self-declared and
// unverified, and answering it grants nothing that the link did not already
// grant. It must never be treated as an identity claim.

export default function NameGate({ customerName }: { customerName: string }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    // Stored as a cookie so the prompt appears once per device rather than on
    // every page load. The server reads it and passes it to the portal RPC,
    // which records it against this open.
    document.cookie = `portal_viewer=${encodeURIComponent(trimmed)}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`;
    // Full reload rather than router.refresh(): the name has to be on the
    // cookie header of the request that fetches (and logs) the portal view.
    window.location.reload();
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
      <div style={{
        background: "var(--paper)",
        borderRadius: 20,
        boxShadow: "0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)",
        border: "1px solid rgba(30,28,24,.04)",
        padding: 32,
        width: "100%",
        maxWidth: 420,
      }}>
        <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 80, height: 35, objectFit: "contain", marginBottom: 20 }} />

        <div style={{ fontSize: 11, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
          Client Portal
        </div>
        <h1 className="serif" style={{ margin: "0 0 8px", fontSize: 34, lineHeight: 1.05, fontWeight: 400, letterSpacing: -0.8 }}>
          {customerName}
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Please tell us who is viewing, so we know who we&rsquo;re speaking with.
        </p>

        <form onSubmit={submit}>
          <label htmlFor="viewer-name" style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Your name
          </label>
          <input
            id="viewer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            autoComplete="name"
            placeholder="e.g. Ranganathan Srinivasan"
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: 15,
              fontFamily: "inherit",
              color: "var(--ink)",
              background: "var(--bg)",
              border: "1px solid var(--line-2)",
              borderRadius: 12,
              outline: "none",
              marginBottom: 16,
            }}
          />
          <button
            type="submit"
            disabled={!valid || saving}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
              color: "#F3EFE7",
              background: valid ? "var(--accent)" : "var(--line-2)",
              border: "none",
              borderRadius: 12,
              cursor: valid && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Opening…" : "View my project"}
          </button>
        </form>
      </div>
    </div>
  );
}
