# SCHEMA.md
(Updated: 2026-06-08 — migration 075: audit_log capped at 100 per tenant ON INSERT; all existing audit rows cleared)

### Migration 075 — audit_log cap 100, enforced on insert (applied 2026-06-08, supersedes 072)
- Cap lowered **500 → 100** per tenant, and enforcement moved from the daily cron job to an **AFTER INSERT statement-level trigger** (`trg_audit_log_cap` → `enforce_audit_log_cap()` → `prune_audit_log_to_cap()`). Every new audit row immediately evicts the oldest rows beyond the newest 100 per `tenant_id`.
- The `audit-log-retention` pg_cron job is unscheduled (no longer needed). `prune_audit_log_to_cap()` kept (now caps at 100) for ad-hoc use.
- Safe for the hash chain: forward validation derives `prev_hash` from the newest surviving row, so pruning oldest never breaks it (same reasoning as 072). No recursion — `audit_trigger()` is on other tables, not on `audit_log`.
- All pre-existing audit_log rows (500) were deleted as a one-time op alongside this migration (backup: `tare_auditlog_backup_*.dump`). Next insert anchors a fresh chain.
- Verified: 105 single inserts settle at exactly 100; bulk insert keeps newest rows, evicts oldest.

### Data: Tare employees seeded (2026-06-07)
- `scripts/seed-users.ts` created 20 real auth + app users from the employee sheet (tenant `Tare Design Studio`). Flow mirrors `app/api/invite/route.ts`: `auth.admin.createUser` (email_confirm, shared temp password) → `public.users` → `user_capabilities` (manual) → `team_member_tags` (trigger 065 syncs `source='tag'` caps).
- Roles: owner=1 (Nayan Kumar H.T.), site_engineer=4 (Srinivas Prasad, Manjunath S, Mohammed Sidddiq, Adarsha Pejawar), team_member=15. Tags: Adarsha=project_manager, Manasa Suresh=accountant. Ravindranath P is `is_active=false`.
- Two rows had no email in the sheet → placeholder emails `manjunath.s@tare.local`, `keerthi.kumar@tare.local` (update before those two need real logins).

### Data: Tare projects seeded (2026-06-07)
- `scripts/seed-projects.ts` loaded 45 projects from `PROJECTS.xlsx` (name/slug/scope/stage/status only; customer/budget/type/dates left null). All `status=active`, `scope=design_and_execution`.
- 40 from Sheet 1 (TOTAL PROJECTS) + 5 from Sheet 3 (PIPELINE) = 38 in `design` stage. The 7 Sheet-2 "CONSTRUCTION UNDER MEDHYA" names are the SAME Sheet-1 projects upgraded to `current_stage=execution` (VARUN, NIHARIKA, MONISHA, SUNIL-CONVENTION→from "SUNIL", HARSHA, SURESH, RANGA SRINIVAS). No duplicate rows created.
- Slugs are slugified names, deduped with `-N` suffix on collision; unique per `(tenant_id, slug)`.

### Migration 074 — wipe all users + auth (applied 2026-06-07)
- One-time wipe of every user, ahead of loading the new client's users. Structure unchanged.
- **Deleted:** `auth.users` (login accounts) → cascades via `public.users.id → auth.users (ON DELETE CASCADE)` to `public.users`, and onward to `user_capabilities`, `user_sessions`, `team_member_tags`, `push_subscriptions`. Tenant now has ZERO users — no login possible until new users are loaded.
- **Kept:** tenants (+config), enquiry_intake, audit_log/audit_export_log, all presets/templates.
- **FK change (permanent):** `audit_log.actor_id` FK changed from `NO ACTION` → **`ON DELETE SET NULL`** (matches its design intent, "null for system/cron"). Lets user deletes null the actor reference via FK action instead of a manual UPDATE — preserving the append-only hash chain (invariant #3). **Invariant: never manually UPDATE audit_log; rely on this SET NULL FK for actor cleanup.**
- **Blockers cleared first** (all `NO ACTION` FKs into `users`): nulled `created_by` on the 4 kept preset/template tables; pre-deleted `user_capabilities`, `user_sessions`, `team_member_tags` (their `granted_by`/`revoked_by` cols block the cascade though their rows were going anyway).
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 073 — wipe client/operational data (applied 2026-06-07)
- One-time data wipe ahead of onboarding a new client. **Structure unchanged** — TRUNCATE/DELETE only.
- **Wiped (36 data tables):** projects + all children (assignments, checkpoints, checkpoint_items, work_log, project_table* ×5), material_plan, material_consumption, expenses, site_check_ins, payment_schedule, payment_records, customers, enquiries (+ phones/remarks/reminders), calendar_events, updates, media_assets, bridge_messages, owner_broadcasts (+recipients), team_daily_tasks, member_tasks, personal_reminders, attendance_logs, team_performance_monthly, notifications (+recipients), public_abuse_log, public_rate_limit_buckets.
- **Kept:** tenants, users, **user_capabilities (tenant-wide rows preserved; project-scoped rows dropped)**, user_sessions, team_member_tags, enquiry_intake (config), push_subscriptions, audit_log (append-only, invariant #3), audit_export_log, and ALL presets/templates (checkpoint_templates+items, table_presets+children, material_plan_presets+items, payment_milestone_presets+items).
- **Gotcha encoded in the migration:** `user_capabilities` has FK → `projects` (on_delete=NO ACTION) and is the *only* external table referencing the wipe set. `TRUNCATE ... CASCADE` is table-level and would wipe ALL of user_capabilities; TRUNCATE without CASCADE refuses. Migration stashes tenant-wide cap rows in a TEMP table, truncates `user_capabilities` inside the self-contained list (no CASCADE), then re-inserts them. **Invariant: never TRUNCATE projects with CASCADE — it nukes user_capabilities.**
- audit_log temporarily exceeds 500/tenant from the wipe's own audit entries; pg_cron `prune_audit_log_to_cap()` (072) restores the cap at 03:30 UTC.
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

## Status: Phase 10 migrations (043–050) + 051–066 + 999_add + 999_zz applied to cloud Supabase. Migrations 067 + 068 + 070 written, awaiting apply.

### Migration 070 — site check-in → check-out + per-site hours (NOT YET APPLIED)
- `site_check_ins.checked_out_at timestamptz NULL` — when the engineer left the site; NULL = currently on site (open session).
- `site_check_ins.duration_minutes int NULL` — `floor((checked_out_at − checked_in_at)/60s)`, set by the app on check-out; NULL while open.
- Partial unique index `idx_site_checkin_open_session (user_id, project_id) WHERE checked_out_at IS NULL` — at most one open session per engineer per project.
- Behaviour: `POST /api/projects/[id]/checkin` accepts `action: "check_in" | "check_out"` (defaults `check_in`). Check-out closes the latest open row and records duration. Per-site worked hours = `SUM(duration_minutes)`. Replaces office (`SiteAttendanceCard`) check-in/out on the **site-engineer dashboard only** — office attendance flow for team members is unchanged.
- Team member detail page (site engineers) gains a **Site Hours** card: total hours, days on site, days absent (working days in range − distinct check-in days), per-site hours table; Site Check-Ins rows now show in→out times + duration.
- Types: hand-patched `lib/supabase/types.ts` (`site_check_ins` Row/Insert/Update add `checked_out_at`, `duration_minutes`).
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 068 — attendance accumulate + site-engineer office attendance (NOT YET APPLIED)
- `attendance_logs.accumulated_minutes int NOT NULL DEFAULT 0` — running sum of each CLOSED check-in→check-out cycle in the day. Backfilled from `total_minutes` for existing rows.
- `attendance_logs.last_check_in_at timestamptz NULL` — start of the currently-open cycle; NULL when checked out / day complete.
- Behaviour: a member/engineer may run multiple cycles a day. On check-out the app adds `(now − last_check_in_at)` to `accumulated_minutes` and clears `last_check_in_at`; a fresh check-in re-opens a cycle and bumps `check_in_count`. The legacy GENERATED `total_minutes` (first-in→last-out) stays for back-compat but the UI shows `accumulated_minutes` ("Worked").
- Grants `office_attendance:write_own` to all existing `site_engineer` users (guarded by NOT EXISTS, scope_project_id IS NULL). New site engineers get it from `SITE_ENGINEER_CAPABILITIES` in `lib/auth/capabilities.ts`.
- No RLS change — existing `member_*_own_attendance` policies already gate on `office_attendance:write_own` + `user_id = auth.uid()`.
- Types: hand-patched `lib/supabase/types.ts` (`attendance_logs` Row/Insert/Update add `accumulated_minutes`, `last_check_in_at`).
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 067 — project scope (NOT YET APPLIED)
- Adds `projects.scope text NOT NULL DEFAULT 'design_and_execution'` with CHECK constraint `scope IN ('design_only','design_and_execution')`.
- Existing rows default to `design_and_execution` so behaviour is unchanged.
- Index: `idx_projects_scope (scope) WHERE deleted_at IS NULL`.
- Wiring: New + Edit project modals expose a Scope selector; `projects` POST/PATCH zod schemas accept it. The stage route refuses `execution` when scope is `design_only`. The PATCH route refuses `scope='design_only'` when the project is already in the execution stage. `/projects` gains a Scope filter chip group. The project detail page hides the Material Plan card, Expense Summary, and the full-width Execution Tables section when the project is design-only.
- Types: hand-patched `lib/supabase/types.ts` (Row/Insert/Update) to add `scope` (no `supabase gen types` — same pattern as migration 066).
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 064 — fix project_tables soft-delete (applied 2026-05-18)
- Root cause: a direct `UPDATE ... SET deleted_at` fails RLS — Postgres also enforces the SELECT policy's `USING (deleted_at IS NULL)` against the post-update row, so the new row violates the SELECT policy ("new row violates row-level security policy"). Migration 058 fixed the UPDATE policy's WITH CHECK but not this.
- Fix: `soft_delete_project_table(p_project_id, p_table_id)` — SECURITY DEFINER, checks `project_table:edit`, sets `deleted_at`, returns the id (NULL when nothing matched). DELETE table route calls it via RPC.

### Migration 063 — project table column insert/delete (applied 2026-05-18)
- `project_table_columns` UNIQUE (project_table_id, display_order) now `DEFERRABLE INITIALLY IMMEDIATE` so bulk renumbering does not transiently collide. (Applied 2026-05-18)
- `shift_table_columns_after(p_table_id, p_after_order)` — opens a slot by `display_order + 1` for columns after the given order (used when inserting a column between two columns).
- `delete_table_column(p_table_id, p_column_id)` — hard-deletes a column and shifts later columns `display_order - 1`. Orphaned cell values keyed by the column id remain in row JSONB, never rendered.

### Migration 072 — audit log row cap (applied 2026-06-01)
- Replaces the 30-day time retention (migration 062) with a **per-tenant 500-row cap**.
- pg_cron job `audit-log-retention` (`30 3 * * *`) now runs `prune_audit_log_to_cap()`: keeps newest 500 rows per `tenant_id` (`row_number() OVER (PARTITION BY tenant_id ORDER BY occurred_at DESC, id DESC) > 500` deleted).
- Hard-delete only, no archive. Forward hash chain stays valid (new inserts chain off the newest surviving row).

### Migration 062 — audit log retention (applied 2026-05-18, superseded by 072)
- pg_cron job `audit-log-retention` (`30 3 * * *`): `DELETE FROM audit_log WHERE occurred_at < now() - interval '30 days'`.
- Hard-delete only, no archive. Hash chain stays valid for surviving rows.

### Migration 060 — attendance re-check-in (applied 2026-05-17)
- Adds `attendance_logs.check_in_count` (int, NOT NULL, default 1)
- Behaviour: a team member can log attendance again the same day. One row per day stays; the row keeps the FIRST `check_in_at` and the LAST `check_out_at`; each re-check-in increments `check_in_count`. `total_minutes` (GENERATED) recomputes from first-in → last-out.
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 059 — comms edit/delete (applied 2026-05-17)
- Adds `updates.edited_at` (timestamptz), `updates.deleted_at` (timestamptz) — in-place edit + soft delete by the authoring user
- Adds `owner_broadcasts.edited_at` (timestamptz) — in-place edit by the authoring owner
- RLS: `updates_select` now excludes `deleted_at IS NOT NULL`; new `updates_update` policy (`author_id = auth.uid()`); new `broadcasts_update` policy (`author_id = auth.uid() AND has_capability('broadcast:create')`)
- Grants `UPDATE` on `updates` and `owner_broadcasts` to `authenticated`
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 058 — fix project_tables soft-delete (applied 2026-05-17)
- Recreates the `project_tables` UPDATE policy with an explicit `WITH CHECK` (without `deleted_at IS NULL`)
- Root cause: the policy had only `USING`, which Postgres reused as the check — so soft-deleting (setting `deleted_at`) failed silently and the DELETE route affected 0 rows
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 057 — media_assets Google Drive sync columns (applied 2026-05-17)
- Adds to `media_assets`: `drive_file_id` (text), `drive_sync_status` (text, CHECK `pending`/`synced`/`failed`/`skipped`, default `pending`), `drive_sync_error` (text), `drive_synced_at` (timestamptz)
- New index `idx_media_drive_sync` on `(project_id, kind, drive_sync_status, created_at DESC)` for the Supabase pruner
- Behaviour: uploaded site images / drawings are pushed to the project's `drive_folder_url` Drive folder; Supabase keeps only the 15 newest per kind per project; an older row is pruned ONLY once `drive_sync_status='synced'` (Drive is the permanent store, no data loss)
- Apply: `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Migration 056 — fix media_assets RLS capability names (applied 2026-05-17)
- 021_phase3_rls.sql referenced two capabilities that were never declared in `lib/auth/capabilities.ts`, so `has_capability()` always returned false for them:
  - `media_select` used `images:view_all` → corrected to `images:view`
  - `media_update` used `images:manage` → corrected to `images:select_for_customer`
- Bug effect: unassigned tenant admin/PM could not read project images (tenant-wide grant branch was dead — only `is_assigned_to_project()` worked)
- Both policies dropped + recreated with the real capability strings
- **Invariant: every `has_capability('x')` in an RLS policy must reference a string that exists in `CAPABILITIES` in `lib/auth/capabilities.ts`**

### Migration 055 — material plan presets (applied 2026-05-17)
- `material_plan_presets` — tenant-scoped reusable material plan templates: `(id, tenant_id, name, is_system, created_by, created_at, updated_at, deleted_at)`, UNIQUE `(tenant_id, name)`
- `material_plan_preset_items` — `(id, preset_id, tenant_id, material_name, unit, planned_quantity, sequence_order)`, UNIQUE `(preset_id, sequence_order)`
- RLS read+write gated by `materials:plan`; delete blocked on `is_system = true`
- `set_tenant_from_creating_user()` trigger on presets (tenant from auth.uid()); `set_tenant_from_material_plan_preset()` denormalises tenant_id onto items
- Explicit Data API grants to `authenticated` + `service_role` (Supabase no longer auto-exposes new tables)
- Applied via preset: `POST /api/projects/[id]/material-plan/from-preset` inserts a `material_plan` row per preset item

### Migration 054 — retire planning/cancelled project statuses (applied 2026-05-16)
- `project_status` enum keeps all 5 values (Postgres enum values can't be dropped), but `planning`/`cancelled` are retired from UI + API
- Live rows re-homed: `planning → active`, `cancelled → on_hold`
- API zod enums reduced to `active`/`on_hold`/`completed`; POST default now `active`

### Migration 053 — audit_log actor FK (applied 2026-05-16)
- Added FK `audit_log.actor_id → users(id)` ON DELETE SET NULL
- Its absence broke the audit page: the query embeds `actor:actor_id(...)`, which PostgREST can only resolve via an FK — without it the whole query returned null (empty audit page despite 407 rows)
- **Invariant: any PostgREST embedded resource (`alias:fk_col(...)`) requires a real FK constraint**

### Migration 052 — fix audit_trigger on tenant-less tables (applied 2026-05-16)
- Migration 035 attached `audit_trigger()` to `table_preset_columns/sections/rows` (no `tenant_id` column) and `tenants` (no `tenant_id` / `deleted_at`) → `record "new" has no field "tenant_id"`/`deleted_at`
- `audit_trigger()` hardened: resolves `tenant_id` AND `deleted_at` via JSONB (`v_after->>'...'`), never direct field access; `tenants` falls back to its own `id` as tenant
- Dropped audit triggers on the 3 `table_preset_*` child tables (parent `table_presets` is audited)
- **Invariant: `audit_trigger()` must only use JSONB lookups for row fields — never NEW.x/OLD.x except `.id`**

### Migration 051 — preset fixes (applied 2026-05-16)
- `set_tenant_from_creating_user()` trigger function — populates `tenant_id` from `auth.uid()` when NULL
- `trg_payment_presets_set_tenant` BEFORE INSERT on `payment_milestone_presets` — fixes NOT NULL `tenant_id` violation
- `service_role` GRANTs on `table_presets`, `table_preset_columns/sections/rows` — child-table CRUD via service client failed silently without these

### Migration 999_add_checkpoint_details (applied 2026-05-16)
- `project_checkpoints.remarks text` + `completion_percentage numeric(5,2) DEFAULT 0` (idempotent — `ADD COLUMN IF NOT EXISTS`)

### Migration 999_zz_explicit_data_api_grants (applied 2026-05-16)
- Explicit Data API grants — Supabase no longer auto-exposes new public tables to PostgREST
- Revokes all table/sequence access from `anon` (anon uses SECURITY DEFINER RPCs only)
- **Sole source of `tenants` RLS policies** (SELECT for tenant members, UPDATE for owners)
- Per-table GRANTs to `authenticated` + `service_role` for every app table/view
- **When adding a new table: add its grant here**

---

## Phase 10 Tables / Columns (043–050)

### Column additions
- `project_checkpoints.started_at timestamptz NULL` — orange "Under Progress" state (043)
- `projects.whatsapp_group_url text NULL` (044)
- `projects.scope text NOT NULL DEFAULT 'design_and_execution'` CHECK IN ('design_only','design_and_execution') (067)
- `payment_records.method` CHECK extended: `bank | neft | upi | cheque | cash` (045)
- `projects.source_payment_preset_id uuid` FK → `payment_milestone_presets(id)` (046)
- `customers.customer_portal_hash text UNIQUE NULL` + `customer_portal_hash_generated_at timestamptz NULL` + `customer_portal_enabled boolean DEFAULT false` (048)
- `material_plan.linked_project_table_id uuid` FK → `project_tables(id)` (049)
- `material_plan.linked_project_table_row_id uuid` FK → `project_table_rows(id)` (049)
- `expenses.linked_material_plan_id uuid` FK → `material_plan(id)` (049)
- `enquiries.deleted_at timestamptz NULL` — soft delete (047)

### New tables
- `payment_milestone_presets` — tenant-scoped payment milestone templates (046)
- `payment_milestone_preset_items` — `(preset_id, milestone_name, percentage, sequence_order, notes)` (046)
- `enquiry_phones` — `(enquiry_id, phone, label, is_primary)` (047)

### New functions / triggers
- `enforce_checkpoint_progression()` — BEFORE UPDATE on `project_checkpoints`; 3 rules: cannot start already-approved, cannot start if earlier checkpoint unapproved, cannot approve without starting first (043)
- `get_customer_portal_summary(p_hash, p_ip, p_user_agent, p_request_id)` — SECURITY DEFINER, anon-callable, returns all projects + payment status + checkpoint progress (total/completed items, progress_pct) for a customer; rate-limited (60/min/IP); abuse-logged (048, 061)
- `set_tenant_from_enquiry()` — denormalises tenant_id on `enquiry_phones` insert (047)

### Updated views
- `v_project_checkpoint_status` — adds `in_progress` status when `started_at IS NOT NULL` and `approved_at IS NULL` (043)
- `v_checkpoint_progress` — surfaces `started_at` (043)

### New capability
- `checkpoint:progress` — start/complete a milestone (granted to Owner + `project_manager` tag) (050)

---

## Enums (declared in `004_phase0_users.sql`)

| Enum | Values |
|------|--------|
| `app_role` | owner, team_member, site_engineer |
| `project_stage` | design, execution |
| `project_status` | planning, active, on_hold, completed, cancelled (only active/on_hold/completed used since 054) |
| `project_type` | residential, commercial, institutional, industrial, interior, landscape, other |
| `notification_severity` | info, warning, critical |

---

## Phase 0 Tables

### `tenants`
One row per practice (single-tenant v1).
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| name | text | — | NOT NULL |
| slug | text | — | NOT NULL UNIQUE |
| variance_threshold_pct | numeric(5,2) | 25 | Hours over/under alert |
| material_excess_threshold_pct | numeric(5,2) | 15 | Material excess alert |
| soft_delete_retention_days | int | 60 | Hard purge after this many days |
| gps_retention_days | int | 30 | GPS coords nulled after this |
| completed_reminders_visible | boolean | false | |
| office_lat | double precision | null | For Team Member check-in geofence |
| office_lng | double precision | null | |
| office_geofence_radius_m | int | 200 | |
| created_at / updated_at | timestamptz | now() | auto-touched by trigger |

### `users`
Mirrors auth.users 1:1 via `id → auth.users(id)`.
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | — | PK = auth.users.id |
| tenant_id | uuid | — | NOT NULL → tenants |
| role | app_role | — | NOT NULL |
| role_label | text | null | Human-readable override |
| full_name | text | — | NOT NULL |
| phone | text | null | |
| experience_years | int | null | |
| skill_score | numeric(4,1) | null | |
| salary_inr | numeric(12,2) | null | |
| is_active | boolean | true | |
| mfa_enrolled_at | timestamptz | null | |
| invitation_token_hash | text | null | SHA-256 of plaintext token (never store plaintext) |
| last_login_at | timestamptz | null | |
| password_last_changed_at | timestamptz | null | |
| deleted_at | timestamptz | null | Soft delete |

Indexes: `(tenant_id) WHERE deleted_at IS NULL`, `(tenant_id, role) WHERE deleted_at IS NULL AND is_active = true`

### `user_sessions`
Per-device session tracking; Owner can revoke specific devices.
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | → users |
| device_label | text | |
| ip_address | inet | |
| revoked_at / revoked_by | timestamptz / uuid | |

### `user_capabilities`
Access matrix — **source of truth for all permission checks**.
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | → users |
| capability | text | see `lib/auth/capabilities.ts` |
| granted | boolean | DEFAULT true |
| scope_project_id | uuid | null = all projects |
| source | text | DEFAULT 'manual'; CHECK IN ('manual','tag') — distinguishes Owner-granted rows from tag-derived ones |
| UNIQUE | — | (user_id, capability, scope_project_id) |

**Trigger:** `enforce_access_control_manage` — blocks INSERT/UPDATE of `access_control:manage` for any non-owner. Non-bypassable.

**Trigger:** `trg_apply_tag_capabilities` / `trg_revoke_tag_capabilities` (065) — on `team_member_tags` INSERT/DELETE, sync `source='tag'` capability rows. Tag grants follow the tag; `source='manual'` rows are never touched by them.
**Helper:** `tag_capability_set(p_tag text)` — returns the capability set for a tag. **Mirrors `TAG_CAPABILITIES` in `lib/auth/capabilities.ts` — keep both in sync.** (Updated: 2026-05-18)

### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| tenant_id | uuid | NOT NULL |
| kind | text | e.g. checkpoint_overdue, site_checkin_recorded |
| severity | notification_severity | info / warning / critical |
| source_type | text | NOT NULL (required) |
| dedupe_key | text | UNIQUE per tenant — duplicate emissions silently skip |

**`emit_notification()`** is the only INSERT path. Revoked from anon / authenticated / public. Granted to `notification_writer` only.

### `notification_recipients`
Per-user, per-notification. `is_read`, `is_acknowledged`, push delivery tracking columns.

### `push_subscriptions`
Web Push endpoints per device. Populated in Phase 7.

### `audit_log`
Append-only. No UPDATE or DELETE RLS policies exist.
| Column | Type | Notes |
|--------|------|-------|
| tenant_id | uuid | Denormalized (no FK — orphan-safe) |
| actor_id | uuid | null for system/cron |
| action | text | insert / update / delete / soft_delete / hard_purge / session_revoke |
| prev_hash | text | hex SHA-256 of previous row's hash |
| row_hash | text | hex SHA-256 of canonical form |

**Chain mechanics:** Per-tenant `pg_advisory_xact_lock` taken inside `audit_trigger()` before reading `prev_hash`. After monthly archive truncation, first new row anchors to `audit_export_log.last_row_hash`. Zero-hash for very first row.

**Retention:** pg_cron job `audit-log-retention` caps the table at the newest **500 rows per tenant** daily at 03:30 UTC via `prune_audit_log_to_cap()` (migration 072, supersedes the 30-day rule from 062). No archive.

### `audit_export_log`
Records each monthly Drive archive: `first_row_hash`, `last_row_hash`, `export_sha256`, `drive_file_id`.

### `_migrations`
Internal table created by `scripts/migrate.ts` to track applied files. Not part of the app schema.

---

## Helper Functions

| Function | Returns | Notes |
|----------|---------|-------|
| `has_capability(cap, project_id?)` | boolean | STABLE SECURITY DEFINER — used in every RLS policy |
| `is_assigned_to_project(project_id)` | boolean | Checks project_assignments |
| `project_in_stage(project_id, stage)` | boolean | Checks projects.current_stage |
| `set_tenant_from_project()` | trigger | BEFORE INSERT — denormalises tenant_id from parent project |
| `set_tenant_from_user()` | trigger | BEFORE INSERT — denormalises tenant_id from parent user |
| `touch_updated_at()` | trigger | BEFORE UPDATE — keeps updated_at current |
| `current_user_tenant_id()` | uuid | STABLE SECURITY DEFINER — returns tenant_id for auth.uid(); used in users RLS to avoid self-referential recursion |
| `emit_notification(...)` | uuid | Only insert path for notifications; owned by notification_writer |
| `audit_trigger()` | trigger | SECURITY DEFINER, owned by audit_writer; append-only with hash chain |
| `enforce_access_control_manage()` | trigger | Blocks access_control:manage grants to non-owners |

---

## Invariants (NEVER violate)
1. **Tenant denormalization** — every project-scoped table carries `tenant_id` NOT NULL, populated by `set_tenant_from_*()` trigger.
2. **access_control:manage** — Owner-only; trigger-enforced; cannot be delegated.
3. **audit_log** — no UPDATE or DELETE RLS policies; append-only forever.
4. **emit_notification()** — revoked from anon / authenticated / public; only notification_writer can call it.
5. **Service role key** — never in app code paths; migrations and admin scripts only.
6. **invitation_token_hash** — stores SHA-256 only; plaintext lives only in the email link.
7. **Correction pattern** — for work_log / material_consumption / expenses: insert a new correcting row, never UPDATE the original. Report via `v_*_current` views (added in Phase 2).

---

## Phase 3 Tables (020_phase3_comms.sql, 021_phase3_rls.sql)

### `updates`
Activity feed per project. Authors = assigned users; author may edit/soft-delete own (migration 059).
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | via set_tenant_from_project() trigger |
| project_id | uuid | NOT NULL → projects |
| author_id | uuid | NOT NULL → users |
| author_role_on_project | text | denormalized for filter |
| update_type | text | note / image / drawing / progress / remark / material / expense |
| body | text | |
| created_at | timestamptz | |
| edited_at | timestamptz | set on author in-place edit (migration 059) |
| deleted_at | timestamptz | soft delete; hidden by `updates_select` RLS (migration 059) |

### `media_assets`
Uploaded files (site images, drawings, receipts). All uploads start `scan_status='pending'`.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | |
| project_id | uuid | NOT NULL → projects |
| storage_path | text | Supabase Storage key |
| bucket | text | media-private / media-customer-public |
| kind | text | site_image / drawing / receipt / document |
| uploaded_by | uuid | → users |
| scan_status | text | pending / clean / infected / error |
| is_clean | boolean | GENERATED (scan_status = 'clean') |
| visible_to_customer | boolean | Owner toggles |
| linked_update_id | uuid | → updates |
| linked_checkpoint_item_id | uuid | → checkpoint_items |
| drive_file_id | text | Google Drive file ID once synced (migration 057) |
| drive_sync_status | text | pending / synced / failed / skipped (migration 057) |
| drive_sync_error | text | last Drive sync error message (migration 057) |
| drive_synced_at | timestamptz | set when drive_sync_status → synced (migration 057) |

### `bridge_messages`
Per-project coordination channel. Immutable once posted.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | |
| project_id | uuid | NOT NULL → projects |
| author_id | uuid | NOT NULL → users |
| message_type | text | text / image / drawing_ref / material_request / clarification |
| body | text | |
| structured_payload | jsonb | material_request: {item_name, quantity, unit}; clarification: {question} |
| created_at | timestamptz | |

**Trigger:** `bridge_material_request_to_plan` — AFTER INSERT, when `message_type = 'material_request'` inserts a draft row into `material_plan` with `source_bridge_message_id` set.

### `team_daily_tasks`
Self-reported daily task log per team member.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL (no project parent — must be provided) |
| user_id | uuid | NOT NULL → users |
| project_id | uuid | optional → projects |
| task_date | date | DEFAULT current_date |
| description | text | 1–200 chars |
| is_done | boolean | DEFAULT false |
| done_at | timestamptz | auto-set by trigger when is_done flips true |

**CSV export:** `GET /api/daily-tasks/export` — own tasks by default; Owner can export any user via `?user_id=`.

### `owner_broadcasts`
One-to-many announcements from capability-gated author to named recipients.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL |
| author_id | uuid | NOT NULL → users |
| body | text | NOT NULL |
| attachment_url | text | optional |
| created_at | timestamptz | |
| edited_at | timestamptz | set on author in-place edit (migration 059) |

### `owner_broadcast_recipients`
Per-recipient acknowledgement tracking.
| Column | Type | Notes |
|--------|------|-------|
| broadcast_id | uuid | → owner_broadcasts ON DELETE CASCADE |
| user_id | uuid | → users |
| is_acknowledged | boolean | DEFAULT false |
| acknowledged_at | timestamptz | auto-set by trigger |
| UNIQUE | — | (broadcast_id, user_id) |

**Also added:** `material_plan.source_bridge_message_id uuid REFERENCES bridge_messages(id)` — links draft plan rows created by material_request bridge messages.

---

## Phase 4 Tables (022–026)

### New Enums (023_phase4_enquiries.sql)
| Enum | Values |
|------|--------|
| `enquiry_status` | new, quotation_sent, awaiting_approval, closed_for_discussion, converted, lost |
| `enquiry_source` | referral, instagram, youtube, whatsapp, website, walk_in, other |
| `reminder_category` | meeting, quotation, drawing, call, follow_up, site_visit, other |
| `reminder_priority` | low, medium, high |

### `customers` (022_phase4_customers.sql)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants |
| name | text | NOT NULL |
| phone | text | |
| email | text | |
| address | text | |
| created_from_enquiry_id | uuid | → enquiries (deferred FK in 023) |
| created_at | timestamptz | |

**Also in 022:** `ALTER TABLE projects ADD CONSTRAINT projects_customer_id_fk FOREIGN KEY (customer_id) REFERENCES customers(id)` (deferred from Phase 1)

### `enquiries` (023_phase4_enquiries.sql)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants |
| name | text | NOT NULL |
| phone | text | E.164 normalized in app layer |
| email | text | |
| source | enquiry_source | DEFAULT 'other' |
| message | text | |
| status | enquiry_status | DEFAULT 'new' |
| assigned_to | uuid | → users |
| converted_to_customer_id | uuid | → customers |
| intake_id | uuid | → enquiry_intake |
| ip_address | inet | from public submission |
| created_at / updated_at | timestamptz | |

### `enquiry_remarks` (023_phase4_enquiries.sql)
Threaded notes on an enquiry by internal users.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| enquiry_id | uuid | NOT NULL → enquiries |
| tenant_id | uuid | |
| author_id | uuid | → users |
| body | text | NOT NULL |
| created_at | timestamptz | |

### `enquiry_reminders` (023_phase4_enquiries.sql)
Follow-up reminders; XOR constraint: linked to enquiry OR customer, never both.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL |
| enquiry_id | uuid | → enquiries (XOR with customer_id) |
| customer_id | uuid | → customers (XOR with enquiry_id) |
| assigned_to | uuid | → users |
| category | reminder_category | DEFAULT 'other' |
| priority | reminder_priority | DEFAULT 'medium' |
| due_at | timestamptz | |
| is_done | boolean | DEFAULT false |
| done_at | timestamptz | auto-set by trigger when is_done flips true |

**Trigger:** `set_reminder_done_at` — BEFORE UPDATE, sets done_at = now() when is_done becomes true.
**Trigger:** `sync_reminder_to_calendar` (in 024) — AFTER INSERT on enquiry_reminders → inserts row into calendar_events.

### `enquiry_intake` (023_phase4_enquiries.sql)
Per-tenant intake channel config. Seed row for Tare Design Studio included.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL UNIQUE → tenants |
| intake_slug | text | NOT NULL UNIQUE — maps to `/enquire/[slug]` |
| is_active | boolean | DEFAULT true |
| created_at | timestamptz | |

### `calendar_events` (024_phase4_calendar.sql)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants |
| title | text | NOT NULL |
| description | text | |
| starts_at | timestamptz | NOT NULL |
| ends_at | timestamptz | |
| visibility | text | CHECK: private_owner / project / assigned_user / tenant |
| source_type | text | manual / reminder / checkpoint / payment |
| project_id | uuid | → projects |
| enquiry_id | uuid | → enquiries |
| customer_id | uuid | → customers |
| assigned_user_id | uuid | → users |
| created_at | timestamptz | |

**Visibility CHECK:** private_owner requires assigned_user_id IS NOT NULL; project requires project_id IS NOT NULL; assigned_user requires assigned_user_id IS NOT NULL.

### `public_abuse_log` (025_phase4_public.sql)
Tracks spam/bot submissions from public form.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | |
| ip_address | inet | |
| reason | text | honeypot / too_fast / rate_limit |
| created_at | timestamptz | |

### `public_rate_limit_buckets` (025_phase4_public.sql)
Rolling-window rate limit state per IP per tenant.
| Column | Type | Notes |
|--------|------|-------|
| tenant_id | uuid | NOT NULL |
| ip_address | inet | NOT NULL |
| window_start | timestamptz | NOT NULL |
| request_count | int | DEFAULT 1 |
| UNIQUE | — | (tenant_id, ip_address, window_start) |

### Public RPC Functions (025_phase4_public.sql)
| Function | Notes |
|----------|-------|
| `public_rate_limit_hit(tenant_id, ip, window_mins, max_requests)` | SECURITY DEFINER; uses `pg_advisory_xact_lock(hashtextextended(...))` for atomicity; returns boolean |
| `submit_public_enquiry(intake_slug, name, phone_display, email, message, referrer_url, ip, [phone_normalized], [source], [user_agent], [request_id])` | SECURITY DEFINER GRANT to anon; validates bounds, resolves slug, IP rate limit, phone soft-dedupe, inserts enquiry, calls emit_notification. `phone_normalized`/`source` are optional (DEFAULT NULL); empty-string phone treated as absent. (066, Updated: 2026-05-18) |

---

## Phase 5 Tables (027–028)

### New Enums
None. Uses numeric columns only.

### `payment_schedule` (027_phase5_payments.sql)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants; set by set_tenant_from_project() |
| project_id | uuid | NOT NULL → projects ON DELETE CASCADE |
| milestone_name | text | NOT NULL |
| amount_due | numeric(14,2) | NOT NULL CHECK > 0 |
| due_date | date | NOT NULL |
| sequence_order | int | NOT NULL; UNIQUE (project_id, sequence_order) DEFERRABLE |
| notes | text | NULL |
| is_paid | boolean | DEFAULT false; auto-set by recompute_payment_is_paid() trigger |
| triggered_at | timestamptz | NULL; set when linked project_checkpoint is approved |
| deleted_at | timestamptz | NULL; soft delete — only unpaid rows may be deleted |
| created_at / updated_at | timestamptz | auto-touched |

**Triggers:** `set_tenant_from_project()`, `touch_updated_at()`, FK on project_checkpoints.triggers_payment_id → payment_schedule(id) ON DELETE SET NULL.

### `payment_records` (027_phase5_payments.sql)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants; set by trigger |
| payment_schedule_id | uuid | → payment_schedule(id) |
| project_id | uuid | NOT NULL → projects |
| amount_paid | numeric(14,2) | NOT NULL CHECK > 0 |
| paid_on | date | NOT NULL |
| method | text | CHECK IN ('bank','upi','cheque','cash') |
| reference | text | NULL |
| notes | text | NULL |
| recorded_by | uuid | → users; auto-set from auth.uid() by trigger |
| created_at | timestamptz | |

**Immutable** — no UPDATE/DELETE RLS policies. Append-only.

### `v_payment_status` (028_phase5_views_rls.sql)
Aggregates payment_records per payment_schedule row. Columns: all of payment_schedule + `amount_received` (sum of records), `variance` (received − due).

### project_checkpoints FK (027)
`project_checkpoints.triggers_payment_id uuid REFERENCES payment_schedule(id) ON DELETE SET NULL` — links milestone approval to payment trigger.

---

## Phase 1+ Schema (to be added per phase)
| Phase | Tables |
|-------|--------|
| 1 | projects, project_assignments, project_checkpoints, checkpoint_items, checkpoint_templates, checkpoint_template_items, work_log, table_presets + children |
| 2 | material_plan, material_consumption, expenses, site_check_ins |
| 3 | ✅ bridge_messages, updates, media_assets, team_daily_tasks, owner_broadcasts, owner_broadcast_recipients |
| 4 | ✅ calendar_events, enquiries, enquiry_remarks, enquiry_reminders, enquiry_intake, customers, public_abuse_log, public_rate_limit_buckets |
| 5 | payment_schedule, payment_records |
| 6 | project_tables, project_table_columns, project_table_sections, project_table_rows, project_table_row_revisions |
| 8 | team_performance_monthly, feature_flags |
| 9 | ✅ team_member_tags, member_tasks, personal_reminders, attendance_logs |
| 10 | ✅ payment_milestone_presets (+items), material_plan_presets (+items) |

---

## Phase 9 Tables (037–041)

### `team_member_tags` (037_team_member_tags.sql)
Sub-role tags for team members granting additional capabilities.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants |
| user_id | uuid | NOT NULL → users ON DELETE CASCADE |
| tag | text | CHECK IN ('accountant','admin','project_manager') |
| granted_by | uuid | → users |
| granted_at | timestamptz | NOT NULL DEFAULT now() |
| UNIQUE | — | (user_id, tag) |

**Helper:** `has_member_tag(p_tag text)` — STABLE SECURITY DEFINER, checks current user's tags.
**Note:** assigning a tag writes its capability set into `user_capabilities` (`source='tag'`) via migration 065 triggers — tags now drive `has_capability()` / RLS, not just navbar visibility. (Updated: 2026-05-18)
**Trigger:** `trg_set_tenant_from_tag_user` (076) — BEFORE INSERT, populates `tenant_id` from the target `user_id` (the table had NO tenant trigger, so UI tag grants failed with a NOT NULL violation; the tag API only sends `{user_id, tag, granted_by}`). Runs before the 065 capability-sync triggers. (Updated: 2026-06-08)

### `member_tasks` (038_member_tasks.sql)
Persistent personal tasks for team members (not date-scoped; carry over until done).
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants |
| user_id | uuid | NOT NULL → users ON DELETE CASCADE |
| title | text | NOT NULL, 1–500 chars |
| completed | boolean | DEFAULT false |
| completed_at | timestamptz | auto-set by trigger |
| created_at / updated_at | timestamptz | auto-touched |

**Trigger:** `handle_member_task_update` — sets completed_at on flip, nulls on uncheck.
**RLS:** member reads/writes own; owner reads all via `daily_tasks:view_all`.

### `personal_reminders` (039_personal_reminders.sql)
Private calendar reminders visible only to the creating user. In-app notification only.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants |
| user_id | uuid | NOT NULL → users ON DELETE CASCADE |
| title | text | NOT NULL, 1–300 chars |
| reminder_at | timestamptz | NOT NULL |
| type | text | meeting / deadline / other |
| is_done | boolean | DEFAULT false |
| done_at | timestamptz | auto-set by trigger |

**RLS:** strictly private — only `user_id = auth.uid()`.

### `attendance_logs` (040_attendance_logs.sql)
Office check-in/out per team member per day with GPS validation.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | NOT NULL → tenants |
| user_id | uuid | NOT NULL → users ON DELETE CASCADE |
| work_date | date | DEFAULT current_date |
| check_in_at | timestamptz | |
| check_in_lat / check_in_lng | double precision | GPS coords |
| check_in_within_geofence | boolean | server-validated (Haversine, 200m) |
| check_out_at | timestamptz | |
| check_out_lat / check_out_lng | double precision | |
| check_out_within_geofence | boolean | |
| total_minutes | int | GENERATED ALWAYS AS STORED (check_out − check_in) |
| check_in_count | int | NOT NULL DEFAULT 1 — times the member checked in this day (migration 060) |
| UNIQUE | — | (user_id, work_date) |

**View:** `v_attendance_monthly` — days_present, total_minutes, avg_minutes_per_day per user per month.
**RLS:** member write/read own; owner reads all via `office_attendance:view_all`.

**Note:** Office GPS coords stored on `tenants.office_lat / office_lng / office_geofence_radius_m` (default 200m). Coords to be set when available.

### In-app notification (041_in_app_notifications.sql)
`generate_personal_reminder_notifications()` — pg_cron every 5 min, emits `personal_reminder_due` notification to the reminder owner within 5-minute window. No web push for team members.

### Realtime publication (071_realtime_publication.sql)
Content tables added to the `supabase_realtime` publication so the global client subscriber (`components/realtime/RealtimeRefresher.tsx`) can re-fetch the current page on change via `router.refresh()` (debounced 800ms, paused while tab hidden):
`updates`, `notification_recipients`, `owner_broadcasts`, `owner_broadcast_recipients`, `member_tasks`, `team_daily_tasks`, `expenses`, `material_plan`, `material_consumption`, `site_check_ins`, `enquiries`, `enquiry_reminders`, `payment_records`, `payment_schedule`, `projects`, `project_assignments`, `calendar_events`, `personal_reminders`, `media_assets`.
RLS applies to realtime — clients only receive events for rows they can read. Non-content/high-churn tables (audit_log, attendance_logs, user_capabilities, presets, users, tenants) intentionally excluded. (Updated: 2026-06-01)
