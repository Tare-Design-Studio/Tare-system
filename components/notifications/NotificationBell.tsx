"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface NotifRow {
  id: string;
  is_read: boolean;
  notifications: {
    id: string;
    kind: string;
    severity: string;
    title: string;
    body: string | null;
    source_type: string;
    source_id: string | null;
    created_at: string;
  } | null;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-rust)",
  warning: "var(--color-amber)",
  info: "var(--color-forest)",
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Once read, a notification disappears from the popup — only unread are shown.
  const visibleItems = items.filter(r => !r.is_read);
  const unreadCount = visibleItems.length;

  // Keep the PWA home-screen icon badge in step with the real unread count.
  // The service worker never set it, so on iOS the OS applied its own "1" on
  // the first push and nothing ever cleared it — the icon read "1" no matter
  // how many notifications were actually unread, or whether any were.
  // setAppBadge is unsupported on desktop Safari and older Android; the guard
  // keeps this a no-op there rather than throwing.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    // Errors are swallowed: a failed badge update must never break the bell.
    if (unreadCount > 0) void nav.setAppBadge(unreadCount).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unreadCount]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notifications?limit=30");
    if (res.ok) {
      const json = await res.json();
      setItems(json.data ?? []);
    }
    setLoading(false);
  }, []);

  // Initial fetch
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime subscription — reacts to INSERT and UPDATE on
  // notification_recipients. UPDATE matters because a collapsed bridge thread
  // is raised again by flipping is_read back to false (099), and cleared by
  // flipping it true from another tab — neither is an INSERT.
  useEffect(() => {
    const sb = supabaseRef.current;
    // Generate a unique channel name to prevent conflicts if useEffect re-runs quickly
    const channelName = `notif_bell_${Math.random().toString(36).substring(2)}`;
    const channel = sb
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_recipients" },
        () => { fetchNotifications(); }
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function markAllRead() {
    const unread = items.filter(r => !r.is_read).map(r => r.id);
    if (!unread.length) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_ids: unread, action: "mark_read" }),
    });
    setItems(prev => prev.map(r => ({ ...r, is_read: true, read_at: new Date().toISOString() })));
  }

  async function markRead(recipientId: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_ids: [recipientId], action: "mark_read" }),
    });
    setItems(prev => prev.map(r => r.id === recipientId ? { ...r, is_read: true } : r));
  }

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifications(); }}
        style={{
          position: "relative", width: 40, height: 40, borderRadius: 12,
          background: open ? "var(--color-ink)" : "rgba(30,28,24,.04)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, border: "none", cursor: "pointer",
          color: open ? "#F3EFE7" : "var(--color-ink)", transition: "background .15s",
        }}
        title="Notifications"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/>
          <path d="M10 21a2 2 0 0 0 4 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 8, right: 9,
            minWidth: 7, height: 7, borderRadius: "50%",
            background: "var(--color-forest)",
            border: "2px solid var(--color-paper-light)",
          }}/>
        )}
      </button>

      {open && (
        <div className="dropdown-mobile-safe" style={{
          position: "absolute", top: 48, right: 0, zIndex: 200,
          width: "min(360px, calc(100vw - 24px))", maxHeight: 480, overflowY: "auto",
          background: "var(--color-paper-light)",
          borderRadius: 16, border: "1px solid var(--line-2)",
          boxShadow: "0 8px 40px -12px rgba(30,28,24,.25)",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px 10px", borderBottom: "1px solid var(--line-2)",
            position: "sticky", top: 0, background: "var(--color-paper-light)", zIndex: 1,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>
              Notifications {unreadCount > 0 && <span style={{ color: "var(--color-forest)" }}>({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{
                fontSize: 11, color: "var(--color-tan)", background: "none", border: "none",
                cursor: "pointer", textDecoration: "underline",
              }}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {loading && visibleItems.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-tan)", fontSize: 13 }}>
              Loading…
            </div>
          ) : visibleItems.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-tan)", fontSize: 13 }}>
              No notifications
            </div>
          ) : (
            visibleItems.map(row => {
              const n = row.notifications;
              if (!n) return null;
              const dot = SEVERITY_COLOR[n.severity] ?? "var(--color-tan)";
              return (
                <div
                  key={row.id}
                  onClick={() => markRead(row.id)}
                  style={{
                    display: "flex", gap: 10, padding: "12px 16px",
                    borderBottom: "1px solid var(--line-2)",
                    background: "rgba(45,106,79,.04)",
                    cursor: "pointer",
                    transition: "background .1s",
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: dot,
                    flexShrink: 0, marginTop: 5,
                  }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: "var(--color-ink)", lineHeight: 1.35,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{
                        fontSize: 12, color: "var(--color-tan)", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
