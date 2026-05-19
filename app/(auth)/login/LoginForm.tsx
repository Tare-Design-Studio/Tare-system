"use client";

import { useActionState, useState } from "react";
import { signIn } from "../actions";
import { Input } from "@/components/atoms";

const ROLES = [
  { dot: "#2D6A4F", label: "Owner", sub: "Full access · all surfaces" },
  { dot: "#4A5A9A", label: "Team Member", sub: "Design work · drawings · bridge" },
  { dot: "#E2A64B", label: "Site Engineer", sub: "Materials · progress · check-in" },
];

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);
  const [showPass, setShowPass] = useState(false);

  return (
    <div style={{ display: "flex", width: "100%", minHeight: "100vh" }} className="auth-split">
      {/* Left panel — branding */}
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
        {/* Background grid */}
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

        {/* Brand */}
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                background: "#F3EFE7",
                borderRadius: 12,
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 80, height: 35, objectFit: "contain" }} />
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ position: "relative" }}>
          <div
            className="font-serif"
            style={{ fontSize: 52, lineHeight: 1.05, letterSpacing: -1.5, marginBottom: 20 }}
          >
            Every project,<br />every person,<br />one system.
          </div>
          <p style={{ fontSize: 14, opacity: 0.6, lineHeight: 1.7, maxWidth: 340 }}>
            From design table to construction site — Tare system keeps your entire practice in sync.
          </p>

          {/* Role cards (decorative) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32 }}>
            {ROLES.map((r) => (
              <div
                key={r.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.dot, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{r.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", fontSize: 11, opacity: 0.35 }}>
          Powered by Ascension
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
          {/* Mobile-only logo */}
          <div className="auth-mobile-logo" style={{ display: "none", justifyContent: "center", marginBottom: 36 }}>
            <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 150, height: 66, objectFit: "contain" }} />
          </div>
          <h1
            className="font-serif"
            style={{ fontSize: 36, lineHeight: 1, marginBottom: 8, fontWeight: 400, letterSpacing: -0.8 }}
          >
            Sign in
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-tan)", marginBottom: 32, lineHeight: 1.6 }}>
            Enter your credentials to continue.
          </p>

          <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Input
              label="Email"
              name="email"
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              required
            />

            <Input
              label="Password"
              name="password"
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              error={state?.error}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  style={{ background: "none", border: "none", padding: 12, cursor: "pointer", color: "var(--color-tan)", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              }
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
                transition: "opacity 0.15s",
                fontFamily: "var(--font-sans)",
              }}
            >
              {pending ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17 17 7" />
                    <path d="M8 7h9v9" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 767px) {
          .auth-split { flex-direction: column; }
          .auth-left { display: none !important; }
          .auth-right { width: 100% !important; min-height: 100vh; padding: 40px 20px !important; }
          .auth-mobile-logo { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
