"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../../actions";
import { Input } from "@/components/atoms";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);
  const sent = state !== null && "sent" in state;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <h1
          className="font-serif"
          style={{ fontSize: 36, lineHeight: 1, marginBottom: 8, fontWeight: 400, letterSpacing: -0.8 }}
        >
          Forgot password
        </h1>

        {sent ? (
          <>
            <p style={{ fontSize: 14, color: "var(--color-tan)", marginBottom: 32, lineHeight: 1.6 }}>
              If an account exists for that email, a reset link is on its way. Open it on any device
              to choose a new password. Check spam if it hasn&apos;t arrived in a few minutes.
            </p>
            <Link href="/login" style={{ fontSize: 14, color: "var(--color-ink)", fontWeight: 500 }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--color-tan)", marginBottom: 32, lineHeight: 1.6 }}>
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Input
                label="Email"
                name="email"
                type="email"
                placeholder="your@email.com"
                autoComplete="email"
                required
                error={state !== null && "error" in state ? state.error : undefined}
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
                  cursor: pending ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {pending ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <div style={{ marginTop: 24 }}>
              <Link href="/login" style={{ fontSize: 13, color: "var(--color-tan)" }}>
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
