"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "./components/shared";

export type AutoCheckInNotice =
  | { kind: "checked_in" | "checked_out"; projectName: string; at: number }
  | { kind: "denied" }
  | null;

// Fixes worse than this are ignored — a 400 m blur cannot place anyone on a site.
const MAX_ACCURACY_M = 150;
// Leaving counts only this far beyond the radius, so GPS jitter at the edge
// does not flap the engineer out and back in.
const EXIT_BUFFER_M = 100;
// ...and only once they have stayed out this long.
const EXIT_DWELL_MS = 3 * 60 * 1000;
const POLL_MS = 60 * 1000;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Checks the engineer in when /site is open inside one of their project sites,
 * and out once GPS has stayed outside it for EXIT_DWELL_MS (126).
 *
 * Only while the page is open: a web app gets no location in the background.
 * An engineer who never opens the app is left to the end-of-day close and the
 * 10:00 reminder (both in 126). The API re-checks every distance and refuses
 * an automatic check-in within an hour of a tapped Check Out on that project.
 *
 * `syncKey` changes whenever the dashboard reloads its check-ins — i.e. after a
 * tapped button — so the hook re-reads where the engineer is checked in.
 */
export function useAutoSiteCheckIn(
  engineerId: string,
  projects: Project[],
  syncKey: unknown,
  onChange: () => void,
): AutoCheckInNotice {
  const [notice, setNotice] = useState<AutoCheckInNotice>(null);
  // Project id of the open session; null = none; undefined = not read yet.
  const openRef = useRef<string | null | undefined>(undefined);
  const busyRef = useRef(false);
  const outsideSinceRef = useRef<number | null>(null);
  const refusedRef = useRef(new Set<string>());
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("site_check_ins")
      .select("project_id")
      .eq("user_id", engineerId)
      .eq("source", "check_in")
      .is("checked_out_at", null)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        openRef.current = data?.project_id ?? null;
        outsideSinceRef.current = null;
      });
    return () => { cancelled = true; };
  }, [engineerId, syncKey]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    const sites = projects.filter(p => p.site_lat != null && p.site_lng != null);
    if (sites.length === 0) return;

    const radius = (p: Project) => p.site_geofence_radius_m ?? 250;

    function post(projectId: string, action: "check_in" | "check_out", lat: number, lng: number) {
      return fetch(`/api/projects/${projectId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, gps_lat: lat, gps_lng: lng, method: "geofence" }),
      });
    }

    async function onFix(pos: GeolocationPosition) {
      if (busyRef.current || openRef.current === undefined) return;
      const { latitude, longitude, accuracy } = pos.coords;
      if (accuracy > MAX_ACCURACY_M) return;
      const dist = (p: Project) => haversineM(latitude, longitude, Number(p.site_lat), Number(p.site_lng));

      busyRef.current = true;
      try {
        const openId = openRef.current;
        if (openId === null) {
          const here = sites
            .filter(p => !refusedRef.current.has(p.id) && dist(p) <= radius(p))
            .sort((a, b) => dist(a) - dist(b))[0];
          if (!here) return;
          const res = await post(here.id, "check_in", latitude, longitude);
          if (res.status === 201) {
            openRef.current = here.id;
            setNotice({ kind: "checked_in", projectName: here.name, at: Date.now() });
            onChangeRef.current();
          } else {
            // Refused (hand check-out within the hour, already open elsewhere…).
            // Do not retry this site for the life of the page.
            refusedRef.current.add(here.id);
          }
          return;
        }

        const site = sites.find(p => p.id === openId);
        if (!site) return; // open on a project with no site pin — nothing to measure
        if (dist(site) <= radius(site) + Math.max(EXIT_BUFFER_M, accuracy)) {
          outsideSinceRef.current = null;
          return;
        }
        outsideSinceRef.current ??= Date.now();
        if (Date.now() - outsideSinceRef.current < EXIT_DWELL_MS) return;

        const res = await post(site.id, "check_out", latitude, longitude);
        if (res.ok || res.status === 400) {
          // 400 = already closed (tapped, or the end-of-day job) — either way, not open.
          openRef.current = null;
          outsideSinceRef.current = null;
          if (res.ok) {
            setNotice({ kind: "checked_out", projectName: site.name, at: Date.now() });
            onChangeRef.current();
          }
        }
      } catch {
        // Network blip — the next fix retries.
      } finally {
        busyRef.current = false;
      }
    }

    function poll() {
      if (document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        onFix,
        (err) => { if (err.code === err.PERMISSION_DENIED) setNotice({ kind: "denied" }); },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
      );
    }

    // First read waits a tick so the open-session lookup above can land.
    const first = setTimeout(poll, 1500);
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [projects]);

  return notice;
}
