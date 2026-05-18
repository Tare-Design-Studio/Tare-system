# PROJECT_STATE.md
(Updated: 2026-05-18 — overview metrics + finance expenses picker + enquiry form fix)

### Overview/finance UX + public enquiry fix (2026-05-18)

**Built:**
- Public enquiry form fixed (migration 066, APPLIED): `submit_public_enquiry()` called `emit_notification()` with a non-existent signature (`p_recipient_capability`, no `p_title`) → every submission 400'd. Also phone soft-dedupe ran on empty-string phone (route sent `""`), so phone-less submissions shared one rate-limit bucket. Fix: corrected `emit_notification` call, made `p_phone_normalized`/`p_source` optional (DEFAULT NULL), empty-string phone treated as absent. Route now passes `null` for missing IP/phone/source. `lib/supabase/types.ts` hand-patched (no Docker for `supabase gen types`).
- Overview metrics (`app/(app)/page.tsx`): now 3 live pillars — Active Projects, Total Enquiries, Updates Today (count queries). Removed Hours Billed YTD, Invoiced MTD, Pending Approvals.
- Collections card: Total Expenses now shown as a second 44px figure beside Total Received (was a small row below).
- Finance page: new `ProjectExpensesPicker` client component — "Expenses" dropdown button in header, selects a project → navigates to `/projects/[id]/expenses`.
- Customer portal + enquiry pages: Tare logo replaces ArchitectOS mark; portal footer "Powered by ascension" links to ascension-ten.vercel.app.
- `ConfirmPopover`: panel hardened (`maxWidth`, `boxSizing`, `whiteSpace: normal`, `wordBreak`) so text wraps instead of overflowing the page.

### Table soft-delete fix (2026-05-18)

**Built:**
- Migration 064 — APPLIED to cloud Supabase. Fixes table deletion: a deleted table stayed visible because the DELETE route's direct `UPDATE ... SET deleted_at` was rejected by RLS. Root cause: Postgres enforces the SELECT policy's `USING (deleted_at IS NULL)` against the post-update row, so setting `deleted_at` makes the new row fail the SELECT policy ("new row violates RLS policy"). Migration 058 only fixed the UPDATE policy's WITH CHECK, not this. Fix: `soft_delete_project_table()` SECURITY DEFINER fn (capability-checked) + DELETE route calls it via RPC.
- Project detail page: Material Plan card moved back to the left column (after the UpdateComposer card) — its original position.

### Audit retention + table columns + project page (2026-05-18)

**Built:**
- Migration 062: pg_cron `audit-log-retention` job — daily hard-delete of `audit_log` rows older than 30 days. **APPLIED to cloud Supabase.**
- Migration 063: `project_table_columns` unique constraint made DEFERRABLE; `shift_table_columns_after()` + `delete_table_column()` SQL functions. **APPLIED to cloud Supabase.**
- Fixed insert-column-between bug: `columns` POST route now calls `shift_table_columns_after` before insert so `display_order` stays unique (was a silent UNIQUE-constraint 500 → column never appeared).
- New DELETE `/api/projects/[id]/tables/[tableId]/columns/[columnId]` — hard-deletes a column via `delete_table_column`, `project_table:edit` gated.
- ProjectTablesSection: per-column Delete button in the table header (edit mode, ConfirmPopover, non-serial columns only).
- TeamStreamCard activity feed is now an independently scrollable region (`maxHeight: 420`).

### Customer portal redesign (2026-05-17)

**Built:**
- Migration 061: `get_customer_portal_summary` now also returns per-checkpoint progress (`id`, `total_items`, `completed_items`, `progress_pct`). **NOT YET APPLIED to cloud Supabase.**
- `/c/customer/[hash]/page.tsx` rewritten to match `ArchitectOS copy/CustomerPortal.html` mock — paper cards, serif headings, gradient bg, brand top bar; one card per project with milestone progress bars + per-milestone completion %
- `/c/[hash]/page.tsx` reordered to mock layout (Payment Schedule before Project Milestones); milestone chips gain an "Active" state for the in-progress checkpoint

### Post-build fixes batch 2 (2026-05-17)

**Built:**
- `Icon` atom: new `pencil` icon
- Team Stream (`TeamStreamCard.tsx`): the author's Edit/Delete actions on an update are now hidden behind a pencil-icon menu (click-away + Esc close); Delete still routes through `ConfirmPopover`
- Team & Access Members card (`team/page.tsx`): rows ordered owner → team members → site engineers (`ROLE_RANK`); each team member shows their active (unchecked) `member_tasks` with date added, else last completed task, else "No tasks"; new monthly "Check-ins" stat
- Migration 060: `attendance_logs.check_in_count`. **APPLIED 2026-05-17.** Team members can re-log attendance the same day — one row stays, keeps first check-in / last check-out, increments the count
- Attendance API (`api/attendance/route.ts`): `check_in` reads-then-inserts-or-increments (no longer overwrites the first check-in); `check_out` unchanged (last wins)
- `AttendanceCard.tsx`: a "+" icon (in a `ConfirmPopover` — "Are you sure?") lets a member log attendance again; new "Check-ins" metric tile
- `team-access.module.css`: member-task list layout + 3-stat grid

### Post-build fixes batch (2026-05-17)

**Built:**
- Migration 058: fixes `project_tables` UPDATE RLS so soft-delete (DELETE table route) actually persists — was silently affecting 0 rows because the policy had no explicit `WITH CHECK`. APPLIED to cloud Supabase 2026-05-17.
- Migration 059: `updates.edited_at/deleted_at`, `owner_broadcasts.edited_at` + RLS for author edit/soft-delete. APPLIED 2026-05-17.
- DELETE `/api/projects/[id]/tables/[tableId]` now returns 404 when no row matched (no more fake 204)
- New `/calendar/schedule` route (`page.tsx` + `ScheduleClient.tsx`) — all upcoming events grouped by date with source-type filters; shared helpers in `app/(app)/calendar/eventUtils.ts`. Calendar "View full schedule" button now links there
- New API routes: `PATCH/DELETE /api/projects/[id]/updates/[updateId]` (author edit/soft-delete), `PATCH /api/broadcasts/[id]` (author edit)
- `UpdatesFeed` + `TeamStreamCard` show inline Edit/Delete on the current user's own updates; `BroadcastsPanel` shows Edit on the owner's own broadcasts; "· edited" marker when `edited_at` set
- Audit log: `lib/audit/summarize.ts` enriches rows server-side (entity label, friendly resource noun, project name); `AuditClient` renders a human-readable sentence ("Nayan deleted table "Drawing Register" in Sharma Villa") instead of raw JSON — raw before/after kept in the expand row
- App rebranded to "Tare": PWA `name`/`short_name` (`app/manifest.ts`), `appleWebApp.title` and browser-tab `metadata.title` (`app/layout.tsx`)

### Google Drive image auto-sync (2026-05-17)

**Built:**
- Migration 057: `media_assets` Drive columns (`drive_file_id`, `drive_sync_status`, `drive_sync_error`, `drive_synced_at`) + `idx_media_drive_sync` — APPLIED to cloud Supabase
- `lib/drive/client.ts` — **user-OAuth** Drive client (`googleapis`). Service accounts have NO Drive storage quota → cannot upload to a personal My Drive folder, so the app authenticates as a real Google account via a long-lived refresh token. `extractFolderId(url)` parses `projects.drive_folder_url`; `uploadToDriveFolder()`; `isDriveConfigured()`; `makeOAuthClient()`
- `scripts/drive-auth.ts` — one-time OAuth setup; opens consent in browser, captures the code on a loopback server (`localhost:53682/callback`), prints the refresh token for `.env`
- `.env`: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (service-account vars now unused)
- `lib/drive/sync.ts` — `pushMediaAssetToDrive(assetId)` downloads from Supabase Storage → uploads to the project's Drive folder, records outcome on the row (non-blocking; `skipped` if no folder/creds, `failed` on error); `prunePrivateMedia(projectId, kind, keep=15)` keeps 15 newest per kind, deletes older ones from Supabase Storage ONLY if `synced` to Drive
- `POST /api/projects/[id]/updates/images` — after `media_assets` insert: pushes to Drive then prunes; returns `drive_sync_status`
- `POST /api/projects/[id]/updates/images/[assetId]/retry` — retry-push endpoint, `images:upload` gated
- `updates` GET route returns `drive_sync_status` per image
- `UpdatesFeed.tsx` — `FeedImageTile` shows a "⟳ Retry Drive sync" overlay on `failed` thumbnails; needs `projectId` prop (passed by Desktop/MobileSiteEngineer)

**Drive go-live — DONE (2026-05-17):**
- OAuth client (Web type), `.env` filled with `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`
- Redirect URI `http://localhost:53682` registered on the OAuth client (Web clients require it)
- Verified end-to-end: auth + real upload to the project Drive folder + cleanup all succeed
- Backfilled the 2 pre-existing un-synced images → both `synced`

**Pending:**
- [ ] Test in-app: upload image → appears in the project's Drive folder; 16th upload per kind prunes the oldest synced Supabase copy

**Notes:**
- Earlier service-account attempt failed — `Service Accounts do not have storage quota`. User OAuth (refresh token, billed to a real Google account's 15 GB) is the free fix; no Workspace needed.
- The OAuth account must have Editor access to every project's `drive_folder_url` folder.
- Web-type OAuth clients require `http://localhost:53682` in Authorized redirect URIs for `scripts/drive-auth.ts` to work.

### PWA + Mobile (2026-05-16)

## Current Phase: Phase 10 — Project management UX & workflow refactor (in progress)
(Updated: 2026-05-14)

### PWA + Mobile (2026-05-16)

**Built (PWA install):**
- `app/manifest.ts` — black `#000000` background/theme, `standalone`, portrait, `any` + `maskable` icons
- `app/layout.tsx` — manifest link, apple/favicon icons, `appleWebApp` (black-translucent status bar), `viewportFit: cover`
- Icons generated on black bg into `public/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-icon.png`, `favicon-32.png`, `badge-72.png` (from `Tare Logo-01.png` via `sharp`)

**Built (safe-area / clipping):**
- `.mobile-main` class in `globals.css` — top padding `max(env(safe-area-inset-top), 12px)`; under `@media (display-mode: standalone)` floored at 47px (iOS translucent status bar)
- `MobileNav` bottom padding `max(env(safe-area-inset-bottom), 28px)`; `height`→`minHeight`
- Customer portal page top padding safe-area-aware

**Built (service worker — reload without reinstall):**
- `public/sw.js` rewritten: versioned cache (`CACHE_VERSION`), network-first navigations, cache-first `_next/static`, never caches API/auth; old caches purged on activate. Still handles Web Push.
- `SwRegister.tsx` — detects waiting/new SW, sends `SKIP_WAITING`, reloads on `controllerchange`, re-checks on focus
- ⚠️ Bump `CACHE_VERSION` on every deploy. Client must reinstall PWA **once** to get the self-updating SW; subsequent updates are automatic.

**Fixed (mobile hydration — buttons/calendar dead on phones):**
- Root cause: client components calling `new Date()`/`Date.now()` during render → server vs device clock/timezone mismatch → React aborts hydration for the whole tree → all `onClick` handlers dead (navigation still worked).
- Fix: server computes "now", passes as prop (`nowMs` / `todayYear/Month/Date`). New `lib/useClientNow.ts` hook for genuinely-live values (post-mount only).
- Files: `CalendarClient`, `ProjectsClient`, `Desktop/MobileSiteEngineer` (+`SiteEngineerDashboard`), `DailyExpensesCard`, `PerformanceClient`, `ProgressTimelineClient`, `BroadcastsPanel`.
- Also fixed `proxy.ts` matcher — was running `sw.js`/`manifest.webmanifest`/icons through auth middleware (could redirect `sw.js` → `/login`). Now excludes PWA files + any extensioned path.

See `learnings.md` for the reusable patterns.

### Phase 10 — In Progress
Migrations 043–050 applied to cloud Supabase. Types regenerated.

**Built (Schema + APIs):**
- 043 milestone progression: `project_checkpoints.started_at` + `enforce_checkpoint_progression()` trigger (3-rule sequential progression) + updated `v_project_checkpoint_status` and `v_checkpoint_progress` views to include `started_at` and `in_progress` status
- 044 `projects.whatsapp_group_url` column
- 045 `payment_records.method` CHECK extended to include `neft`
- 046 `payment_milestone_presets` + `payment_milestone_preset_items` tables with RLS
- 047 `enquiry_phones` table + `enquiries.deleted_at` soft delete column
- 048 `customers.customer_portal_hash` + `customer_portal_hash_generated_at` + `customer_portal_enabled` columns + `get_customer_portal_summary()` SECURITY DEFINER function (anon-callable, rate-limited)
- 049 `material_plan.linked_project_table_id` + `linked_project_table_row_id` + `expenses.linked_material_plan_id`
- 050 `checkpoint:progress` capability declared (Owner + project_manager tag)
- 065 tag-capability sync: `user_capabilities.source` column + `tag_capability_set()` helper + `apply/revoke_tag_capabilities()` triggers — assigning a tag now writes `user_capabilities` rows so tags drive `has_capability()`/RLS. `TAG_CAPABILITIES` redefined: accountant = full access, admin = full minus finance/payments.
- `GET/PATCH /api/access-matrix` — Owner-only; editable access matrix (tags + per-capability overrides)
- `PATCH /api/projects/[id]/checkpoints/[checkpointId]` — start / complete / reset (capability: checkpoint:progress)
- `POST /api/projects/[id]/payments/from-preset` — apply preset to project
- Per-table role gating on row APIs: Team Member edits Drawing Register only, Site Engineer edits Site Execution only, Owner/PM edit all
- Expense approval gate bug fix: `expenses:approve` now enforced

**Built (UI):**
- WhatsApp URL + project site lat/lng inputs in NewProjectModal + EditProjectModal
- "Open WhatsApp Group" button on project detail page (conditional)
- Hours Logged replaced with Project Duration & Progress card (Estimated/Completed/Actual/Projected)
- Edit Project button gated behind `project:edit` capability
- PaymentsCard: "Paid" → "Received" label, NEFT in method dropdown, delete confirmations via window.confirm
- Bridge: project selector replaced with `<select>` dropdown
- Categorized preset picker structure in NewProjectModal (Milestones / Team / Site Engineers / Payment Milestones)

**Built (2026-05-16 — preset & table fixes):**
- Migration 051 + 999_add_checkpoint_details + 999_zz_explicit_data_api_grants — ALL APPLIED to cloud Supabase
- Migration 051: `payment_milestone_presets` tenant_id trigger (fixes preset creation NOT NULL error) + `service_role` grants on `table_preset_*` (fixes silent table-preset column/section/row failures)
- 999_zz makes Data API grants explicit + is the sole source of `tenants` RLS policies
- Migration 052: fixes `audit_trigger()` crashing on `table_preset_*` child tables + `tenants` (tables without `tenant_id`/`deleted_at`) — was the real cause of "can't add column/section/row to preset"
- `/api/payment-presets` POST now sets `tenant_id` explicitly
- `/api/pipeline-templates/[id]/items/[itemId]` PATCH route — edit pipeline stage (name, offset days, requires_approval)
- TablePresetsClient: inline stage editing + error banner surfacing on all preset/stage mutations
- `ConfirmPopover` atom — are-you-sure popover
- ProjectTablesSection: per-table Delete with ConfirmPopover (project_table:edit gated, in edit mode)

**Built (2026-05-16 — UX fixes round 2):**
- Expense approval UI: `ExpenseApproval` client component on project expenses page — Approve / Reject (with reason) on pending rows, gated by `expenses:approve`
- Bridge: WhatsApp group link button in thread header when project has `whatsapp_group_url`
- Project status select narrowed to active / on_hold / completed (EditProjectModal)
- New `/app/(app)/updates` page — full updates feed; dashboard "View all updates" button now links to it
- NotificationBell: read notifications disappear from popup (renders unread only)
- Migration 053: adds missing FK `audit_log.actor_id → users(id)` — its absence broke the audit page's PostgREST embed `actor:actor_id(...)`, returning null (real cause of empty audit page)
- Migration 054: retires `planning`/`cancelled` project statuses — re-homes live rows (planning→active, cancelled→on_hold); enum values kept for history
- Project status fully reduced to active/on_hold/completed across API zod enums (default now `active`), EditProjectModal, ProjectsClient status filter, and all STATUS_DOT/tone maps

**Built (2026-05-17 — updates images + SE updates feed + material plan UI):**
- Image uploads in updates: `POST /api/projects/[id]/updates/images` — uploads to `media-private` bucket + creates `media_assets` row (kind `site_image`), capability `images:upload`, 10 MB / jpeg-png-webp-heic limit, service client
- `updates` API extended: POST accepts `media_asset_ids[]` and links them via `media_assets.linked_update_id`; GET returns `images[]` with 600 s signed URLs
- `components/updates/UpdateComposer.tsx` — shared composer: type pills, textarea, multi-image attach with live upload + previews; used by Site Engineer dashboard + project detail page
- `components/updates/UpdatesFeed.tsx` — shared feed renderer with image thumbnails
- Site Engineer dashboard: new **Updates** tab (Desktop + Mobile) — composer + feed; `SiteEngineerDashboard` now fetches `/updates` in refresh
- Project detail page: "Post an Update" card (composer) shown to assigned team members / site engineers (`isAssigned`)
- Material plan UI: `MaterialPlanCard` on project detail page — Owner/PM add/edit/delete planned materials (`materials:plan`); `POST/PATCH/DELETE /api/projects/[id]/material-plan` (service client, capability-gated, delete blocked if consumption logged)

**Built (2026-05-17 — round 2: material presets + UX polish):**
- Migration 055: `material_plan_presets` + `material_plan_preset_items` — APPLIED to cloud Supabase; types regenerated
- `/api/material-presets` (GET/POST/DELETE) — material plan preset CRUD, `materials:plan`-gated
- `/api/projects/[id]/material-plan/from-preset` POST — applies a preset (one `material_plan` row per item)
- Preset page: new **Material Plan** tab (`MaterialPresetsClient`) alongside Table/Pipeline/Payment presets
- `MaterialPlanCard`: preset selector + Apply button; fixed column alignment (shared 5-col grid template, consistent right-align)
- Project detail layout: Team Stream moved directly below Project Pipelines; "Post an Update" card now compact (`UpdateComposer compact` — dropdown type selector matching the team-member overview AddUpdateCard, smaller padding)
- Image uploads: `kind` set by uploader role — site engineers → `site_image`, team members → `drawing` (feeds the Latest Files card split)
- Team Stream feed (`TeamStreamCard`) now renders attached update images as thumbnails alongside text
- Project detail `updates` query embeds `media_assets!linked_update_id` + signs URLs server-side (600 s)

**Pending (Phase 10 finish list):**
- Remove "Edit Preset" button + introduce pencil-mode pattern across `ProjectTablesSection`
- `/settings/payment-presets` CRUD page
- `/projects/[id]/expenses` detailed breakdown page (week/month/custom filter)
- Customer-level portal: `POST /api/customers/[id]/portal` + `/c/customer/[hash]` page + "Generate Link" button on customers page
- Customer detail: list ALL projects (currently `.maybeSingle()`)
- Enquiries: edit modal, multi-phone management, soft delete, convert/delete confirmations
- Finance page: daily expenses card + calendar filter + overall + per-project metrics
- Overview: Collections card → Total Received + Total Expenses with filter; Projects split into Execution row + Design row
- Material plan ↔ Site Execution table UI + Site Engineer expense category dropdown linking to material_plan
- pgtap test for checkpoint progression trigger

---

## What's Built

### Project Skeleton
- Next.js 16.2.5 App Router — builds clean, zero errors/warnings
- Tailwind v4 brand tokens in `app/globals.css` (Instrument Serif + Geist, earthy palette, 22px card radius)
- Root layout with metadata, viewport, PWA manifest scaffold
- `proxy.ts` — Next.js 16 session middleware (route protection + audit request-ID injection)

### Supabase Clients
| File | Purpose |
|------|---------|
| `lib/supabase/server.ts` | Server Components + Route Handlers (cookie-based) |
| `lib/supabase/client.ts` | Client Components (browser singleton) |
| `lib/supabase/service.ts` | Admin/migration only — never in app routes |
| `lib/supabase/types.ts` | Stub — regenerate after migrations run |

### Auth Utilities
| File | Purpose |
|------|---------|
| `lib/auth/capabilities.ts` | 50 capability strings + role default sets |
| `lib/auth/middleware.ts` | Session refresh logic (called by proxy.ts) |

### Database Migrations (written — NOT yet run)
| File | Contents |
|------|----------|
| `001_phase0_extensions.sql` | pgcrypto, pg_trgm |
| `002_phase0_roles.sql` | audit_writer, notification_writer, public_writer Postgres roles |
| `003_phase0_tenants.sql` | tenants table, touch_updated_at trigger |
| `004_phase0_users.sql` | users, user_sessions, user_capabilities, all v1 enums, non-delegable trigger |
| `005_phase0_helpers.sql` | has_capability(), is_assigned_to_project(), project_in_stage(), set_tenant_from_*() |
| `006_phase0_notifications.sql` | notifications, notification_recipients, push_subscriptions, emit_notification() |
| `007_phase0_audit.sql` | audit_log, audit_export_log, audit_trigger() with hash chain + advisory lock |
| `008_phase0_rls_policies.sql` | RLS for all Phase 0 tables + privilege hardening (REVOKE/GRANT) |
| `009_phase0_cron.sql` | pg_cron keep-alive job (prevents free-tier project pause) |

### Seed & Tests
- `supabase/seed/001_seed.sql` — stub; fill with real tenant + owner data before running
- `supabase/tests/001_phase0_capabilities.sql` — pgtap tests for capability enforcement
- `scripts/migrate.ts` — migration runner (requires DATABASE_URL)

### Component Library (`components/atoms/`)
| Component | Description |
|-----------|-------------|
| Icon | 30 SVG icons (Material-style paths) |
| Avatar | Initials circle, 9 tone variants |
| Chip | Status badge, 9 tones, sm/md sizes, optional dot |
| Card + CardTitle | Paper-lift card with inset shadow |
| Button | primary / secondary / ghost / danger variants |
| IconBtn | 40×40 icon-only button with active state |
| Input | Text input with label, error, suffix slot |

### Auth UI (Phase 0 complete)
| Route | Status |
|-------|--------|
| `/login` | Real form — left slate panel + right email/password form |
| `/login/verify` | MFA TOTP challenge (6-digit code) |
| `/accept` | Invite acceptance — set password, activates account |
| `/api/auth/callback` | Supabase code exchange → redirects to `/accept` or `/` |
| `/api/invite` | POST — Owner invites team member / site engineer |

### App Shell
| File | Purpose |
|------|---------|
| `app/(app)/layout.tsx` | App shell — desktop: TopBar + max-width container; mobile: MobileNav bottom tab bar. Responsive via `.mobile-only` / `.desktop-only` CSS classes |
| `app/(app)/TopBar.tsx` | Horizontal top nav — brand pill, nav pills, search, bell, user avatar + sign out (desktop only) |
| `app/(app)/MobileNav.tsx` | "use client" — bottom tab bar (Today/Projects/Calendar/Team/Me), frosted glass, `usePathname()` active state |
| `app/(app)/MobileHome.tsx` | Mobile Today screen — greeting, dark revenue card, schedule, quick actions, project tiles, recent updates (server component, static data) |
| `app/(app)/AppNav.tsx` | (Deprecated sidebar — kept, no longer used) |
| `app/(app)/page.tsx` | Dashboard — desktop: HeroStrip + 12-col grid; mobile: MobileHome |
| `app/(app)/team/page.tsx` | Team member list + invite form (Owner-gated) |
| `app/(app)/settings/access-matrix/page.tsx` | Owner: editable matrix (assign tags + per-capability overrides, `AccessMatrixEditor`); others: read-only capability view |
| `app/api/access-matrix/route.ts` | GET members/tags/caps + PATCH tag/capability changes (Owner-only) |

### App Route Groups
| Route | Status |
|-------|--------|
| `/login` | Placeholder — real form in next session |
| `/` (dashboard) | Placeholder — Phase 1+ |
| `/enquire/[tenantSlug]` | Placeholder — Phase 4 |
| `/c/[hash]` (portal) | Placeholder — Phase 6 |

---

## Pending Actions (before Phase 0 is "done")

### Completed:
- ✅ All Phase 0 migrations applied (2026-05-07)
- ✅ Tenant: **Tare Design Studio** (slug: `tare-design-studio`, id: `d4784db6-9a2d-4075-97b5-14daaa9026ab`)
- ✅ Owner: **Nayan Kumar** (`nayanconsulatants@gmail.com`, id: `fdcf8ca6-a98d-4ebd-9765-f2869f60b504`)
- ✅ 58 capabilities granted to owner
- ✅ Dashboard shell matches Dashboard.html mock (TopBar + HeroStrip + 5-card grid, radial gradient body)
- ✅ Mobile shell matches phone.jsx mock (MobileNav + MobileHome, responsive ≤767px breakpoint)

### Nayan must do on first login:
1. Log in at `http://localhost:3000/login` with `nayanconsulatants@gmail.com` and temp password
2. Change password (Settings → TODO Phase 0.1)
3. Enroll MFA (mandatory for Owner — TODO: MFA enrollment UI)

### Next build session (Phase 0 go-live checklist):
- [ ] Fill `supabase/seed/001_seed.sql` with real tenant + owner data
- [ ] Run pgtap tests against live DB (`psql $DATABASE_URL -f supabase/tests/001_phase0_capabilities.sql`)
- [ ] Add `NEXT_PUBLIC_SITE_URL` to `.env.local` (needed by invite API for `redirectTo`)
- [ ] MFA enrollment UI (Owner: post-login prompt to enroll TOTP if not yet enrolled)
- [ ] Add `SESSION_URL` or similar for invite redirect config
- [ ] Phase 0 "done means" gate: styled landing at 1280px matches Dashboard.html

### Phase 1 — Complete ✅
Built:
- Migrations 010–014 (projects, work_log, checkpoints, table presets, RLS, seed)
- API routes: `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/stage`, `/api/projects/[id]/assignments`
- Projects list page `/projects` — active/closed sections, progress bars, elapsed/remaining days
- NewProjectModal — name, type, budget, dates, hours, location, SAL preset + drawing register checkboxes
- Project detail page `/projects/[id]` — pipeline timeline, team assignments, milestones, circular progress
- Stub types in `lib/supabase/types.ts` for all 16 Phase 1 tables + 2 new RPC functions

Pending (Phase 1 "done means" gates not yet verified against live DB):
- [ ] Migrations 010–014 applied to cloud Supabase (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Seed `014_phase1_seed.sql` applied (SAL preset + Drawing Register preset)
- [ ] Regenerate types: `npx supabase gen types typescript --project-id hsgetpednslqecfcnlyz --schema public > lib/supabase/types.ts`
- [ ] Verify: new project auto-applies SAL preset (7 checkpoints appear)
- [ ] Verify: contribution_pct sum >100% rejected by DB trigger
- [ ] Verify: Site Engineer view shows empty project list (design-stage RLS)

### Phase 2 — Complete ✅
Built:
- Migrations 015–018 (material_plan, material_consumption, expenses, site_check_ins, views, RLS)
- Shared `mark_original_as_corrected()` parametric trigger (Review Gate P2)
- `enforce_material_plan_consistency()` trigger — copies name/unit from plan; rejects cross-project (P4)
- `flag_material_excess()` trigger — auto-sets is_excess when total > plan × (1 + threshold%) (excludes correction predecessor from sum)
- `handle_expense_approval()` trigger — auto-sets approved_by/approved_at; enforces rejection_reason (P3)
- `validate_expense_links()` trigger — material_consumption and checkpoint must be same project
- `site_check_ins` with `gps_retained_until` date column + `within_geofence` boolean (P1, P5)
- Views: `v_work_log_current`, `v_material_consumption_current`, `v_expenses_current`
- API routes: `/api/projects/[id]/materials`, `/api/projects/[id]/expenses`, `/api/projects/[id]/expenses/[expenseId]`, `/api/projects/[id]/checkin`
- Haversine geofence check in `/checkin` route handler — server-side, no PostGIS required
- Site Engineer dashboard at `/site` — Today/Materials/Progress/Expenses tabs, project selector, GPS check-in
- Project detail page — real expense card (pending/approved breakdown) + site check-ins feed
- Updated `lib/supabase/types.ts` with all Phase 2 tables + views
- All trigger-populated fields (tenant_id, slug) marked optional in Insert types
- Build: zero errors ✅

Pending (Phase 2 "done means" gates not yet verified against live DB):
- [ ] Migrations 015–018 applied to cloud Supabase (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Test: site engineer can log material consumption (excess auto-flagged when >15% threshold)
- [ ] Test: expense correction creates new row, original gets is_corrected=true
- [ ] Test: approved expense triggers set approved_by=auth.uid() server-side
- [ ] Test: check-in with GPS outside geofence stored as within_geofence=false (202 response)
- [ ] Test: `v_*_current` views return only non-corrected rows
- [ ] Lighthouse PWA > 90 on `/site` (mobile)

### Phase 3 — Complete ✅
Built:
- Migrations 020_phase3_comms.sql, 021_phase3_rls.sql (updates, media_assets, bridge_messages, team_daily_tasks, owner_broadcasts, owner_broadcast_recipients)
- `bridge_material_request_to_plan()` trigger — material_request bridge message auto-creates draft material_plan row
- `source_bridge_message_id` column added to material_plan
- API routes: `/api/projects/[id]/bridge`, `/api/projects/[id]/updates`, `/api/daily-tasks`, `/api/daily-tasks/export` (CSV), `/api/broadcasts`, `/api/broadcasts/[id]/ack`
- `/bridge` page — project rail + message thread (text / material_request / clarification types), compose panel, server-fetches projects by role
- Project detail page — Recent Activity feed card (pulls from `updates` table)
- Team page — real `BroadcastsPanel` client component (compose for Owner, acknowledge for recipients), `DailyTasksWidget` client component (add/check tasks for today, CSV export link)
- Updated `lib/supabase/types.ts` with all Phase 3 tables

Pending (Phase 3 "done means" gates not yet verified against live DB):
- [ ] Migrations 020–021 applied to cloud Supabase (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Test: Bridge material_request creates draft material_plan row (check `source_bridge_message_id`)
- [ ] Test: Daily task CSV export returns valid CSV under 1 second for 1000-row fixture
- [ ] Test: Broadcast to 3 recipients delivers in-app to exactly those 3 users
- [ ] Test: Updates feed filter by type/author/date returns correct results

### Phase 9 — Complete ✅
Built:
- Migrations 037–041: team_member_tags, member_tasks, personal_reminders, attendance_logs, personal_reminder_notifications pg_cron job
- Tag-based sub-roles: `accountant`, `admin`, `project_manager` with `TAG_CAPABILITIES` map in `lib/auth/capabilities.ts`
- New capabilities: `member_tasks:write_own`, `member_tasks:view_all`, `personal_reminders:write_own`, `team_member_tags:manage`
- TopBar nav gating: team members see only Overview, Calendar, Projects, Broadcasts, My Tasks, Bridge; tagged members get additional pages
- Project detail page: Payment Milestones and Budget row hidden from team members without `finance:view_dashboard`
- TeamMemberHome rebuilt with 4 interactive client cards: AttendanceCard, BroadcastsCard, TasksCard, RemindersCard
- Two-click attendance pattern: click → confirm state → click to log; GPS validation server-side (200m Haversine)
- `/broadcasts` page: full broadcast history with ack button (team member) or recipient progress (owner)
- `/tasks` page: all personal tasks with pending/completed filter + month/year filter
- API routes: `/api/member-tasks`, `/api/member-tasks/[id]`, `/api/attendance`, `/api/personal-reminders`, `/api/personal-reminders/[id]`
- Owner team page: `AttendanceOverview` component showing days present, total hours, tasks done/total per member for current month
- Build: zero errors ✅

Pending (Phase 9 "done means" gates):
- [ ] Migrations 037–041 applied (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Set office GPS coords: `UPDATE tenants SET office_lat=<lat>, office_lng=<lng> WHERE slug='tare-design-studio'`
- [ ] Regenerate types: `npx supabase gen types typescript --project-id hsgetpednslqecfcnlyz --schema public > lib/supabase/types.ts`
- [ ] Test: team member check-in within 200m logs `check_in_within_geofence=true`
- [ ] Test: team member cannot see Finance/Customers/Audit/Performance/Enquiries/Team nav
- [ ] Test: project detail hides Payment Milestones and Budget for team member
- [ ] Test: owner sees attendance + task completion in team page for current month

### Phase 8 — Complete ✅
Built:
- Migration 034: `team_performance_monthly` table + `v_kpi_scores` view (Efficiency 30% / Quality 40% / Delivery 30% weighted) + `v_employee_revenue_contribution` view + RLS (Owner inserts/updates, members read own row, `finance:view_dashboard` reads all)
- Migration 035: `audit_trigger()` attached to ALL domain tables (39 triggers total); `audit_export_log` INSERT policy added for `audit_log:export` users
- API routes: `GET/POST /api/performance`, `GET/PATCH /api/performance/[userId]`, `GET /api/audit` (filters: actor, resource_type, action, from/to, pagination), `POST /api/audit/export` (NDJSON download + `audit_export_log` row recorded)
- `/performance` page — month selector (12-month dropdown), KPI table (all team members × Drawings/Errors/Revisions/Deadline%/Client Rating/Site Delay + Efficiency/Quality/Delivery/Overall grade chips + Revenue), inline Edit/Add modal with upsert
- `/audit` page — filter bar (actor, resource, action, from/to), paginated audit log table (50/page), expandable row with before/after JSONB diff + full hash chain fields, NDJSON export button (Owner-only with `audit_log:export`)
- `/performance` nav item added to TopBar
- Build: zero errors, 73 routes ✅

Pending (Phase 8 "done means" gates not yet verified against live DB):
- [ ] Migrations 034–035 applied (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Test: Owner records Jan performance for one user → KPI scores appear within ±2 of expected
- [ ] Test: audit trigger fires on `projects` INSERT/UPDATE — row appears in audit_log with correct hash chain
- [ ] Test: 10 concurrent transactions same tenant → linear chain (re-walk in pgtap, no forks)
- [ ] Test: tampering one audit_log row_hash → verification re-walk fails on that row
- [ ] Test: NDJSON export downloads with correct SHA-256 header; audit_export_log row created
- [ ] Test: Team Member reads own performance row; cannot read others'; Owner reads all
- [ ] Test: audit_log is append-only — UPDATE/DELETE rejected for authenticated role

### Phase 7 — Complete ✅
Built:
- Migration 032: 5 generator functions (`generate_checkpoint_overdue_notifications`, `generate_payment_due_notifications`, `generate_material_excess_notifications`, `generate_reminder_due_notifications`) + `emit_site_checkin_notification` SECURITY DEFINER callable by `authenticated` + `compact_old_notifications` daily compaction + fixed `notifications` RLS to join via `notification_recipients` so Team Members can read their own
- Migration 033: `GRANT notification_writer TO postgres` + pg_cron schedules for all 4 batch generators (every 15 min) + daily compaction (2 AM UTC)
- `generate_payment_due_notifications` — Owner-only (p_user_ids NULL → owner fallback)
- `generate_reminder_due_notifications` — includes F5 category prefix in title (Meeting / Quotation / Drawing / etc.)
- `emit_site_checkin_notification` — called from `/api/projects/[id]/checkin` after every check-in; emits `site_checkin_recorded` (info) or `site_checkin_out_of_geofence` (warning) to Owner
- API routes: `GET /api/notifications` (list + unread count), `PATCH /api/notifications` (mark_read / acknowledge), `POST /api/push/subscribe`, `DELETE /api/push/subscribe`, `GET /api/cron/notify` (Vercel Cron handler — runs all 4 generators + push delivery)
- `components/notifications/NotificationBell.tsx` — real-time bell; Supabase Realtime subscription on `notification_recipients INSERT`; unread dot; dropdown list; mark-all-read; per-item mark-read on click
- `components/notifications/SwRegister.tsx` — client component that registers `/sw.js` service worker on mount (mounted in root layout)
- `public/sw.js` — service worker: `push` event handler + `notificationclick` navigate to source URL
- `lib/push.ts` — VAPID push sender; `sendPendingPushNotifications()` polls for undelivered recipients (< 5 attempts), sends via `web-push`, deactivates expired (410/404) subscriptions
- TopBar: static bell button replaced with `NotificationBell`; push permission requested + subscription registered on Owner/Team Member sign-in
- Build: zero errors, 67 routes ✅

Pending (Phase 7 "done means" gates not yet verified against live DB):

**Migrations:**
- [ ] Migrations 032–033 applied (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Enable pg_cron in Supabase dashboard (Extensions → pg_cron)

**VAPID keys (one-time):**
- [ ] `npx web-push generate-vapid-keys`
- [ ] Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to `.env.local` and Vercel env vars
- [ ] Add `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` as Supabase Edge Function secrets (dashboard → Edge Functions → send-push → Secrets)

**Edge Function (one-time):**
- [ ] `supabase functions deploy send-push --no-verify-jwt`
- [ ] Supabase dashboard → Database → Webhooks → New webhook:
  - Table: `notification_recipients`, Event: `INSERT`
  - URL: `https://<project-ref>.supabase.co/functions/v1/send-push`
  - HTTP method: POST

**Verification:**
- [ ] Test: site check-in → `site_checkin_recorded` notification appears in bell within 5s (Realtime)
- [ ] Test: site check-in → push notification appears on locked phone screen
- [ ] Test: out-of-geofence check-in → `site_checkin_out_of_geofence` warning to Owner
- [ ] Test: midnight pg_cron run emits payment_due / checkpoint_overdue / reminder_due (check with dedupe key that re-run produces no duplicate)
- [ ] Test: payment_due notification visible to Owner only — Team Member sees nothing
- [ ] Test: reminder_due title includes category prefix ("Meeting reminder — …")
- [ ] Test: NotificationBell unread dot clears after mark-all-read
- [ ] Test: expired push endpoint → `is_active = false` in `push_subscriptions`
- [ ] Test: compact_old_notifications removes rows older than 90 days

### Phase 6 — Complete ✅
Built:
- Migration 030: `get_customer_portal()` SECURITY DEFINER function — rate-limited, abuse-logged, returns checkpoints (with F1 progress), payments, scan-clean images (storage refs only), drive URL, project tables payload; GRANT to anon only
- Migration 031: `record_table_row_revision()` trigger — auto-appends revision row on every `project_table_rows.cells` UPDATE
- API routes: `POST /api/projects/[id]/portal` (generate/revoke hash, Owner-only), `GET /api/portal/[hash]` (calls DB function + signs storage URLs server-side), `/api/projects/[id]/tables` (GET/POST), `/api/projects/[id]/tables/[tableId]` (PATCH/DELETE soft), `/api/projects/[id]/tables/[tableId]/rows` (GET/POST), `/api/projects/[id]/tables/[tableId]/rows/[rowId]` (PATCH/DELETE soft)
- Customer portal page `/c/[hash]` — replaces placeholder; read-only; pixel-matches `customer-portal.jsx` mock; project hero + summary cards + checkpoint timeline with F1 progress bars + payment schedule + image gallery (signed URLs) + Drive button + project tables (Drawing Register / Site Checklist read-only); SSR with signed URLs, no raw storage paths to browser; `Cache-Control: no-store`
- `CustomerPortalCard` client component on project detail page — Generate / Copy / Preview / Revoke link management for Owner
- `ProjectTablesSection` client component on project detail page — full table CRUD (add/edit/delete rows, checkbox toggles, revision_text columns, per-table progress bar); canEdit gated by `project_table:edit` capability
- Updated `lib/supabase/types.ts` — `get_customer_portal` RPC, `record_table_row_revision` function; all `project_table_*` Insert `tenant_id` marked optional (set by trigger)
- Build: zero errors, 54 routes ✅

Pending (Phase 6 "done means" gates not yet verified against live DB):
- [ ] Migrations 030–031 applied to cloud Supabase (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [x] Create `media-private` and `media-customer-public` Storage buckets — created 2026-05-17 (private, 10 MB limit, image + pdf mime types); update image uploads now functional
- [ ] Test: portal hash generates correctly via Owner button click
- [ ] Test: wrong hash returns 404; rate limit blocks after 60 hits/min
- [ ] Test: portal returns only scan-clean, customer-visible images
- [ ] Test: Drive folder URL shown only when `share_drive_with_customer = true`
- [ ] Test: checkpoint progress bars show correct `total_items`/`completed_items`
- [ ] Test: project table row edit triggers revision in `project_table_row_revisions`
- [ ] Test: anon cannot SELECT raw tables; can only call `get_customer_portal()`

### Phase 5 — Complete ✅
Built:
- Migrations 027_phase5_payments.sql, 028_phase5_views_rls.sql (payment_schedule, payment_records, v_payment_status, all triggers, RLS)
- `recompute_payment_is_paid()` trigger — auto-flips `is_paid` when sum(records) ≥ amount_due
- `mark_payment_triggered_on_checkpoint_approval()` trigger — sets `triggered_at` when linked checkpoint is approved
- `set_recorded_by_auth()` trigger — auto-populates recorded_by from auth.uid()
- FK: `project_checkpoints.triggers_payment_id → payment_schedule(id) ON DELETE SET NULL`
- API routes: `/api/projects/[id]/payments` (GET/POST), `/api/projects/[id]/payments/[scheduleId]` (PATCH/DELETE soft), `/api/projects/[id]/payments/[scheduleId]/records` (POST), `/api/finance` (GET + CSV export)
- `PaymentsCard` client component — milestone rows with progress bars, 4-state status chips (Pending/Due/Partial/Paid), Add/Edit/Delete/Record-Payment modals
- Partial payment: Owner records any amount against a milestone; variance shown; is_paid flips only when total ≥ due
- Project detail page — both payment placeholders replaced with real `PaymentsCard` (owner: full management; client column: read-only)
- `/finance` page — summary tiles (Invoiced/Received/Outstanding) + project pipeline table + CSV export
- Updated `lib/supabase/types.ts` with payment_schedule, payment_records, v_payment_status

Phase 5.1 additions (payment records editable):
- Migration 029 adds UPDATE + DELETE RLS on payment_records (customer_payments:edit gated)
- PATCH + DELETE `/api/projects/[id]/payments/[scheduleId]/records/[recordId]`
- PaymentsCard: each existing record row in the payment modal has Edit + Delete buttons
- Customer detail page (`/customers/[id]`) now shows full PaymentsCard for the linked project
- Capability gate unchanged — owner_capabilities:edit controls access everywhere

Pending (Phase 5 "done means" gates not yet verified against live DB):
- [ ] Migrations 027–028 applied to cloud Supabase (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Test: approving a checkpoint with triggers_payment_id sets triggered_at on the schedule row
- [ ] Test: recording payments summing to amount_due flips is_paid=true
- [ ] Test: partial payment shows "Partial" chip and correct variance
- [ ] Test: editing/deleting a paid row returns 409 from API
- [ ] Test: user without customer_payments:view gets empty schedule from v_payment_status
- [ ] Test: /finance page 404s for non-Owner; CSV export downloads cleanly

### Phase 4 — Complete ✅
Built:
- Migrations 022_phase4_customers.sql, 023_phase4_enquiries.sql, 024_phase4_calendar.sql, 025_phase4_public.sql, 026_phase4_rls.sql
- `enquiry_reminders.category` enum: meeting/quotation/drawing/call/follow_up/site_visit/other
- `projects.customer_id` FK wired (deferred from Phase 1) via migration 022
- Seed: `enquiry_intake` row for Tare Design Studio (slug: `tare-design-studio`)
- `public_rate_limit_hit()` with `pg_advisory_xact_lock` atomicity
- `submit_public_enquiry()` SECURITY DEFINER RPC — honeypot, time-guard, IP rate limit, phone soft-dedupe, GRANT to anon
- `sync_reminder_to_calendar()` trigger (migration 024 — after calendar_events exists)
- API routes: `/api/enquiries`, `/api/enquiries/[id]`, `/api/enquiries/[id]/remarks`, `/api/enquiries/[id]/reminders`, `/api/enquiries/[id]/convert`, `/api/calendar`, `/api/public/enquiry/[slug]`
- Enquiries Kanban at `/enquiries` — 6 columns (new/quotation_sent/awaiting_approval/closed_for_discussion/converted/lost), tone-coded, Convert button, NewEnquiryPanel modal
- Calendar at `/calendar` — month grid (Mon-based), day event panel, type filters, AddEventModal
- Public enquiry form at `/enquire/[tenantSlug]` — honeypot + time-guard + libphonenumber-js E.164 normalization
- Role-aware dashboard at `/` — site_engineer → redirect `/site`, team_member → `TeamMemberHome`, owner → existing view
- `TeamMemberHome.tsx` — 12-col grid: My Projects (progress bars), Broadcasts (unacknowledged highlighted), Today's Tasks, Bridge + Calendar quick-access panels
- Updated `lib/supabase/types.ts` with all Phase 4 tables

Pending (Phase 4 "done means" gates not yet verified against live DB):
- [ ] Migrations 022–026 applied to cloud Supabase (`DATABASE_URL=... npx tsx scripts/migrate.ts`)
- [ ] Test: public enquiry form rejects honeypot-filled submissions
- [ ] Test: public form rejects submissions under 2 seconds
- [ ] Test: IP rate limit blocks after threshold
- [ ] Test: phone soft-dedupe returns existing enquiry_id when duplicate detected
- [ ] Test: reminder → calendar sync trigger fires on insert
- [ ] Test: Owner sees Enquiries Kanban, team_member redirects correctly
- [ ] Test: site_engineer → /site redirect works

---

## Environment Variables
| Variable | Status | Where to get |
|----------|--------|--------------|
| NEXT_PUBLIC_SUPABASE_URL | ✅ set | — |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ✅ set | — |
| SUPABASE_SERVICE_ROLE_KEY | ✅ set | — |
| DATABASE_URL | ✅ set | Supabase → Settings → Database → Connection String |
| NEXT_PUBLIC_SITE_URL | ⬜ needed | Your Vercel URL or `http://localhost:3000` for dev |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | ⬜ Phase 1 | GCP service account |
| GOOGLE_PRIVATE_KEY | ⬜ Phase 1 | GCP service account JSON |
| GOOGLE_DRIVE_ROOT_FOLDER_ID | ⬜ Phase 1 | Drive folder shared with service account |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | ⬜ needed | `npx web-push generate-vapid-keys` (Next.js + Edge Function) |
| VAPID_PRIVATE_KEY | ⬜ needed | Edge Function secret only — never in Next.js |
| VAPID_SUBJECT | ⬜ needed | Edge Function secret — `mailto:admin@yourdomain.com` |

---

## Key File Locations
| What | Path |
|------|------|
| Supabase project ref | `hsgetpednslqecfcnlyz` |
| Brand tokens | `app/globals.css` |
| Capability list | `lib/auth/capabilities.ts` |
| DB migrations | `supabase/migrations/` |
| Seed (stub) | `supabase/seed/001_seed.sql` |
| Phase 1 seed | `supabase/migrations/014_phase1_seed.sql` |
| pgtap tests | `supabase/tests/` |
| Projects list | `app/(app)/projects/page.tsx` |
| New project modal | `app/(app)/projects/NewProjectModal.tsx` |
| Project detail | `app/(app)/projects/[id]/page.tsx` |
| Projects API | `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts` |
| Stage API | `app/api/projects/[id]/stage/route.ts` |
| Assignments API | `app/api/projects/[id]/assignments/route.ts` |
| Materials API | `app/api/projects/[id]/materials/route.ts` |
| Expenses API | `app/api/projects/[id]/expenses/route.ts`, `app/api/projects/[id]/expenses/[expenseId]/route.ts` |
| Check-in API | `app/api/projects/[id]/checkin/route.ts` |
| Site Engineer dashboard | `app/(app)/site/page.tsx`, `app/(app)/site/SiteEngineerDashboard.tsx` |
| Phase 2 migrations | `supabase/migrations/015_phase2_materials.sql` … `018_phase2_views_rls.sql` |
| Phase 3 migrations | `supabase/migrations/020_phase3_comms.sql`, `021_phase3_rls.sql` |
| Phase 4 migrations | `supabase/migrations/022_phase4_customers.sql` … `026_phase4_rls.sql` |
| Phase 5 migrations | `supabase/migrations/027_phase5_payments.sql`, `028_phase5_views_rls.sql` |
| Payments API | `app/api/projects/[id]/payments/route.ts`, `…/[scheduleId]/route.ts`, `…/records/route.ts` |
| Finance API | `app/api/finance/route.ts` |
| PaymentsCard | `components/payments/PaymentsCard.tsx` |
| Finance page | `app/(app)/finance/page.tsx` |
| Enquiries Kanban | `app/(app)/enquiries/page.tsx`, `app/(app)/enquiries/EnquiriesClient.tsx` |
| Calendar | `app/(app)/calendar/page.tsx`, `app/(app)/calendar/CalendarClient.tsx` |
| Public enquiry form | `app/(public)/enquire/[tenantSlug]/page.tsx` |
| Public enquiry API | `app/api/public/enquiry/[slug]/route.ts` |
| Enquiries API | `app/api/enquiries/route.ts`, `app/api/enquiries/[id]/route.ts` |
| Calendar API | `app/api/calendar/route.ts` |
| Team Member Home | `app/(app)/TeamMemberHome.tsx` |
| Bridge page | `app/(app)/bridge/page.tsx`, `app/(app)/bridge/BridgeClient.tsx` |
| Bridge API | `app/api/projects/[id]/bridge/route.ts` |
| Updates API | `app/api/projects/[id]/updates/route.ts` |
| Daily tasks API | `app/api/daily-tasks/route.ts`, `app/api/daily-tasks/export/route.ts` |
| Broadcasts API | `app/api/broadcasts/route.ts`, `app/api/broadcasts/[id]/ack/route.ts` |
| BroadcastsPanel | `app/(app)/team/BroadcastsPanel.tsx` |
| DailyTasksWidget | `app/(app)/team/DailyTasksWidget.tsx` |
| Phase 6 migrations | `supabase/migrations/030_phase6_portal.sql`, `031_phase6_table_revisions.sql` |
| Portal hash API | `app/api/projects/[id]/portal/route.ts` |
| Portal fetch API | `app/api/portal/[hash]/route.ts` |
| Customer portal page | `app/(portal)/c/[hash]/page.tsx` |
| CustomerPortalCard | `app/(app)/projects/[id]/CustomerPortalCard.tsx` |
| ProjectTablesSection | `app/(app)/projects/[id]/ProjectTablesSection.tsx` |
| Tables API | `app/api/projects/[id]/tables/route.ts` … `rows/[rowId]/route.ts` |
| Phase 9 migrations | `supabase/migrations/037_team_member_tags.sql` … `041_in_app_notifications.sql` |
| Team Member cards | `app/(app)/team-member/AttendanceCard.tsx`, `BroadcastsCard.tsx`, `TasksCard.tsx`, `RemindersCard.tsx` |
| Broadcasts page | `app/(app)/broadcasts/page.tsx`, `BroadcastsClient.tsx` |
| Tasks page | `app/(app)/tasks/page.tsx`, `TasksClient.tsx` |
| Attendance API | `app/api/attendance/route.ts` |
| Member tasks API | `app/api/member-tasks/route.ts`, `[id]/route.ts` |
| Personal reminders API | `app/api/personal-reminders/route.ts`, `[id]/route.ts` |
| Owner attendance overview | `app/(app)/team/AttendanceOverview.tsx` |
| Phase 8 migrations | `supabase/migrations/034_phase8_team_performance.sql`, `035_phase8_audit_triggers.sql` |
| Performance API | `app/api/performance/route.ts`, `app/api/performance/[userId]/route.ts` |
| Audit API | `app/api/audit/route.ts`, `app/api/audit/export/route.ts` |
| Performance page | `app/(app)/performance/page.tsx`, `app/(app)/performance/PerformanceClient.tsx` |
| Audit page | `app/(app)/audit/page.tsx`, `app/(app)/audit/AuditClient.tsx` |
| Phase 7 migrations | `supabase/migrations/032_phase7_notifications.sql`, `033_phase7_push.sql` |
| Notifications API | `app/api/notifications/route.ts` |
| Push subscribe API | `app/api/push/subscribe/route.ts` |
| Cron handler | `app/api/cron/notify/route.ts` |
| NotificationBell | `components/notifications/NotificationBell.tsx` |
| SwRegister | `components/notifications/SwRegister.tsx` |
| Service worker | `public/sw.js` |
| Push sender | `lib/push.ts` |
| Design mocks | `ArchitectOS copy/` (reference only) |
| System spec | `design.md` (v2.1 — source of truth) |
| Implementation plan | `hey-claude-read-the-jaunty-firefly.md` |
