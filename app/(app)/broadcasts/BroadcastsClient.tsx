"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../PageHeader";

type Broadcast = {
  id: string;
  body: string;
  created_at: string;
  is_acknowledged: boolean;
  author?: string;
  recipient_count?: number;
  ack_count?: number;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function BroadcastsClient({
  broadcasts: initial,
  isOwner,
}: {
  broadcasts: Broadcast[];
  isOwner: boolean;
}) {
  const [broadcasts, setBroadcasts] = useState(initial);
  const [acking, setAcking] = useState<string | null>(null);
  const router = useRouter();

  async function acknowledge(id: string) {
    setAcking(id);
    try {
      const res = await fetch(`/api/broadcasts/${id}/ack`, { method: "PATCH" });
      if (res.ok) {
        // Mark as acknowledged in local state
        setBroadcasts((prev) =>
          prev.map((b) => (b.id === id ? { ...b, is_acknowledged: true } : b))
        );
        // Refresh server data so owner sees updated state
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        console.error("Acknowledge failed:", res.status, body);
      }
    } catch (err) {
      console.error("Acknowledge error:", err);
    }
    setAcking(null);
  }

  const unacked = broadcasts.filter((b) => !b.is_acknowledged);
  const acked = broadcasts.filter((b) => b.is_acknowledged);

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Broadcasts"
        subtitle={`Communications · ${broadcasts.length} total`}
      />

      {/* Unacknowledged */}
      {unacked.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
            Pending acknowledgement
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {unacked.map((b) => (
              <BroadcastRow key={b.id} b={b} isOwner={isOwner} acking={acking} onAck={acknowledge} />
            ))}
          </div>
        </div>
      )}

      {/* Acknowledged / sent */}
      {acked.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
            {isOwner ? "All broadcasts" : "Acknowledged"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {acked.map((b) => (
              <BroadcastRow key={b.id} b={b} isOwner={isOwner} acking={acking} onAck={acknowledge} />
            ))}
          </div>
        </div>
      )}

      {broadcasts.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--color-tan)", fontSize: 14 }}>
          No broadcasts yet.
        </div>
      )}
    </div>
  );
}

function BroadcastRow({
  b, isOwner, acking, onAck,
}: {
  b: Broadcast;
  isOwner: boolean;
  acking: string | null;
  onAck: (id: string) => void;
}) {
  return (
    <div style={{
      padding: "16px 20px",
      borderRadius: 18,
      background: "var(--color-paper-light)",
      border: b.is_acknowledged ? "1px solid rgba(30,28,24,.04)" : "1px solid var(--color-amber)",
      boxShadow: "0 1px 0 #FFF inset, 0 2px 20px -10px rgba(30,28,24,.1)",
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          {/* Author + timestamp */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
            {b.author && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink)" }}>{b.author}</span>
            )}
            <span style={{ fontSize: 11, color: "var(--color-tan)" }}>{fmtDate(b.created_at)}</span>
          </div>

          {/* Body */}
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-ink)" }}>{b.body}</div>

          {/* Owner: recipient stats */}
          {isOwner && b.recipient_count != null && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-tan)" }}>
              {b.ack_count} / {b.recipient_count} acknowledged
              {b.recipient_count > 0 && (
                <span style={{ display: "inline-block", marginLeft: 10, height: 4, width: 80, borderRadius: 99, background: "var(--color-line)", verticalAlign: "middle", position: "relative" }}>
                  <span style={{ display: "block", height: "100%", width: `${(b.ack_count! / b.recipient_count) * 100}%`, background: "var(--color-forest)", borderRadius: 99 }} />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Ack button — team member only */}
        {!isOwner && !b.is_acknowledged && (
          <button
            onClick={() => onAck(b.id)}
            disabled={acking === b.id}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10,
              background: "var(--color-forest)", color: "#FFF",
              border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              flexShrink: 0, opacity: acking === b.id ? 0.6 : 1,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Acknowledge
          </button>
        )}

        {!isOwner && b.is_acknowledged && (
          <span style={{ fontSize: 11, color: "var(--color-forest)", fontWeight: 600, flexShrink: 0 }}>Acknowledged</span>
        )}
      </div>
    </div>
  );
}
