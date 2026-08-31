"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

// The single source of the unread count, for the nav badge and the Bridge
// sidebar alike.
//
// The cost model is the whole point of this file:
//
//   per navigation   zero network — the count lives in React state, and
//                    nothing here refetches on a route change;
//   per session      one RPC on mount;
//   per message      one realtime event that is already on the wire, handled
//                    by mutating a number. No fetch, no router.refresh().
//
// The naive version — fetch the counts in the layout — would put a request on
// every page load for every user, which is exactly the "slow down the rest of
// the app" failure this design exists to avoid.

export type ChatConversation = {
  conversation_id: string;
  kind: "project" | "dm";
  project_id: string | null;
  peer_id: string | null;
  title: string | null;
  unread: number;
  last_message_at: string | null;
  preview: string | null;
};

type Ctx = {
  conversations: ChatConversation[];
  totalUnread: number;
  /** Zero a thread locally the moment it is opened, before the server round trip. */
  markRead: (conversationId: string) => void;
  /** Re-pull from the server. For after sending, or opening a brand-new DM. */
  refresh: () => void;
};

const ChatBadgeContext = createContext<Ctx>({
  conversations: [],
  totalUnread: 0,
  markRead: () => {},
  refresh: () => {},
});

export const useChatBadge = () => useContext(ChatBadgeContext);

// Realtime events that arrive while the socket is asleep are not replayed, so
// a tab hidden longer than this resyncs on return rather than trusting its
// local count.
const STALE_AFTER_MS = 60_000;

export function ChatBadgeProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const supabaseRef = useRef(createClient());
  const hiddenSinceRef = useRef<number | null>(null);
  // Read inside the realtime handler, which closes over its first render.
  const knownRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const res = await fetch("/api/chat/conversations");
    if (!res.ok) return;
    const json = await res.json();
    const rows: ChatConversation[] = json.conversations ?? [];
    setConversations(rows);
    knownRef.current = new Set(rows.map((c) => c.conversation_id));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const markRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.conversation_id === conversationId ? { ...c, unread: 0 } : c,
      ),
    );
  }, []);

  // One app-wide subscription to bridge_messages. Deliberately NOT part of
  // RealtimeRefresher: that calls router.refresh(), which would re-run every
  // server component on the page on each incoming chat message. This handler
  // only ever adjusts a number.
  useEffect(() => {
    const sb = supabaseRef.current;
    const channel = sb
      .channel(`chat_badge_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bridge_messages" },
        (payload) => {
          const row = payload.new as {
            conversation_id: string | null;
            author_id: string;
            body: string | null;
            created_at: string;
          };
          if (!row.conversation_id) return;
          // Your own message is not unread to you.
          if (row.author_id === userId) return;

          // A conversation not in the local list is either brand new (a first
          // DM) or one this client has never seen. Only a refetch can name it,
          // and it happens once per unknown thread rather than per message.
          if (!knownRef.current.has(row.conversation_id)) {
            refresh();
            return;
          }

          setConversations((prev) =>
            prev.map((c) =>
              c.conversation_id === row.conversation_id
                ? {
                    ...c,
                    unread: c.unread + 1,
                    last_message_at: row.created_at,
                    preview: row.body?.slice(0, 80) ?? c.preview,
                  }
                : c,
            ),
          );
        },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [userId, refresh]);

  // RLS keeps this to threads the user may see, so an INSERT here means
  // somebody just opened a DM with them.
  useEffect(() => {
    const sb = supabaseRef.current;
    const channel = sb
      .channel(`chat_conv_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_conversations" },
        () => { refresh(); },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [refresh]);

  // Catch up after the tab has been asleep long enough to have missed events.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        return;
      }
      const since = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (since && Date.now() - since > STALE_AFTER_MS) refresh();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0),
    [conversations],
  );

  const value = useMemo(
    () => ({ conversations, totalUnread, markRead, refresh }),
    [conversations, totalUnread, markRead, refresh],
  );

  return (
    <ChatBadgeContext.Provider value={value}>
      {children}
    </ChatBadgeContext.Provider>
  );
}

/** The count itself: a pill on a nav icon, or nothing when there is nothing. */
export function ChatBadge({ size = 16 }: { size?: number }) {
  const { totalUnread } = useChatBadge();
  if (totalUnread <= 0) return null;

  const label = totalUnread > 99 ? "99+" : String(totalUnread);

  return (
    <span
      aria-label={`${totalUnread} unread messages`}
      style={{
        position: "absolute", top: -4, right: -6,
        minWidth: size, height: size, padding: "0 4px",
        borderRadius: size, background: "var(--color-rust, #B4451F)",
        color: "#FFF", fontSize: 10, fontWeight: 700, lineHeight: `${size}px`,
        textAlign: "center", fontVariantNumeric: "tabular-nums",
        boxShadow: "0 0 0 2px var(--color-paper, #FBF8F2)",
        pointerEvents: "none",
      }}
    >
      {label}
    </span>
  );
}
