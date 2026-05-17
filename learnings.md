# Learnings

Gotchas + fixes. Each: symptom → cause → fix.

---

## PWA & Next.js Mobile / Hydration

### 0. Phone renders but dead (no buttons, no data) — CHECK THIS FIRST
- **Cause:** Dev server opened from LAN IP (`192.168.x.x:3000`). Next.js 16 blocks
  cross-origin `/_next/webpack-hmr` → client runtime never loads.
- **Tell:** dev log says `⚠ Blocked cross-origin request to Next.js dev resource`.
- **Fix:** `next.config.ts` → `allowedDevOrigins: ["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12"]`. **Restart dev server** (config not hot-reloaded).
- **Rule:** read the dev server log / browser console for the real error before theorising.

### 1. `new Date()` / `Date.now()` in render → all buttons dead
- **Cause:** Called in a client component's render body. Server clock ≠ device clock
  → hydration mismatch → React aborts hydration for whole tree → no `onClick` attaches.
  Navigation still works (`<Link>` = real `<a>`).
- **Fix:** Compute on server, pass as prop (`nowMs={Date.now()}` or `todayYear/Month/Date`).
  Live values → `lib/useClientNow.ts` (post-mount only).
- **Safe:** `new Date()` in event handlers, or on data fetched client-side in `useEffect`.
- **Rule:** render body must be deterministic — no `Date`, `Math.random`, `localStorage`.

### 1a. `toLocaleString/DateString` on a timestamp → hydration mismatch
- **Cause:** even with a fixed ISO string, formatting a timestamp with `hour`/`minute`
  (or a `date` column near midnight) renders in the server's TZ (UTC) vs the device TZ
  → different text → hydration fails for that tree.
- **Fix:** pin `timeZone: "Asia/Kolkata"` in the `Intl` options (app is India-based).
- **Safe:** number formatting (`(1234).toLocaleString("en-IN")`) — locale-data stable, not TZ-dependent.

### 2. iOS PWA content clipped under status bar
- **Cause:** `viewport-fit=cover` draws content under the translucent status bar.
- **Fix:** `padding-top: max(env(safe-area-inset-top,0px), 12px)`.
- **Gotcha:** inset can be `0` in an installed PWA → floor higher in standalone:
  `@media (display-mode: standalone){ padding-top: max(env(safe-area-inset-top,0px), 47px) }`.
  Same for `safe-area-inset-bottom` on fixed navs; use `min-height` not `height`.

### 3. Service worker rules
- **Never register the SW in dev** — `next dev` chunks aren't stably hashed; a caching
  SW serves stale JS → dead buttons. Register only when `NODE_ENV === "production"`;
  in dev, unregister any existing SW + clear caches.
- **No `skipWaiting()` on install** — it hijacks the open page and forces a reload,
  wiping the user's interaction. Let the new SW take over on next full app close/reopen.
- **`fetch` strategy:** network-first for navigations, cache-first only for
  `/_next/static/`, never cache `/api/` or `/auth/`. Bump `CACHE_VERSION` per deploy.

### 4. Middleware matcher must exclude PWA/static files
- **Cause:** matcher caught `sw.js` / `manifest` / icons → ran through auth → redirected
  to `/login` → SW registration fails.
- **Fix:** exclude them + any extensioned path:
  `"/((?!_next/static|_next/image|api/public/|sw\\.js|manifest\\.webmanifest|.*\\.[\\w]+$).*)"`.

### 5. PWA icons via `sharp`
- Composite logo onto solid bg (no extra tooling). Maskable icons need ~20% padding
  (safe zone). Apple touch icon must be opaque (iOS adds no background).
