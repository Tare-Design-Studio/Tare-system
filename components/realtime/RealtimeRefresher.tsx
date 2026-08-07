"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Every content table in the supabase_realtime publication (migration 071),
// minus notification_recipients — NotificationBell has its own dedicated
// subscription for it, so a full router.refresh() here would be redundant.
const ALL_TABLES = [
  "updates",
  "owner_broadcasts",
  "owner_broadcast_recipients",
  "member_tasks",
  "team_daily_tasks",
  "expenses",
  "material_plan",
  "material_consumption",
  "site_check_ins",
  "enquiries",
  "enquiry_reminders",
  "payment_records",
  "payment_schedule",
  "projects",
  "project_assignments",
  "calendar_events",
  "personal_reminders",
  "media_assets",
] as const;

type ContentTable = (typeof ALL_TABLES)[number];

// Per-route table scoping. Each entry lists only the published tables a route
// actually renders (derived from the .from() calls in each page + its
// components), so a client subscribes to a handful of tables instead of all 18.
// This cuts the WAL work Supabase Realtime does per connected client.
//
// Keys are matched by longest pathname prefix. A route with no entry falls back
// to ALL_TABLES, so an unmapped page never silently loses live updates.
const ROUTE_TABLES: Array<{ prefix: string; tables: ContentTable[] }> = [
  // Most specific first (longest-prefix match walks this top-down).
  {
    prefix: "/projects/",
    tables: [
      "projects",
      "expenses",
      "material_plan",
      "material_consumption",
      "media_assets",
      "payment_records",
      "updates",
    ],
  },
  { prefix: "/projects", tables: ["projects"] },
  { prefix: "/calendar", tables: ["calendar_events", "updates"] },
  { prefix: "/tasks", tables: ["member_tasks"] },
  { prefix: "/finance", tables: ["payment_records", "payment_schedule", "projects"] },
  { prefix: "/enquiries", tables: ["enquiries"] },
  { prefix: "/customers", tables: ["payment_records", "projects"] },
  {
    prefix: "/team",
    tables: [
      "owner_broadcasts",
      "owner_broadcast_recipients",
      "member_tasks",
      "team_daily_tasks",
      "site_check_ins",
      "project_assignments",
    ],
  },
  { prefix: "/updates", tables: ["updates"] },
  { prefix: "/site", tables: ["enquiry_reminders", "project_assignments"] },
  // bridge_messages is deliberately absent: BridgeClient holds its own
  // subscription and appends the new message to the thread. router.refresh()
  // here would re-run the page's server components on every chat message and
  // fight that append.
  { prefix: "/bridge", tables: ["projects", "project_assignments"] },
  { prefix: "/broadcasts", tables: ["owner_broadcasts", "owner_broadcast_recipients"] },
  // Overview ("/") — the dashboard pulls from many content tables.
  {
    prefix: "/",
    tables: [
      "updates",
      "owner_broadcasts",
      "owner_broadcast_recipients",
      "member_tasks",
      "team_daily_tasks",
      "expenses",
      "site_check_ins",
      "enquiries",
      "calendar_events",
      "personal_reminders",
      "project_assignments",
      "projects",
    ],
  },
];

function tablesForPath(pathname: string): readonly ContentTable[] {
  // Routes that fetch no published content table (performance, settings)
  // still get an explicit empty set rather than the all-tables fallback.
  const STATIC_PREFIXES = ["/performance", "/settings"];
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return [];
  // Longest matching prefix wins; "/" entry is last so it only matches when
  // nothing more specific does.
  const match = ROUTE_TABLES.find(({ prefix }) => pathname.startsWith(prefix));
  return match ? match.tables : ALL_TABLES;
}

const DEBOUNCE_MS = 800;

// Single global subscriber: listens for changes on the current route's content
// tables and calls router.refresh() to re-run its server components. Refreshes
// are debounced (collapse event bursts) and suppressed while the tab is hidden
// (one catch-up refresh fires on refocus instead). Re-subscribes on navigation
// so each route only watches the tables it renders.
export function RealtimeRefresher() {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    const tables = tablesForPath(pathname);
    if (tables.length === 0) return;

    const supabase = createClient();

    const flush = () => {
      pendingRef.current = false;
      router.refresh();
    };

    const scheduleRefresh = () => {
      // Defer while hidden; refresh once the tab is visible again.
      if (document.visibilityState === "hidden") {
        pendingRef.current = true;
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    };

    const channelName = `page_refresher_${Math.random().toString(36).substring(2)}`;
    const channel = supabase.channel(channelName);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh
      );
    }
    channel.subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible" && pendingRef.current) {
        scheduleRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router, pathname]);

  return null;
}
