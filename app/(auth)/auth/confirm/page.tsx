"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side auth confirm page.
 *
 * Supabase invite/magic-link emails may redirect here with either:
 *   - Query params: ?token_hash=xxx&type=invite  (handled by /api/auth/callback)
 *   - Hash fragment: #access_token=xxx&type=invite (only readable client-side)
 *
 * This page handles the hash-fragment case by letting the Supabase client
 * auto-detect and exchange the tokens from the URL, then routing to /accept.
 */
export default function AuthConfirmPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuth() {
      const supabase = createClient();

      // The Supabase client automatically picks up tokens from the URL hash
      // when onAuthStateChange fires. We listen for the session.
      const { data: { session }, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      if (session) {
        // Check if this user needs to set a password
        const isRecovery = window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery");

        const { data: profile } = await supabase
          .from("users")
          .select("is_active")
          .eq("id", session.user.id)
          .single();

        if (isRecovery || (profile && !profile.is_active)) {
          router.replace("/accept");
        } else {
          router.replace("/");
        }
        return;
      }

      // No session from hash — try query-param approach
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = params.get("type");

      if (token_hash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as "invite" | "signup" | "magiclink" | "recovery" | "email",
        });

        if (verifyError) {
          setError(verifyError.message);
          return;
        }

        if (type === "invite") {
          router.replace("/accept");
        } else {
          router.replace("/");
        }
        return;
      }

      // Nothing to process
      setError("Invalid or expired invitation link. Please request a new invite.");
    }

    handleAuth();
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-paper)",
        padding: 24,
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        {error ? (
          <>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: "rgba(220,38,38,0.1)",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2
              className="font-serif"
              style={{
                fontSize: 24,
                fontWeight: 400,
                marginBottom: 8,
                color: "var(--color-ink)",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--color-tan)",
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              {error}
            </p>
            <a
              href="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 12,
                background: "var(--color-ink)",
                color: "#F3EFE7",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: "var(--font-sans)",
              }}
            >
              Go to Login
            </a>
          </>
        ) : (
          <>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: "rgba(45,106,79,0.1)",
                color: "var(--color-forest)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: "spin 1s linear infinite" }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <h2
              className="font-serif"
              style={{
                fontSize: 24,
                fontWeight: 400,
                marginBottom: 8,
                color: "var(--color-ink)",
              }}
            >
              Confirming your invitation
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--color-tan)",
                lineHeight: 1.6,
              }}
            >
              Please wait while we verify your account…
            </p>
          </>
        )}
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
