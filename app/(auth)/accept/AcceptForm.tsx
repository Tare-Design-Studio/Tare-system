"use client";

import { useActionState, useState } from "react";
import { setPassword } from "../actions";
import { Input } from "@/components/atoms";

export function AcceptForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(setPassword, null);
  const [showPass, setShowPass] = useState(false);

  const eyeIcon = (
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
  );

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
          <div className="font-serif" style={{ fontSize: 52, lineHeight: 1.05, letterSpacing: -1.5, marginBottom: 20 }}>
            Welcome to<br />ArchitectOS.
          </div>
          <p style={{ fontSize: 14, opacity: 0.6, lineHeight: 1.7, maxWidth: 340 }}>
            Your invitation has been accepted. Set a password to secure your account and get started.
          </p>
        </div>

        <div style={{ position: "relative", fontSize: 11, opacity: 0.35 }}>
          © 2025 Ascension Architecture · Powered by ArchitectOS
        </div>
      </div>

      {/* Right panel */}
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
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(45,106,79,0.1)",
              border: "1px solid rgba(45,106,79,0.2)",
              marginBottom: 24,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#2D6A4F" }}>Invitation accepted</span>
          </div>

          <h1
            className="font-serif"
            style={{ fontSize: 36, lineHeight: 1, marginBottom: 8, fontWeight: 400, letterSpacing: -0.8 }}
          >
            Set your password
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-tan)", marginBottom: 8, lineHeight: 1.6 }}>
            Hi {name}. Choose a password for your ArchitectOS account.
          </p>
          <p style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 28, lineHeight: 1.5 }}>
            Minimum 8 characters.
          </p>

          <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Input
              label="Password"
              name="password"
              type={showPass ? "text" : "password"}
              placeholder="Choose a password"
              autoComplete="new-password"
              required
              suffix={eyeIcon}
            />

            <Input
              label="Confirm password"
              name="confirm"
              type={showPass ? "text" : "password"}
              placeholder="Repeat your password"
              autoComplete="new-password"
              required
              error={state?.error}
            />

            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                padding: "15px",
                borderRadius: 14,
                border: "none",
                background: pending ? "var(--color-line)" : "var(--color-forest)",
                color: pending ? "var(--color-tan)" : "#FBF8F2",
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
              {pending ? "Setting password…" : "Set Password & Continue"}
            </button>
          </form>
        </div>
      </div>
      <style>{`
        @media (max-width: 767px) {
          .auth-split { flex-direction: column; }
          .auth-left { flex: none !important; padding: 24px 20px 20px !important; min-height: 0; }
          .auth-left .font-serif { font-size: 32px !important; }
          .auth-right { width: 100% !important; padding: 24px 20px 40px !important; }
        }
      `}</style>
    </div>
  );
}
