"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for Web Push and offline caching.
 *
 * DEV vs PROD:
 * The SW is only registered in production builds. `next dev` regenerates JS/CSS
 * chunks on every change (HMR) without stable content hashes, so a caching SW
 * would serve stale chunks — the page renders but its JavaScript is out of sync,
 * leaving buttons and inputs dead. In dev we also actively unregister any SW
 * left over from a previous run so it can't poison the session.
 *
 * Update model (production) — deliberately NON-disruptive:
 * A new sw.js installs in the background and stays "waiting"; it takes control
 * the next time the app is fully closed and reopened. We never call
 * skipWaiting() or reload the page mid-session.
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Dev: remove any SW (and its caches) from an earlier prod run / older code.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure is non-fatal — the app works fine online.
    });
  }, []);

  return null;
}
