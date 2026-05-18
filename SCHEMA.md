# SCHEMA.md
(Updated: 2026-05-18 — migrations 062–064 applied)

## Status: Phase 10 migrations (043–050) + 051–064 + 999_add + 999_zz applied to cloud Supabase.

### Migration 064 — fix project_tables soft-delete (applied 2026-05-18)
- Root cause: a direct `UPDATE ... SET deleted_at` fails RLS — Postgres also enforces the SELECT policy's `USING (deleted_at IS NULL)` against the post-update row, so the new row violates the SELECT policy ("new row violates row-level security policy"). Migration 058 fixed the UPDATE policy's WITH CHECK but not this.
- Fix: `soft_delete_project_table(p_project_id, p_table_id)` — SECURITY DEFINER, checks `project_table:edit`, sets `deleted_at`, returns the id (NULL when nothing matched). DELETE table route calls it via RPC.

### Migration 063 — project table column insert/delete (applied 2026-05-18)
- `project_table_columns` UNIQUE (project_table_id, display_order) now `DEFERRABLE INITIALLY IMMEDIATE` so bulk renumbering does not transiently collide. (Applied 2026-05-18)
- `shift_table_columns_after(p_table_id, p_after_order)` — opens a slot by `display_order + 1` for columns after the given order (used when inserting a column between two columns).
- `delete_table_column(p_table_id, p_column_id)` — hard-deletes a column and shifts later columns `display_order - 1`. Orphaned cell values keyed by the column id remain in row JSONB, never rendered.

### Migration 062 — audit log retention (applied 2026-05-18)
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

**Retention:** pg_cron job `audit-log-retention` hard-deletes rows older than 30 days daily at 03:30 UTC (migration 062). No archive.

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
| `submit_public_enquiry(intake_slug, name, phone, email, source, message, ip, website_hp, rendered_ms)` | SECURITY DEFINER GRANT to anon; validates bounds, resolves slug, IP rate limit, phone soft-dedupe, inserts enquiry, calls emit_notification |

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
