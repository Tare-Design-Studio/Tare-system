"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/atoms";
import styles from "./team-access.module.css";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"team_member" | "site_engineer">("team_member");
  const [method, setMethod] = useState<"invite" | "direct">("invite");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (method === "direct" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          full_name: fullName,
          role,
          ...(method === "direct" && { password }),
        }),
      });

      if (res.ok) {
        setSuccessMessage(
          method === "direct" 
            ? `Account created for ${email}. They can now log in.` 
            : `Invitation sent to ${email}.`
        );
        setEmail("");
        setFullName("");
        setRole("team_member");
        setPassword("");
        setMethod("invite");
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Failed to process request.");
      }
    });
  };

  return (
    <div
      className={`${styles.card} ${styles.inviteCard}`}
    >
      <h2 className={`font-serif ${styles.inviteTitle}`}>
        Add a team member
      </h2>
      <p className={styles.inviteCopy}>
        Send an invitation link or create an account instantly with a temporary password.
      </p>

      {successMessage && (
        <div
          className={styles.statusGood}
          style={{ marginBottom: 20 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.formStack}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <label style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>
            Method
          </label>
          <div className={styles.roleGrid}>
            {[
              { value: "invite", label: "Email Invitation", dot: "#4A5A9A" },
              { value: "direct", label: "Set Password directly", dot: "#E2A64B" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMethod(opt.value as typeof method)}
                className={`${styles.roleButton} ${method === opt.value ? styles.roleButtonActive : ""}`}
                style={{
                  "--active-color": opt.dot,
                  "--active-bg": `${opt.dot}10`,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                } as React.CSSProperties}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: opt.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Full name"
          type="text"
          placeholder="Priya Rajan"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />

        <Input
          label="Email address"
          type="email"
          placeholder="priya@ascension.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {method === "direct" && (
          <Input
            label="Temporary Password"
            type="text"
            placeholder="Min 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <label style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>
            Role
          </label>
          <div className={styles.roleGrid}>
            {[
              { value: "team_member", label: "Team Member", dot: "#4A5A9A" },
              { value: "site_engineer", label: "Site Engineer", dot: "#E2A64B" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value as typeof role)}
                className={`${styles.roleButton} ${role === opt.value ? styles.roleButtonActive : ""}`}
                style={{
                  "--active-color": opt.dot,
                  "--active-bg": `${opt.dot}10`,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                } as React.CSSProperties}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: opt.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className={styles.statusBad}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className={`${styles.button} ${styles.buttonPrimary}`}
          style={{
            padding: "12px 20px",
            background: pending ? "var(--color-line)" : "var(--color-ink)",
            color: pending ? "var(--color-tan)" : "#F3EFE7",
            cursor: pending ? "not-allowed" : "pointer",
            width: "100%",
          }}
        >
          {pending ? (
            "Processing…"
          ) : method === "direct" ? (
            <>
              Create Account
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </>
          ) : (
            <>
              Send invitation
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

