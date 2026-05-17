"use client";

import { useActionState } from "react";
import { verifyMfa } from "../../actions";
import { Input } from "@/components/atoms";

export function VerifyForm() {
  const [state, formAction, pending] = useActionState(verifyMfa, null);

  return (
    <div style={{ display: "flex", width: "100%", minHeight: "100vh" }} className="auth-split">
      {/* Left panel */}
      <div
        className="auth-left"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
          background: "var(--color-slate)",
          color: "#F3EFE7",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage:
              "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "#F3EFE7",
              color: "var(--color-slate)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20V8l8-5 8 5v12" />
              <path d="M4 20h16" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>ArchitectOS</div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, opacity: 0.5, textTransform: "uppercase", marginTop: 1 }}>
              Ascension Architecture
            </div>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F3EFE7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="font-serif" style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: -1 }}>
              Two-factor<br />verification
            </div>
          </div>
          <p style={{ fontSize: 14, opacity: 0.6, lineHeight: 1.7, maxWidth: 340 }}>
            Your account is protected with two-factor authentication. Open your authenticator app to get the current code.
          </p>
        </div>

        <div style={{ position: "relative", fontSize: 11, opacity: 0.35 }}>
          © 2025 Ascension Architecture · Powered by ArchitectOS
        </div>
      </div>

      {/* Right panel — form */}
      <div
        className="auth-right"
        style={{
          width: 480,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 48px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1
            className="font-serif"
            style={{ fontSize: 36, lineHeight: 1, marginBottom: 8, fontWeight: 400, letterSpacing: -0.8 }}
          >
            Enter code
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-tan)", marginBottom: 32, lineHeight: 1.6 }}>
            Enter the 6-digit code from your authenticator app.
          </p>

          <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Input
              label="Authentication code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              autoFocus
              error={state?.error}
              style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
            />

            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                padding: "15px",
                borderRadius: 14,
                border: "none",
                background: pending ? "var(--color-line)" : "var(--color-ink)",
                color: pending ? "var(--color-tan)" : "#F3EFE7",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: -0.2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: pending ? "not-allowed" : "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              {pending ? "Verifying…" : "Verify"}
            </button>

            <a
              href="/login"
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 13,
                color: "var(--color-tan)",
                textDecoration: "none",
                marginTop: 4,
              }}
            >
              ← Back to sign in
            </a>
          </form>
        </div>
      </div>
      <style>{`
        @media (max-width: 767px) {
          .auth-split { flex-direction: column; }
          .auth-left { flex: none !important; padding: 24px 20px 20px !important; min-height: 0; }
          .auth-right { width: 100% !important; padding: 24px 20px 40px !important; }
        }
      `}</style>
    </div>
  );
}
