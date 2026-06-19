// ArchitectOS Service Worker
// 1. Web Push notifications (locked-screen delivery + click navigation)
// 2. Asset caching so the installed PWA updates without a reinstall
//
// IMPORTANT: bump CACHE_VERSION on every deploy that changes static assets.
// Old caches are purged on activate, so the next launch picks up new CSS/JS.
const CACHE_VERSION = "v7";
const STATIC_CACHE = `architectos-static-${CACHE_VERSION}`;

// ── Lifecycle ────────────────────────────────────────────────────────
// NOTE: deliberately NO skipWaiting() on install. A new SW installs and waits;
// it takes control on the next full app close/reopen. Calling skipWaiting()
// here would hijack the page mid-session, reload it, and wipe the user's
// interactions (taps, calendar selections, half-filled forms).

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))
      );
      // claim() only adopts pages that currently have NO controller (i.e. the
      // first-ever install). It does not interrupt an already-controlled page.
      await self.clients.claim();
    })()
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET; never touch POST/PATCH/etc.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never cache API calls or auth — always hit the network
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // Content-hashed build assets → cache-first (safe: filename changes on rebuild)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Page navigations → network-first so fresh HTML (and new asset hashes) load;
  // fall back to cache only when offline.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline and no cached page");
  }
}

// ── Web Push ─────────────────────────────────────────────────────────
function urlForPayload(payload) {
  switch (payload.source_type) {
    case "site_check_in":    return "/projects";
    case "checkpoint":       return "/projects";
    case "payment_schedule": return "/finance";
    case "enquiry_reminder": return "/enquiries";
    default:                 return "/";
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "ArchitectOS", body: event.data.text(), source_type: null };
  }

  const options = {
    body:             payload.body ?? "",
    icon:             "/icon-192.png",
    badge:            "/badge-72.png",
    tag:              payload.kind ?? "architectos",
    renotify:         false,
    requireInteraction: payload.severity === "critical" || payload.severity === "warning",
    data: {
      url:         urlForPayload(payload),
      kind:        payload.kind,
      source_type: payload.source_type,
      source_id:   payload.source_id,
    },
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "ArchitectOS", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
