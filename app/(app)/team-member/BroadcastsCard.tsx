"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Broadcast = {
  id: string;
  body: string;
  created_at: string;
  sender_name: string;
  is_acknowledged: boolean;
};

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

export default function BroadcastsCard({ broadcasts: initial }: { broadcasts: Broadcast[] }) {
  const [broadcasts, setBroadcasts] = useState(initial);
  const [acking, setAcking] = useState<string | null>(null);
  const router = useRouter();

  const unacknowledged = broadcasts.filter((b) => !b.is_acknowledged);
  const latest = broadcasts[0] ?? null;

  async function acknowledge(id: string) {
    setAcking(id);
    try {
      const res = await fetch(`/api/broadcasts/${id}/ack`, { method: "PATCH" });
      if (res.ok) {
        setBroadcasts((prev) =>
          prev.map((b) => (b.id === id ? { ...b, is_acknowledged: true } : b))
        );
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

  return (
    <div style={{ ...C }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>Broadcasts</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {unacknowledged.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--color-rust)", color: "#FFF" }}>
              {unacknowledged.length}
            </span>
          )}
          <Link href="/broadcasts" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 9, background: "rgba(30,28,24,.04)", color: "var(--color-ink)", textDecoration: "none" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7"/><path d="M8 7h9v9"/>
            </svg>
          </Link>
        </div>
      </div>

      {!latest ? (
        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>No broadcasts.</div>
      ) : (
        <div style={{
          padding: "12px 14px", borderRadius: 14,
          background: latest.is_acknowledged ? "var(--color-bg)" : "#F3EDE0",
          border: latest.is_acknowledged ? "none" : "1px solid var(--color-amber)",
        }}>
          <div style={{ fontSize: 11, color: "var(--color-tan)", marginBottom: 6, fontWeight: 500 }}>
            From {latest.sender_name}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-ink)", marginBottom: 10 }}>
            {latest.body}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "var(--color-tan)" }}>
              {latest.created_at ? new Date(latest.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
            </span>
            {!latest.is_acknowledged ? (
              <button
                onClick={() => acknowledge(latest.id)}
                disabled={acking === latest.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 8,
                  background: "var(--color-forest)", color: "#FFF",
                  border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                  opacity: acking === latest.id ? 0.6 : 1,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Acknowledge
              </button>
            ) : (
              <span style={{ fontSize: 10, color: "var(--color-forest)", fontWeight: 600 }}>Acknowledged</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
