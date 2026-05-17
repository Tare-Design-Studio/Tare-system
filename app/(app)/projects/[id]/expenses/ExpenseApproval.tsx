"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/atoms";

interface Props {
  projectId: string;
  expenseId: string;
  status: string;
  canApprove: boolean;
}

export function ExpenseApproval({ projectId, expenseId, status, canApprove }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tone = status === "approved" ? "forest" : status === "pending" ? "amber" : "rust";

  if (status !== "pending" || !canApprove) {
    return <Chip label={status} tone={tone} size="sm" />;
  }

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { action };
    if (action === "reject") body.rejection_reason = reason.trim();

    const res = await fetch(`/api/projects/${projectId}/expenses/${expenseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => null);
      setError(typeof d?.error === "string" ? d.error : "Action failed");
      setBusy(false);
    }
  }

  if (rejecting) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Rejection reason"
          autoFocus
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--color-line)", fontSize: 11, fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => act("reject")} disabled={busy || !reason.trim()} style={{ ...actBtn, background: "var(--color-rust)", color: "#fff" }}>
            Confirm
          </button>
          <button onClick={() => { setRejecting(false); setReason(""); }} disabled={busy} style={actBtn}>
            Cancel
          </button>
        </div>
        {error && <div style={{ color: "var(--color-rust)", fontSize: 10 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => act("approve")} disabled={busy} style={{ ...actBtn, background: "var(--color-forest)", color: "#fff" }}>
          Approve
        </button>
        <button onClick={() => setRejecting(true)} disabled={busy} style={{ ...actBtn, border: "1px solid var(--color-rust)", color: "var(--color-rust)" }}>
          Reject
        </button>
      </div>
      {error && <div style={{ color: "var(--color-rust)", fontSize: 10 }}>{error}</div>}
    </div>
  );
}

const actBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-line)",
  background: "transparent",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};
