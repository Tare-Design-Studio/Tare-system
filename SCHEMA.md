# SCHEMA.md
(Updated: 2026-08-07 — migration 101 APPLIED: attendance IST day boundaries, auto check-out, geofence backfill)

### Migration 101 — attendance IST correctness + auto check-out (applied 2026-08-07)

**Applied with** `npx tsx scripts/migrate.ts`. Verified live afterwards (counts below).

**Why.** Three client-reported attendance defects. Two shared one root cause: **the DB session
TimeZone is UTC and the tenant works in IST (UTC+5:30)**, and nothing reconciled the two.

1. **"People aren't being logged out — still says clocked in."** The API derived `work_date` with
   `new Date().toISOString().slice(0,10)`, which is the **UTC** date and therefore still *yesterday*
   until 05:30 IST. A check-out in that window looked up a `work_date` row that did not exist, got
   `"No check-in found for today"` (400), and **never cleared `last_check_in_at`** — so the presence
   board read the row as `status = "present"` indefinitely. **13 rows were stuck open in production.**

2. **No auto check-out, and forgotten check-outs earned no OT.** `stamp_attendance_workday()` (088)
   sets `overtime_minutes := NULL` whenever `check_out_at IS NULL`, so an open row accrued nothing.
   Compounding it, that trigger compared against `work_date + workday_end_snapshot` evaluated in the
   **UTC** session zone: 18:00 UTC = **23:30 IST**. Overtime only began accruing at half past eleven
   at night. **1 row of 72 had any OT**; a real 18:16 IST check-out recorded 0 minutes instead of 16.

3. **"Flagged / out of geofence" for people sitting in the office.** *No code defect* — already
   fixed by 093. Every flagged row predates its office's row in `offices` (Mysore created
   2026-08-04 09:55Z); every check-in after that is correctly inside the fence. Measured distances
   on the 12 flagged rows were **5–55m** from the office, well inside the 200m radius. Stale data,
   not stale logic — so this migration backfills rather than changing the matching rule.

**Changes.**
- `tenants.timezone text NOT NULL DEFAULT 'Asia/Kolkata'` — the workday window is a wall-clock
  concept and can only be resolved against a zone. Per-tenant so a second city stays correct
  instead of hardcoding IST in a function body. `CHECK (now() AT TIME ZONE timezone IS NOT NULL)`
  (`NOT VALID`) rejects a typo'd zone at write time rather than silently falling back to UTC.
- `stamp_attendance_workday()` **rewritten** — same contract as 088 (BEFORE INSERT OR UPDATE,
  unconditionally overwrites client input, columns still REVOKEd from `authenticated`); the only
  change is that the window is converted via `(work_date + t)::timestamp AT TIME ZONE tz` before
  being compared to a `timestamptz`. Both `is_late` and `overtime_minutes` were affected.
- `attendance_logs.auto_checked_out boolean NOT NULL DEFAULT false` — distinguishes a system-closed
  row from a real one so payroll can question it. Derived: `REVOKE UPDATE` from `authenticated`,
  matching `overtime_minutes` / `is_late`.
- `close_stale_attendance()` + pg_cron job `close-stale-attendance` at `*/15 * * * *`. Closes cycles
  open past the tenant cutoff (`workday_end + late_grace_minutes` = **18:15 IST** on defaults) and
  folds the open cycle into `accumulated_minutes` exactly as the check-out API path does.
  `SECURITY DEFINER`, `REVOKE ALL` from `public/anon/authenticated`. Idempotent — verified three
  consecutive runs close 0 rows and leave `accumulated_minutes` byte-identical.

**⚠️ ASSUMPTION AWAITING CLIENT CONFIRMATION.** The client asked to "log out everyone at 6.15 pm and
then it comes out as ot". `check_out_at` is stamped with the **actual time the job runs**, not a flat
18:15. A literal 18:15 stamp would erase real overtime for anyone genuinely still working at 9pm and —
since OT accrues against `workday_end` (18:00) — would hand *everyone* exactly 15 minutes and nobody
any more, which cannot be the intent. The 15-minute cadence bounds how long a forgotten check-out can
inflate a day. **If the client does want a flat 18:15 cap, this is the line to change.**

**Backfills (all verified).**
- `close_stale_attendance()` run once inline: **stuck-open rows 13 → 0**, 14 rows now `auto_checked_out`.
- `workday_end_snapshot` re-stamped on every row to re-fire the corrected trigger (the technique 088
  used for its own backfill): **rows with OT 1 → 58**, and **0 rows** where stored OT differs from a
  fresh IST recomputation. Spot-checked: the 18:16 IST check-out now reads 16 min. The six rows above
  2h OT are all `auto_checked_out = false` — genuine late nights (one 09:46→02:44), not artifacts.
- Geofence re-evaluated for rows with coordinates that were flagged `false` with a NULL office,
  using the API's exact rule (nearest active office whose own radius contains the point):
  **`check_in_within_geofence = false` 12 → 0**. Deliberately narrow — a genuinely remote check-in
  finds no match and **keeps** its false flag; nothing correctly recorded is rewritten.

**Application code** (`work_date` must be the IST calendar day everywhere): new `lib/attendance/day.ts`
exports `localDate()`; called from `app/api/attendance/route.ts`, `app/api/attendance/board/route.ts`
and the two attendance queries in `app/(app)/page.tsx`. `page.tsx:565`'s `todayStr` is left on UTC on
purpose — it builds instant boundaries for unrelated owner-dashboard queries.

### Migration 100 — assigner edit, delete and reassign (applied 2026-08-07)

**Applied with** `npx tsx scripts/migrate.ts`; rehearsed first inside a rolled-back transaction.
Verified live afterwards: `assigner_delete_tasks` present on `member_tasks` (the table's **first**
DELETE-specific policy), `guard_member_task_review()` carries the new assigner branch, and
`_migrations` holds `100_assigner_edit_delete_tasks.sql` — no ledger drift.

**Why.** The assign surface was write-once. An assigner could hand out a task and re-point its
project, but could not fix a typo in the title, correct a due date, or move the work to a different
person. Two things blocked it, both deliberate, so both were narrowed rather than removed:

1. **There was no DELETE policy at all.** `member_own_tasks` is `FOR ALL`, so a member could delete
   their own row and nobody could delete anything else. `assigner_delete_tasks` is the first
   DELETE-specific policy on the table. It is scoped to `assigned_by = auth.uid()` **and**
   `user_id <> auth.uid()`: a `tasks:assign` holder may REVIEW anyone's work (`owner_review_tasks`,
   095) but may only DELETE what they personally handed out, because deletion is destructive and
   unreviewable.

2. **`guard_member_task_review()` raised on any `user_id` change** made by someone other than the
   row's own member — *"a reviewer cannot reassign a task"*. That rule stops a REVIEWER laundering a
   task onto someone else to dodge the self-review block. An assigner correcting their own
   assignment is a different act. The guard now branches on `OLD.assigned_by = auth.uid()` **before**
   the reviewer rules (an assigner is normally also a `tasks:assign` holder, so it would otherwise be
   caught by them).

**What the assigner branch still forbids:** cross-tenant moves; handing a task to an inactive or
foreign-tenant user (mirrors the `EXISTS` check in `owner_assign_tasks`, 083); moving a task to
*themselves* (that would make them both owner and assigner of the row, i.e. self-review by the back
door, since the self-review check keys on `OLD.user_id`); and writing the clock by hand.

**Reassignment resets the lifecycle** — `status → open`, and `accepted_at / started_at /
submitted_at / completed / completed_at / review_status / reviewed_by / reviewed_at /
review_requested_to` all cleared. The new assignee has not accepted, started or submitted anything,
so inheriting the previous member's timestamps would credit them with hours they did not work and
feed a false number into the performance algorithm. Enforced **in the trigger, not the API**, so it
holds however the row is written.

**Every 096 rule survives on the non-assigner path**: a reviewer still cannot reassign, cannot touch
the time log, and cannot change who reviews a task. `tenant_id` is immutable on every path, and the
086/096 self-review check runs ahead of all of this and is untouched.

**Rollback:** `DROP POLICY assigner_delete_tasks ON member_tasks;` and restore the 096 body of
`guard_member_task_review()`. No column or pre-existing policy is dropped.

**Note on `calendar_events`:** the edit/delete calendar work shipped alongside this needed **no
migration**. `calendar_events_update` and `calendar_events_delete` (026) already admit the row's
`created_by` or a holder of `calendar:create_for_others`. The new
`PATCH/DELETE /api/calendar/[id]` route adds one rule on top, in the API rather than the database:
rows with a non-null `source_type` are refused (409). Those are projections —
`sync_reminder_to_calendar()` rewrites a `reminder` event whenever `enquiry_reminders` moves, so an
edit would silently revert, and a delete would orphan the reminder.

(Previous: 2026-08-06 — migration 096 APPLIED: team coordination + named review)

### Migration 096 — team coordination + named reviewer (applied 2026-08-06)

**Applied with** `npx tsx scripts/migrate.ts`. Verification queries are at the foot of the
migration file; all were run after apply (column nullable, FK `ON DELETE SET NULL`, partial index
present, **both** arities of `emit_task_review_notification` present, guard clause in place).

**First attempt failed and rolled back** — `syntax error at or near "SELECT"`. The 2-arg delegating
form was declared `LANGUAGE plpgsql` with a bare `SELECT` body, which is `LANGUAGE sql`. Fixed in
the file (it now reads `LANGUAGE sql`) and re-applied clean. `CREATE OR REPLACE` does change a
function's language, so replacing 083's plpgsql 2-arg form was not itself a problem.

**Applying it also recorded 095**, which was applied by hand on 2026-08-05 over `DATABASE_URL` and
so was never written to `_migrations`. The runner replayed it; 095 is idempotent
(`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`) and its column, policies
and index were verified unchanged afterwards. The ledger now matches the database — apply future
migrations through the runner so this does not recur.

**`member_tasks.review_requested_to uuid REFERENCES users(id) ON DELETE SET NULL`** (nullable) +
partial index `idx_member_tasks_named_reviewer (review_requested_to, submitted_at DESC)
WHERE review_requested_to IS NOT NULL AND status = 'pending_review'`.
- `SET NULL`, never `CASCADE` — deleting a reviewer's account must not delete the task history
  084's KPI reads. A task whose named reviewer is gone falls back to the assigner/owner path.

**Named review routing.** `emit_task_review_notification` gains a **3-argument overload**
`(p_task_id, p_title, p_reviewer)`; the 083 2-arg form is **kept and delegates to it**. Changing a
function's arity creates a second function rather than replacing the first, so dropping the old one
would break any caller still passing two arguments.
- Recipient = `COALESCE(p_reviewer, row.review_requested_to, row.assigned_by)`, then NULL (which
  `emit_notification` broadcasts to owners). A recipient who does not hold `tasks:assign`, or who is
  the submitter, is discarded back to NULL — a notification whose only action would 403 is worse
  than the owner fallback.

**`guard_member_task_review()` body replaced again** (083 → 086 → 096). New clause: a **reviewer**
may not change `review_requested_to`, alongside the existing user_id / tenant_id / time-log
protections. The task's own member keeps full control of their row (the early return is unchanged),
so picking a reviewer stays theirs. Trigger name and its position after `member_task_before_update`
(038) are untouched.

**Deliberate RLS/API split — read before narrowing anything here.** `owner_review_tasks` (095)
authorises **every** `tasks:assign` holder tenant-wide, so naming a reviewer does not stop a
different holder from returning the verdict. Narrowing that policy to the named reviewer would break
the unnamed fallback (assigner / owner review), which is still the common path. The restriction is
therefore enforced in `PATCH /api/member-tasks/[id]`'s `review` branch and the queue is filtered by
addressee. The DB half stays "a reviewer may review anything except their own work", which is what
086 and 095 already guarantee.

**New capability `team:coordinate`** — declared in `lib/auth/capabilities.ts` only; **no rows are
granted by this migration**. Opens a redacted `/team` (members, who-is-on-what, project assignment)
without `team:create_user`. It confers no data access of its own: the salary / attendance / KPI
queries on that page stay gated on `team:create_user`, so it widens the page, never the payload.
Added to `TAG_EXCLUDED_CAPABILITIES` and deliberately absent from `tag_capability_set()` — like
`tasks:assign` (087), `leave:approve` (088) and `performance:configure` (090), it is granted per
user through the Access Matrix. Grant it there to whoever needs it after applying.

**No pgtap test** for the new guard clause or the routing function — same gap 095 has (no Docker,
locked decision). The guard clause **was** verified behaviourally after apply, inside a rolled-back
transaction: acting as an owner who holds `tasks:assign`, a control write to `review_status`
succeeded (proving `owner_review_tasks` authorised the row) while the same session's attempt to
change `review_requested_to` raised `a reviewer cannot change who reviews a task`. The routing
overload was smoke-tested only (2-arg form delegates and returns NULL for an unknown task).

(Previous: 2026-08-05 — migration 095 APPLIED: task project links + self-task review)

### Migration 095 — task project links + reviewable self-set tasks (applied 2026-08-05)

**Status: applied 2026-08-05.** Run against production via `DATABASE_URL`. Verified after apply:
`member_tasks.project_id` present in `information_schema.columns`,
`idx_member_tasks_project_completed` in `pg_indexes`, `owner_review_tasks` in `pg_policy`, and the
`/tasks` page's full column select confirmed served by PostgREST (schema cache picked up the DDL).

**Structural change.** `member_tasks.project_id uuid REFERENCES projects(id) ON DELETE SET NULL`
(nullable) + partial index `idx_member_tasks_project_completed (project_id, completed_at DESC)
WHERE project_id IS NOT NULL AND status = 'completed'`. `SET NULL`, never `CASCADE`: deleting a
project must not delete the completed-task history that 084's KPI is derived from.

- **Self-set tasks become reviewable.** 083's `owner_review_tasks` carried
  `assigned_by IS NOT NULL`, which put self-set tasks permanently out of review's reach. 095
  replaces that predicate with `user_id <> auth.uid()`. This is strictly narrower than dropping
  it: the anti-self-review property 083 was protecting is now stated directly, so the owner can
  review self-set work while nobody — owner included — can review their own.
  `guard_member_task_review()` (083) is untouched and still guards user_id / tenant_id / clock.
- **KPI impact: none.** `v_task_performance_monthly` (084) filters on `status='completed'` alone
  and never had an `assigned_by` predicate, so self-set tasks have always counted toward
  `weighted_volume`. 095 does not widen the KPI's input set; it only lets a verdict land on tasks
  that previously could not carry one.
- **Which self-tasks get reviewed: project-linked ones.** `handle_member_task_update()` is
  redefined (body only — 038's `member_task_before_update` trigger keeps its name and its
  load-bearing first position ahead of `trg_guard_member_task_review`) so that ticking `completed`
  on a task with a `project_id` sets `status='pending_review'` instead of closing it. An unlinked
  personal todo keeps 038's one-tap behaviour. Enforced in the trigger, not the API, so a direct
  PATCH cannot route around it.
- **Revision loop.** The re-route condition is `review_status IS DISTINCT FROM 'clean'`, so a task
  sent back as `revision` / `error` can go round again; only a `clean` verdict closes it.
  Re-submission stamps a fresh `submitted_at` and clears the stale `review_status`. Safe against
  the 083 guard, which returns early when `auth.uid() = OLD.user_id` (the re-submit path is always
  the member acting on their own row) and never inspects `review_status`.


### Migration 094 — site engineers get tenant-wide bridge access (applied 2026-08-04)

Data only — **no structural change**. Grants `bridge:read` + `bridge:write` at
`scope_project_id = NULL` to every `role='site_engineer'` user (4 as of 2026-08-04).

- **Why.** 089 granted `project:view_all` to all non-owner members, but `bridge_select` /
  `bridge_insert` (021) gate on `has_capability('bridge:*', project_id) OR
  is_assigned_to_project()`. Team members already held these tenant-wide via
  `TEAM_MEMBER_CAPABILITIES`; site engineers held **neither**. Once the Bridge page stopped
  scoping its dropdown to assignments, an SE could select a project and get an empty thread with
  no error — a silent read failure. The grant closes that gap.
- `source='manual'`, so the rows show up in the Access Matrix and the owner can revoke them per
  user. The 065 tag-sync triggers only touch `source='tag'` rows and will never clear these.
- Idempotent via `NOT EXISTS` on `(user_id, capability)` where `scope_project_id IS NULL`.
- **`user_capabilities` has NO `set_tenant_from_*` trigger.** `tenant_id` is NOT NULL and must be
  supplied explicitly — the first draft of this migration failed with
  `null value in column "tenant_id" ... violates not-null constraint`. It is selected from the
  target user's own row. Apply the same pattern to any future capability-granting migration.
- `SITE_ENGINEER_CAPABILITIES` in `lib/auth/capabilities.ts` gains both strings so newly invited
  site engineers receive them at creation time.

**Note on the audit log (2026-08-04):** the audit *page* and its API routes were deleted from the
app, but `audit_log`, `audit_trigger()`, the hash chain and the 075 insert-time cap are **all
unchanged** and still recording. Invariant #3 (append-only, no UPDATE/DELETE policies) still holds.
The `audit_log:view` / `audit_log:export` capabilities remain declared in
`lib/auth/capabilities.ts` — currently unreferenced, kept so the page can return without a
migration. This does not violate the 056 invariant, which requires every `has_capability()` string
in an RLS policy to exist in `CAPABILITIES` — the reverse direction (a declared capability nothing
checks) is safe.

(Previous: 2026-08-02 — migrations 088–093 APPLIED: leave + overtime + workday window, project
category access, editable KPI weights, client feedback / voice broadcasts / drawing roles,
attendance column-grant fix, multi-office attendance)

### Migration 093 — multiple office locations (applied 2026-08-02)

**`offices`** — one row per physical office (Mysore, Bangalore, …). Columns:
`tenant_id, name, address, lat, lng, geofence_radius_m, is_active, created_at, updated_at`,
`UNIQUE (tenant_id, name)`, `CHECK (geofence_radius_m BETWEEN 50 AND 5000)`, lat/lng range checks.
- **RLS:** SELECT open to the whole tenant (the check-in card names the matched office and the
  presence board labels people by office). INSERT/UPDATE/DELETE require
  `office_attendance:configure` — moving an office moves the geofence, which decides who counts
  as present. Held by 4 users as of 2026-08-02.
  093 enabled RLS but omitted `FORCE`, so owner-role queries bypassed both policies until
  **097** forced it. (Updated: 2026-08-06)
- `attendance_logs.check_in_office_id` / `check_out_office_id` → `offices(id) ON DELETE SET NULL`.
  Nullable on purpose: **no match is not an error**, it means remote or on site, and the check-in
  is still recorded.
- Both new columns are added to the 092 column-level UPDATE grant, or every check-in would fail
  with a permission error.
- `resolve_office_at(tenant, lat, lng)` — nearest active office **whose own radius contains the
  point**. Nearest alone is wrong: a point can be nearest to office A while only actually inside
  office B's larger geofence. Verified with two offices ~140km apart plus an out-of-range point.
- **Retire, don't delete.** `DELETE /api/offices/[id]` sets `is_active=false`; attendance rows
  reference the office and the history of who was where must survive an office closing.
- `tenants.office_lat / office_lng / office_geofence_radius_m` are **DEPRECATED** — left in place
  (migration 069 still writes them, and the stored value is real data) but **no longer read by
  the attendance path**. The existing value was carried into `offices` as
  "Main office (confirm location)"; its city is unconfirmed — it sits ~70km south of Bangalore.

### Migration 091 — client feedback, voice broadcasts, drawing roles (applied 2026-08-02)

**`client_feedback`** — customer rating (1–5) + optional comment per project stage. Columns:
`tenant_id, project_id, checkpoint_id, customer_id, rating, comment, submitted_at`,
`UNIQUE (customer_id, checkpoint_id)` so re-submitting updates in place.
- **No INSERT/UPDATE policy at all.** The customer portal is unauthenticated (hash URL, 048), so
  writes go exclusively through `submit_client_feedback(p_portal_hash, p_checkpoint_id, p_rating,
  p_comment)` — SECURITY DEFINER, granted to `anon`. It re-derives the customer from the hash and
  verifies the checkpoint belongs to a project of that customer. **Never** accept a `customer_id`
  from the request body here.
- Staff SELECT gated on `project:view_all` OR assigned + `project:view_assigned`.

**`owner_broadcasts.voice_path` / `.voice_duration_s`** — voice notes in `media-private`.
`voice_duration_s` CHECK `> 0 AND <= 60`; the browser cutoff is a convenience, this is the
enforcement. New constraint `owner_broadcasts_has_content` allows an empty `body` when
`voice_path` is set (voice-only broadcast).

**`member_tasks.drawing_role`** — enum `drawing_role` (`design | detailing | technical | checked`),
NULL for non-drawing work. View `v_drawing_role_monthly` gives the per-user monthly split.

### Migration 090 — owner-editable KPI (applied 2026-08-02)

**`kpi_settings`** (PK `tenant_id`) — the scoring policy `v_kpi_scores` reads: pillar weights
(`weight_efficiency/quality/delivery/client_rating`), `efficiency_multiplier`, `error_penalty`,
`revision_penalty`, `delay_penalty`, `include_client_rating`. Seeded with 034's constants for every
tenant, and auto-seeded for new tenants by `seed_kpi_settings()`.
- Trigger `validate_kpi_weights()` rejects any save whose weights do not total exactly 1.000.
- Write gated on **`performance:configure`**, which is in `TAG_EXCLUDED_CAPABILITIES` — like
  `tasks:assign` (087) it must be granted per user, never conferred by a tag. Read is open to the
  whole tenant: people are entitled to know the formula they are scored by.
- **`v_kpi_scores` was DROPped and recreated** (score columns changed integer → numeric, which
  `CREATE OR REPLACE VIEW` cannot do). Verified no other view depended on it. New column
  `client_rating_score`. When the client pillar is on but a month has no rating, its weight is
  redistributed across the other three rather than scoring zero.
- **The inputs stay derived.** `team_performance_monthly` is still filled by `recompute_task_kpi()`
  (084) from reviewed tasks, and 086/087 still block self-review. Editable *weights* are policy;
  editable *inputs* would be self-scoring.

### Migration 089 — universal project access + category narrowing (applied 2026-08-02)

**`user_project_categories`** (`user_id, project_type`, UNIQUE) — optional narrowing of
`project:view_all`. **No rows for a user = they see every project** (the default). Rows = they see
only those `project_type` values. Write gated on `access_control:manage`.
- Enforced by `project_type_visible(project_type)` inside a **RESTRICTIVE** policy
  `projects_category_restriction`. Restrictive policies are ANDed, so this can only ever subtract
  visibility — the base policy from 013 is untouched. Assigned members keep their own projects
  regardless of category.
- Backfill granted `project:view_all` (`source='manual'`) to all 19 non-owner members, so
  "everyone sees all projects" is true immediately and is revocable in the Access Matrix.

### Migration 088 — leave, overtime, workday window (applied 2026-08-02)

**`tenants.workday_start` (09:30) / `workday_end` (18:00) / `late_grace_minutes` (15) /
`annual_leave_days` (12)** — the office hours are data, not constants in code.

**`attendance_logs.overtime_minutes` / `.is_late` / `.workday_end_snapshot`** — maintained by
`stamp_attendance_workday()` (BEFORE INSERT OR UPDATE), which **unconditionally overwrites** any
client-supplied value. 088 also tried `REVOKE UPDATE (cols) FROM authenticated`, which **silently
did nothing** — a table-level UPDATE grant already existed and column-level REVOKE does not carve
into it. **Migration 092 fixes this**: table-wide UPDATE is revoked and re-granted column by
column, excluding the three derived ones. The trigger was (and remains) the control that actually
prevents forgery; 092 restores the second layer.
- **Not a generated column.** `work_date + workday_end` is date+time arithmetic, which Postgres
  treats as non-immutable, so a generation expression is rejected outright. The trigger preserves
  the property that mattered (derived, never accepted from a client).
- `workday_end_snapshot` is stamped per row, so changing tenant hours never silently rewrites
  historical overtime.

**`leave_requests`** — `kind` (`leave_kind`), `status` (`leave_status`), dates, `days` (0.5 for a
half day), `reason`, decision fields. CHECKs: `end_date >= start_date`; a non-pending,
non-cancelled row must carry `decided_by` + `decided_at`.
- `guard_leave_decision()` blocks deciding **your own** request, writing decision fields on it, and
  reassigning `user_id`/`tenant_id` — the permissive own-row policy would otherwise authorise
  self-approval, exactly the hole 086 closed for task self-review.
- Capabilities: `leave:request` (all members), `leave:view_all` (tag-delegable, PM tag gets it),
  `leave:approve` (**excluded from tags**, owner-granted per user).
- Views: `v_leave_balance` (entitlement minus approved days, pending count — consumption is
  **summed, never stored**, so edits and cancellations self-correct; unpaid leave does not consume
  entitlement) and `v_overtime_monthly`.

### Migration 077 — removed-employee 30-day purge (applied 2026-06-19)
- `purge_removed_employees()` SECURITY DEFINER function + pg_cron job `removed-employee-purge` (`0 4 * * *`, daily 04:00 UTC).
- For each `public.users` row with `deleted_at < now() - interval '30 days'` and `role <> 'owner'`: de-identifies the row (`full_name='Deleted Employee'`, NULLs `role_label/phone/experience_years/skill_score/salary_inr`, `is_active=false`), then attempts `DELETE FROM auth.users` (cascades to `public.users` + capabilities/sessions/tags/push when unreferenced). Per-row `EXCEPTION WHEN foreign_key_violation` keeps the anonymized row for members still referenced by authored history (`updates.author_id`, `owner_broadcasts.author_id`, `payment_records.recorded_by`, … — all NOT NULL NO ACTION FKs). The job therefore always succeeds.
- Pairs with the team DELETE API (`DELETE /api/team/[memberId]`), which soft-deletes + revokes capabilities + bans the auth login immediately; 077 finalises cleanup 30 days later.

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
| assigned_by | uuid | → users. **NULL = self-set todo** (legacy behaviour, no lifecycle) (083) |
| project_id | uuid | → projects ON DELETE SET NULL. NULL = personal chore. Non-NULL routes the tick through owner review (095) |
| review_requested_to | uuid | → users ON DELETE SET NULL. NULL = no reviewer named, routing falls back to assigner then owners (096) |
| tag | text | NOT NULL DEFAULT 'other', CHECK drawing/review/site/admin/other (083) |
| due_date | date | (083) |
| status | text | NOT NULL DEFAULT 'open', CHECK open/accepted/in_progress/pending_review/completed (083) |
| accepted_at / started_at / submitted_at | timestamptz | lifecycle clock; logged = submitted_at − accepted_at (083) |
| review_status | text | CHECK NULL or clean/revision/error (083) |
| reviewed_by | uuid | → users (083) |
| reviewed_at | timestamptz | (083) |

**Trigger:** `handle_member_task_update` — sets completed_at on flip, nulls on uncheck; since 083 also stamps the lifecycle timestamps and keeps `completed` ↔ `status` in lockstep.
**RLS:** member reads/writes own; owner reads all via `daily_tasks:view_all`. Since 083: `owner_assign_tasks` (INSERT for others, needs `tasks:assign`) and `owner_review_tasks` (UPDATE, needs `tasks:assign` **and `assigned_by IS NOT NULL`**). 095 swaps that last predicate for **`user_id <> auth.uid()`**, so review reaches self-set tasks while nobody reviews their own. 096 adds `review_requested_to`; when it is set, only that person may return the verdict — enforced in the API, not RLS (see 096 above).

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

**Note:** Office GPS coords moved to the **`offices`** table in migration 093 (one row per office, many offices per tenant). `tenants.office_lat / office_lng / office_geofence_radius_m` are deprecated and no longer read by the attendance path. (Updated: 2026-08-02)

### In-app notification (041_in_app_notifications.sql)
`generate_personal_reminder_notifications()` — pg_cron every 5 min, emits `personal_reminder_due` notification to the reminder owner within 5-minute window. No web push for team members.

### Realtime publication (071_realtime_publication.sql)
Content tables added to the `supabase_realtime` publication so the global client subscriber (`components/realtime/RealtimeRefresher.tsx`) can re-fetch the current page on change via `router.refresh()` (debounced 800ms, paused while tab hidden):
`updates`, `notification_recipients`, `owner_broadcasts`, `owner_broadcast_recipients`, `member_tasks`, `team_daily_tasks`, `expenses`, `material_plan`, `material_consumption`, `site_check_ins`, `enquiries`, `enquiry_reminders`, `payment_records`, `payment_schedule`, `projects`, `project_assignments`, `calendar_events`, `personal_reminders`, `media_assets`.
RLS applies to realtime — clients only receive events for rows they can read. Non-content/high-churn tables (audit_log, attendance_logs, user_capabilities, presets, users, tenants) intentionally excluded. (Updated: 2026-06-01)

### team_member_tags tenant isolation (078_team_member_tags_tenant_isolation.sql)
`owner_manage_tags` policy (orig. 037) gated only on `has_capability('access_control:manage')`, which validates the *caller's* tenant but placed **no predicate on the target row's tenant_id** → cross-tenant IDOR. Policy now also requires `tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)` in both USING and WITH CHECK. The `/api/team-member-tags` route also filters by caller tenant (defense in depth). Related: `/api/team/[memberId]` used the service-role client (RLS bypassed) to mutate a target user by id with no tenant check — also a cross-tenant IDOR, fixed in-code by requiring `target.tenant_id === caller.tenant_id`. (Updated: 2026-06-19)

### Auth rate limiting (079_auth_rate_limit.sql) — APPLIED 2026-06-19
`check_auth_rate_limit(p_kind, p_identifier, p_limit, p_window_seconds, p_ip?, p_user_agent?, p_request_id?) RETURNS boolean` — thin SECURITY DEFINER wrapper over the existing `public_rate_limit_hit()` + `public_abuse_log` primitives (025), granted to `anon, authenticated` (login is pre-auth). Returns TRUE within limit, FALSE when throttled; fails open on missing identifier. Logs a `<kind>_rate_limited` abuse row when throttled. Used by: login + MFA-verify server actions (`kind=login` / `mfa_verify`, 10 / 5 min per IP) and `/api/invite` (`kind=invite`, 20 / hour per user). Portal/enquiry rate limiting was already covered by 025/030. (Updated: 2026-06-19)

### FORCE RLS on all tables (081_force_rls_all_tables.sql)
`ENABLE ROW LEVEL SECURITY` does **not** apply to the table owner — owner-role queries bypass every
policy unless `FORCE` is also set. This schema had FORCE on only **11 of 55** RLS-enabled tables. 081
loops the live catalog and forces RLS on every table where `relrowsecurity` is true but
`relforcerowsecurity` is false. Verified: 11 → 55 forced, 55 enabled.

**`service_role` is unaffected.** It (and `postgres`) carry the `BYPASSRLS` role attribute, which is a
different mechanism from the owner exemption FORCE removes. Confirmed empirically: after FORCE,
`service_role` still reads all rows (projects=148 before and after). The ~20 routes using
`createServiceClient()` are therefore unchanged. Idempotent — re-running picks up tables added later.
(Updated: 2026-08-01)

### FORCE RLS re-applied (097_force_rls_offices.sql)
081 is idempotent but only ever **ran once**, so a table created after it starts unforced. `offices`
(093) did: RLS enabled with two correctly scoped policies, but no `FORCE`, so an owner-role query
bypassed both. The pgtap RLS coverage guardrail caught it (`offices: rls_on=t, forced=f`) — this is
the failure mode 002_rls_coverage exists for. 097 re-runs 081's catalog loop, forcing RLS on every
table where `relrowsecurity` is true and `relforcerowsecurity` is false.

**Any migration that creates a table must pair `ENABLE ROW LEVEL SECURITY` with `FORCE ROW LEVEL
SECURITY`** — 081/097 are backstops, not the mechanism. (Updated: 2026-08-06)

### payment_schedule.is_paid forced derived (082_payment_is_paid_force_derived.sql)
**Money bug.** `is_paid` was recomputed only by `trg_payment_records_recompute` on `payment_records`
(027). Nothing guarded `payment_schedule` itself, so a direct UPDATE persisted — a milestone could read
PAID with **zero payment records**, and would then show as paid in the app, the customer portal
(030/048/061) and the unpaid-milestone push notifications (033).

**Fix:** `force_payment_is_paid_derived()` + `trg_payment_schedule_force_is_paid` (BEFORE UPDATE)
overwrite any client-supplied `is_paid` with `SUM(payment_records.amount_paid) >= amount_due`. The
column is now authoritative on every write path; INSERT keeps DEFAULT false.

Trigger order: fires before `trg_payment_schedule_set_tenant` / `_touch` (alphabetical), harmless —
it only writes `NEW.is_paid`, which neither reads. The 035 audit trigger is AFTER UPDATE, so it records
the *derived* value, not the forged one.

Verified against production in a rolled-back transaction: new row false; forged `is_paid=true` blocked;
partial 400/1000 false; full 1000/1000 true; unrelated UPDATE on a paid row stays true.

App-side: `PATCH /api/projects/[id]/payments/[scheduleId]/status` previously wrote `is_paid` directly
while gated on `finance:view_dashboard` (a **view** capability). Now gated on `customer_payments:edit`,
writes only `triggered_at`, and returns the persisted `is_paid` rather than echoing the request.
(Updated: 2026-08-01)

### Task assignment lifecycle (083_task_assignment_lifecycle.sql)
Turns `member_tasks` from self-set todos into an owner→member assignment system: assign → accept →
in_progress → pending_review → completed, with fixed tags, due dates, time logging, and an owner review
(clean/revision/error). **Additive** — pre-existing tasks default to `status='open'`, `tag='other'`,
`assigned_by IS NULL` and behave exactly as before.

New capability **`tasks:assign`**. Mirrored in `lib/auth/capabilities.ts` — DB
`tag_capability_set()` and that file must always agree.

**Since 087: owner-granted only.** No tag confers `tasks:assign`; it is granted per-user through
the Access Matrix (`source='manual'`). 083 had placed it in the `accountant` / `admin` /
`project_manager` sets, so applying a tag silently handed out the power to assign work *and* sign
off on it — and review verdicts drive the KPI. It now sits beside `access_control:manage` in
`TAG_EXCLUDED_CAPABILITIES`.

Notifications via SECURITY DEFINER wrappers `emit_task_assigned_notification()` /
`emit_task_review_notification()` (the app runs as `authenticated`, which is REVOKEd from
`emit_notification()`).

**Privilege-escalation fix folded in from upstream.** The upstream 086 shipped `owner_review_tasks`
gated only on tenant + `tasks:assign` — a capability held by *members*, not just owners. With no
OLD-vs-NEW comparison possible in RLS, such a member could rewrite `user_id` (steal/reassign any task),
forge `accepted_at`/`submitted_at`, or mark their own work 'clean' — and 084 feeds those straight into
the KPI. This repo never applied the broken form: 083 writes the corrected policy directly
(`assigned_by IS NOT NULL` in USING and WITH CHECK) plus `guard_member_task_review()` /
`trg_guard_member_task_review`, which rejects a reviewer altering `user_id`, `tenant_id`, or the clock.

**Trigger name order is load-bearing.** `member_task_before_update` (038) must fire before
`trg_guard_member_task_review` so the guard compares against values the lifecycle trigger already
stamped. `'m' < 't'` holds by construction — do not rename either. (Updated: 2026-08-01)

### Auto-derived task performance (084_task_performance_auto.sql)
Fills `team_performance_monthly` from completed `member_tasks` so the Performance page and
`v_kpi_scores` (034) populate automatically instead of being typed by hand. New column
`is_manual_override` — when the owner hand-edits a month via `POST /api/performance`, recompute leaves
that row alone.

**View** `v_task_performance_monthly` — per (user, month): tag-weighted volume (drawing=3, review=2,
site=2, admin=1, other=1), error/revision counts, on-time %, overdue days.
**Functions** `recompute_task_kpi(uuid, date)` (upsert one user/month) and `recompute_all_task_kpi()`
(nightly backstop, pg_cron `20 2 * * *`). Caps: weighted volume 200 (where efficiency saturates at
100), site_delay_days 30.

Upstream's single trigger fired only `WHEN (NEW.status='completed')`, so **un-completing** a task left
a stale KPI until the nightly job. Folded in from upstream 089: split AFTER INSERT / AFTER UPDATE
triggers with `WHEN (NEW.status='completed' OR OLD.status='completed')`, and the fuller function that
also recomputes the OLD month and handles reassignment between members.

`recompute_task_kpi()` looks up by `(user_id, period_month)` with **no tenant predicate** and is
SECURITY DEFINER — safe only while 034's `UNIQUE (user_id, period_month)` holds (confirmed at
034:22). If that constraint is ever widened, this lookup and its ON CONFLICT targets break.
(Updated: 2026-08-01)

### Application error log (085_app_errors.sql)
`app_errors` — self-hosted error capture (no Sentry). Server code calls `logError()`
(`lib/log/logError.ts`) which writes via the **service-role** client; `lib/log/withRouteErrorLog.ts`
wraps route handlers and `POST /api/log-client-error` accepts browser-side reports.

`tenant_id` is NULLABLE (errors before a tenant resolves: auth callback, public enquiry, proxy).
RLS enabled **and forced**, read gated on `audit_log:view`; no write policy, so `authenticated` is
deny-all for writes. Explicit `REVOKE ALL ... FROM anon` because `999_zz_explicit_data_api_grants.sql`
only covers tables existing at that time.

**Two known gaps:** the app has no `error.tsx` / `global-error.tsx` boundaries, so nothing currently
calls `/api/log-client-error`; and `x-user-id` is set on the *response* not the request
(`lib/auth/middleware.ts:43`), so `withRouteErrorLog` records `user_id` as null for server-thrown
errors. `log-client-error` populates it correctly via `getUser()`. (Updated: 2026-08-01)

### Block task self-review (086_block_task_self_review.sql)
Fix-forward for 083 — a **KPI-inflation hole** found in review after 083 was already applied.

083 stopped a *reviewer* rewriting a task's owner or time log, and gated `owner_review_tasks` on
`assigned_by IS NOT NULL`. Neither closed **self**-review, for two reasons:
1. `member_own_tasks` (038) is `FOR ALL USING (user_id = auth.uid())` and **PERMISSIVE** — Postgres
   OR's permissive policies, so a member's UPDATE of their own row is authorised by that policy no
   matter what `owner_review_tasks` requires.
2. `guard_member_task_review()` returned early when `auth.uid() = OLD.user_id` by design.

So any member holding `tasks:assign` (the `project_manager` / `accountant` / `admin` tags — **not
only the owner**) could mark their own assigned task `review_status='clean'`, which 084 feeds
straight into `v_kpi_scores`. Self-serve leaderboard inflation.

086 extends the guard: the review **verdict** is rejected on your own row when
`OLD.assigned_by IS NOT NULL`. Deliberately narrow — fires only when `review_status` actually
changes, so accept/start/submit/edit/delete on your own task still work, and self-set todos
(`assigned_by IS NULL`) are untouched. `auth.uid() IS NULL` (service-role/cron) stays exempt.
`app/api/member-tasks/[id]/route.ts` enforces the same rule at the API layer (defense in depth).

Verified on production in a rolled-back transaction, acting as a real member via
`request.jwt.claims`: self-review blocked; own title edit, own submit, own self-set tick all still
allowed; owner review of a member's task allowed; owner forging the member's `accepted_at` blocked.
(Updated: 2026-08-01)

### Owner gates task assignment (087_owner_gates_task_assign.sql)

086 stopped a holder of `tasks:assign` from reviewing their **own** work, but left untouched the
question of *who holds it*. 083 had put `('tasks:assign')` in `tag_capability_set()`'s `all_caps`
block and in the `project_manager` block, so applying an accountant / admin / project_manager tag
silently conferred it. On this database that meant four non-owner holders — three `team_member`,
one `site_engineer` — none individually chosen by the owner.

087 rewrites `tag_capability_set()` without `('tasks:assign')` in either block (everything else
byte-identical, so tags keep granting exactly what they granted before) and deletes the existing
`source='tag'` grants. `source='manual'` rows — the owner's own decisions — are untouched.
`lib/auth/capabilities.ts` mirrors this via `TAG_EXCLUDED_CAPABILITIES`, alongside
`access_control:manage`.

Result: `tasks:assign` is grantable only per-user through the Access Matrix. The capability's
meaning, 083's RLS policies and 086's self-review guard are all unchanged — 087 narrows only *who
receives it*.

Verified on production after apply: sole holder is the owner (`source='manual'`); all three tag
sets return `tasks:assign = false` with counts 62/54/13 matching `TAG_CAPABILITIES`. Separately
verified in a rolled-back transaction that re-applying an `admin` tag to an untagged member does
**not** re-grant it (the other 54 capabilities still apply) — so the hole is closed, not merely
swept. (Updated: 2026-08-02)
