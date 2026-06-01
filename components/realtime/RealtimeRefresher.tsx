"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Content tables whose changes should re-fetch the current page. Must match the
// tables added to the supabase_realtime publication in migration 071.
const TABLES = [
  "updates",
  "notification_recipients",
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

const DEBOUNCE_MS = 800;

// Single global subscriber: listens for changes on content tables and calls
// router.refresh() to re-run the current route's server components. Refreshes
// are debounced (collapse event bursts) and suppressed while the tab is hidden
// (one catch-up refresh fires on refocus instead).
export function RealtimeRefresher() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
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

    const channel = supabase.channel("page_refresher");
    for (const table of TABLES) {
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
  }, [router]);

  return null;
}
