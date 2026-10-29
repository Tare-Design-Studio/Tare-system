"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/atoms";

/**
 * Landing page for the password-reset link (?token_hash=…) an owner/admin
 * creates on the Team page (POST /api/team/[memberId]/reset-link). Redeemed
 * here in the browser, not on the server, so link-preview pre-fetches
 * (WhatsApp etc.) don't burn it.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function init() {
      const token_hash = new URLSearchParams(window.location.search).get("token_hash");
      window.history.replaceState(null, "", window.location.pathname);
      const supabase = createClient();

      if (token_hash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type: "recovery" });
        if (verifyError) {
          setStatus("invalid");
          return;
        }
      }

      // Also covers a reload after the token was redeemed.
      const { data: { user } } = await supabase.auth.getUser();
      setStatus(user ? "ready" : "invalid");
    }
    init();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    // Sign out everywhere; a fresh sign-in goes through MFA if enrolled.
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <h1
          className="font-serif"
          style={{ fontSize: 36, lineHeight: 1, marginBottom: 8, fontWeight: 400, letterSpacing: -0.8 }}
        >
          {status === "invalid" ? "Link expired" : "Set a new password"}
        </h1>

        {status === "checking" && (
          <p style={{ fontSize: 14, color: "var(--color-tan)", lineHeight: 1.6 }}>Checking your link…</p>
        )}

        {status === "invalid" && (
          <>
            <p style={{ fontSize: 14, color: "var(--color-tan)", marginBottom: 32, lineHeight: 1.6 }}>
              This reset link is invalid, expired or already used. Ask an owner or admin for a new one.
            </p>
            <Link href="/login" style={{ fontSize: 14, color: "var(--color-ink)", fontWeight: 500 }}>
              Back to sign in
            </Link>
          </>
        )}

        {status === "ready" && (
          <>
            <p style={{ fontSize: 14, color: "var(--color-tan)", marginBottom: 32, lineHeight: 1.6 }}>
              Choose a password you haven&apos;t used here before.
            </p>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Input
                label="New password"
                type="password"
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                error={error ?? undefined}
              />
              <button
                type="submit"
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "15px",
                  borderRadius: 14,
                  border: "none",
                  background: saving ? "var(--color-line)" : "var(--color-ink)",
                  color: saving ? "var(--color-tan)" : "#F3EFE7",
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: -0.2,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {saving ? "Saving…" : "Save new password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
