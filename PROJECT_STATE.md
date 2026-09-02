# PROJECT_STATE.md
(Updated: 2026-09-02 — payment wings + reorderable milestones; migrations 114–115)

### Payment wings, Part A/B, and reorderable milestones (2026-09-02, migrations 114–115)

Payments were a single flat milestone list scaled off one `budget_total`, regardless of whether a
project was design-only or design+execution. Now every milestone sits in a **wing** (Design /
Execution) and, within it, under a **Part A / Part B** heading.

**Design-only projects never render the execution wing.** Existing execution rows are kept — a scope
flip hides them, it does not delete them, and they stay editable so a flip back loses nothing. A DB
trigger refuses *new* execution rows on a design-only project, so the API check is not the only
guard.

**Wing budgets are amounts, not percentages.** `projects.design_budget` / `execution_budget` are
entered directly in the New/Edit project modals; a milestone's preset percentage applies to **its own
wing's** amount. A blank wing budget falls back to `budget_total`, so every pre-existing project
computes exactly as it did before. The modals warn when the two wings do not sum to the total —
a warning, not a block, since the owner enters them one at a time.

**Presets are tagged `design_only` or `design_and_execution`.** A design-only preset cannot hold
execution milestones (DB trigger). Applying a full preset to a design-only project **takes only its
design half** rather than failing, so one preset works on both kinds of project. The preset editor
groups items by wing and part, shows a per-wing percentage total (each wing should reach 100% of its
own budget), and lets an item be re-filed, reordered, or inserted between two others.

**Reordering and insert-between are server-side.** Three SECURITY DEFINER RPCs
(`reorder_payment_milestone`, `insert_payment_milestone_at`, `resequence_payment_schedule`) renumber
the list inside a single statement. This is not incidental: `payment_schedule` has a DEFERRABLE
unique constraint on `(project_id, sequence_order)`, which tolerates transient collisions *within one
statement* but not a client renumbering row-by-row over HTTP. Milestone rows gained ↑ / ↓ / "+ Below"
controls; cross-wing moves are done from the Edit modal's Wing/Part selectors.

**New route:** `POST /api/projects/[id]/payments/reorder`. `POST /api/projects/[id]/payments` accepts
`wing`, `part`, and an optional `after_order` for insert-between.

**A real bug the probe caught:** 114's reorder compared the target index against project-wide
`sequence_order`, so a move landed one slot off in every group after the first. Fixed in 115 by
ranking within the group first.

**Verified:** 16-assertion DB probe + 9-assertion route-logic probe, both transactional against the
live database and rolled back, both green. `npm run build` green. A pre-existing type error in
`app/api/chat/attachments/[id]/route.ts` (unrelated, reproduces without these changes) was left alone.

### Notification tenant boundary + chat scan states (2026-08-31, migrations 112–113)

The two items flagged as "known, not fixed" in the chat entry below, closed.

**112.** `notifications` and `notification_recipients` had **no tenant predicate in any policy** —
032 checked that a recipient row named you, 006 checked `user_id = auth.uid()`, and neither
mentioned a tenant. Tenant isolation was a property of the writers, not the schema. Now asserted in
the policies, so a writer that gets recipients wrong produces an unreadable row instead of a leak.

The natural fix is mutually recursive and Postgres rejects it at query time — caught by the probe
before it reached the database. A SECURITY DEFINER `notification_tenant(uuid)` helper breaks the
cycle. Anything added to these policies later must not join the two tables back to each other.

**113.** Chat's attachment gate refused only `infected`, a value nothing in this codebase produces
— a check that read as protection and gave none. Added `quarantined` as a reachable operator hold
and the route now refuses both. **This did not add a scanner**; there is none, on chat *or*
`media_assets`, whose `is_clean` column has been false for every row since 020. Requiring `clean`
would block every image, so the honest posture is documented instead: private bucket, 30-minute
signed URL, participant-only RLS.

**Verified:** 6 assertions that the new policies keep existing notifications readable, mark-read
working and a peer's rows private; 8 that both migrations are live and chat is unregressed; the
original 8-assertion DM isolation probe re-run clean. `npm run build` green.

### Bridge becomes a chat — DMs, unread badge, attachments (2026-08-31, migrations 107–111)

Client asked for "a mini Slack/WhatsApp style chat within the app", an unread number on the Bridge
icon in both navbars, and explicitly: it must not slow the rest of the app down with fetching.

**What shipped.** Project threads keep working unchanged. Added 1:1 DMs between any two active
users in the tenant (no capability gate — the decision was that anyone in the studio can message
anyone), reply-to quoting, image attachments, and typing/seen indicators in DMs. Notifications stay
**in-app bell only**; no web push, per 099's reasoning that a push per message gets the app muted.

**The badge is the performance-critical piece.** `ChatBadgeProvider` sits in the app layout, fetches
`chat_unread_counts()` **once per session**, and thereafter mutates the number locally: +1 on a
realtime INSERT the user did not author, 0 on opening a thread. One resync on tab-refocus after
>60s hidden, since realtime does not replay events missed while the socket slept.
**Per navigation: zero network.** The same payload feeds the Bridge sidebar, so list and badge
share the one request.

This also **replaced** `GET /api/bridge/reads`, which pulled up to 2000 message rows into Node and
counted them in JavaScript — affordable on one page, not as an app-wide badge. That route is
deleted; `/bridge` in `RealtimeRefresher` is now an empty table set, since a `router.refresh()`
there would re-run the page's server components on every incoming message.

**Two pre-existing triggers broke on DMs — found by the verification probe, not the type checker:**
- `trg_bridge_set_tenant` used the shared `set_tenant_from_project()`, which raises on a NULL
  `project_id`. Every DM insert failed. Now uses its own `set_bridge_message_tenant()`.
- **`notify_bridge_message()` (099) fired on DMs too.** Its recipient rule is "owners of the tenant
  OR anyone assigned to the project"; with `project_id` NULL the owner branch still matched, so a
  private DM raised a bell notification **carrying the message preview** for every owner in the
  tenant. Fixed in 109.

**Security review found a third issue, confirmed live:** 107 granted INSERT on
`chat_conversations` directly to `authenticated`, so `open_dm()`'s same-tenant peer check was
bypassable via PostgREST — a client could name any user id as the peer. 111 moves the peer
validation into the `chat_conv_insert` policy itself and re-checks the peer's tenant inside
`notify_dm_message()`. The cross-tenant half was not reachable on this database (single tenant),
but the hole was structural.

**Known, pre-existing, NOT fixed:** `notifications` / `notification_recipients` SELECT policies
have **no tenant predicate at all** (006/032) — they key only on `user_id = auth.uid()`. Chat is no
longer a way to exploit that, but any future code writing a recipient row from a client-influenced
user id would be. Fixing it touches every notification path, so it was left out of this change.

**Verified:** `npm run build` green. A 17-assertion transactional probe against the live DB (rolled
back), running as real users under RLS via `request.jwt.claims`, covers: reversed-argument DM
identity, a third party seeing zero messages / zero conversation rows / zero unread counts for a DM
they are not in, an outsider unable to forge a DM between two other people, unread counts per user,
own messages not counting as unread, read state being private, and the DM notification reaching
exactly one recipient (the peer, not the author). Plus 3 assertions that the 111 hardening refuses
a fabricated or inactive peer while leaving legitimate DMs working. Bridge held only 2 messages in
production before this change, so there was almost nothing to migrate.

**Not done:** virus scanning of chat attachments is stubbed the same way `media_assets` is —
`scan_status` defaults to `pending` and nothing flips it; the signing route refuses `infected` but
nothing ever sets that. Same posture as the existing image pipeline, not a regression, but it is
not protection either.

### Client portal content — updates, images, site visits (2026-08-31, migration 106)

The customer portal showed milestones and payments only. It now also carries what a client actually
asks about between milestones. Three new sections on `/c/customer/[hash]`, each rendering nothing at
all when empty, plus a **Client Portal Content** card on the customer detail page that curates them.

- **Updates box** — new `customer_updates` table, written *for* the client. Deliberately not a
  `visible_to_customer` flag on the internal `updates` feed: those rows are team shorthand and were
  never composed for a client to read.
- **Images** — one flat gallery across every project the customer owns. Uploads now also produce a
  **webp derivative** (`sharp`, 1600px cap, q78 — measured ~87% smaller than the source JPEG on a
  3000px test image); the original still goes to Drive as the archive. Conversion is best-effort:
  on failure `webp_path` stays NULL and the portal serves the original, so a bad EXIF header
  degrades quality rather than failing the upload. `prunePrivateMedia` now deletes the derivative
  alongside the original.
- **Site visits** — both real `site_check_ins` (the existing check-in/check-out API was already
  built and is unchanged) and owner-logged manual visits, in the same table tagged by `source`.
  The client sees **name + date only**.
- **"Powered by ascension" removed** from both client-facing portals (`/c/customer/[hash]` and
  `/c/[hash]`). Staff-facing login/accept pages keep their footers.

Everything defaults to hidden — `visible_to_customer` starts false, `customer_updates` starts empty —
so no existing client saw anything new on deploy. Gated on the pre-existing
`images:select_for_customer`; no new capability was invented.

New routes: `/api/customers/[id]/updates` (GET/POST), `.../updates/[updateId]` (PATCH/DELETE),
`.../portal-images` (GET/PATCH), `.../visits` (GET/POST/PATCH). Each re-checks the capability
server-side and verifies the asset/visit belongs to *this* customer — without that check the
capability would let a holder publish any image in the tenant onto any client's portal.

**Verified:** `npm run build` green; a 10-assertion transactional test against the live DB (rolled
back) confirmed visible/hidden filtering on all three sections, that infected images stay out, that
visits expose no duration/GPS, and that two manual visits for the same person+project coexist.

**Known, pre-existing, NOT fixed here:** `/c/[hash]` (the per-project portal) signs its images with
the **anon** client, which cannot mint signed URLs for the private `media-private` bucket — verified
directly: anon returns "Object not found" where the service client succeeds. Its images have
therefore never rendered. The new customer-portal gallery uses the service client and works. Fixing
the older portal is a separate change.

**Issue found while building:** `idx_site_checkin_open_session` is UNIQUE (user_id, project_id)
WHERE `checked_out_at IS NULL`, so a manual visit left open collides with that person's live
check-in. Manual visits are now written closed. See SCHEMA.md §106.

### Edit-project modal: team list showed inconsistently (2026-08-13, NO migration)

Client: assigned members and site engineers were not showing in the Edit Project popover, and newly
added ones vanished before saving. Data was fine — verified 32 assignments all resolving to live
users in the same tenant, so the join filter `.filter(a => a.users)` was never the cause.

Two bugs in `app/(app)/projects/[id]/EditProjectModal.tsx`, both from `openModal` setting
`usersLoaded=false` on every open to force a refetch:
- **Refetch clobbered unsaved adds.** The `.then` did `setTeamEntries(entries)` unconditionally.
  A member added but not yet saved has no `assignment_id` and exists only in local state, so the
  refetch overwrote it. Now merges: server rows plus any pending add not already on the server.
- **Existing members hid behind "Loading…".** `usersLoaded=false` swapped the whole team block for
  a spinner on *every* reopen, so an assigned roster read as absent for the length of the fetch —
  and as "No team members assigned" if the fetch failed. The spinner is now limited to a cold open
  (`!usersLoaded && teamEntries.length === 0`), and the empty-state line waits for `usersLoaded`.
- **Known, left as-is:** an unsaved *removal* is reverted by a refetch (the merge preserves pending
  adds, not pending removals). Fails safe — it drops an unconfirmed removal rather than deleting an
  assignment — and only triggers on reopen-after-remove-without-saving.
- Merge and submit-diff logic covered by a 6-case throwaway harness (both reported symptoms, the
  duplicate-after-save case, and the add/remove diffs); all pass.

### Comp-off credits: earn +1 leave day for weekend/holiday work (2026-08-13)

Client: team members should be able to raise their own leave count — "a plus button with reason or
remarks" on the leave card for a Saturday/Sunday worked. Framed as "plus and minus": taking leave
spends the balance, working a non-working day earns it back.

- **Migration 103** — new `comp_off_credits` table + `v_leave_balance` recreated so entitlement is
  `annual_leave_days + approved credits`. See SCHEMA.md for constraints and why it is a separate
  table from `leave_requests`.
- **Approval-gated by design.** The obvious build — plus button increments the balance — would have
  been the first self-service path to grant your own entitlement, exactly what `guard_leave_decision`
  (088) and the 086 self-review block exist to prevent. A claim lands `pending` and only becomes a
  day after an approver with `leave:approve` decides it. Confirmed with a live probe that the owner
  cannot approve their own claim despite holding the capability.
- **Member UI** — `+` button beside "Request leave" in `app/(app)/team-member/LeaveCard.tsx`; date
  (capped at today) + remarks. Balance strip gains an **Earned** tile; a "Days worked (comp off)"
  list shows every claim with its status and a Withdraw action while pending.
- **Owner UI** — pending claims join the existing queue in `app/(app)/team/LeaveApprovalCard.tsx`
  (`/team`), shown as "Worked <date> · +1 day" with the member's remarks. One inbox, two sources.
- **API** — `app/api/comp-off/route.ts` (GET mine / `?scope=all`, POST claim) and
  `app/api/comp-off/[id]/route.ts` (approve / reject / withdraw), mirroring `/api/leave`.
- Future dates are refused; duplicate dates return 409 off the UNIQUE constraint.

### Leaderboard: attendance-only members no longer top the board (2026-08-13)

`memberScore` in `app/(app)/team/page.tsx` returned bare `consistencyScore` when a member had no
completed tasks, skipping the 0.85/0.15 delivery weighting. Because `consistencyScore` saturates at
100 on ~9 days of attendance alone, **Manasa Suresh (0 tasks) ranked #1 at 100**, tying people with
20+ completed tasks. Now scores as `delivery ?? 0`, so no completed work means a low score, not a
perfect one. Verified against production: she moves #1 → #10 (score 15), and everyone above her has
delivered work. Note `consistencyScore` still saturates for every active member — it carries almost
no ranking signal today; worth revisiting if attendance should actually differentiate people.

### Efficiency points uncapped (2026-08-13)

Client: monthly points should not stop at 100. **Migration 102** removes `LEAST(100, …)` from the
efficiency pillar of `v_kpi_scores`; only that pillar changed (see SCHEMA.md for why quality,
delivery and client rating were left alone). **`overall_kpi_score` can now exceed 100** — it is an
index, not a percentage. `PerformanceClient.tsx` is safe (threshold-based grades, no percentage
bars); any *future* consumer rendering it as a bar must clamp. Verified 250 items → efficiency 500,
overall 220. No backfill needed — it is a view over raw counts, so history re-derives.

### Prior entry
(Updated: 2026-08-13 — PM+SE supervisor view at /site/team + self-service project picker; NO migration)

### Self-service project multiselect + active-only dropdown (2026-08-13, same session)

Follow-on to the entry below. Client first asked to bulk-add the PM+SE to **all** active projects;
mid-implementation they changed it to **let him choose**, and scoped multiselect to this view only.

**Nothing was bulk-written.** The bulk insert was scoped (55 rows) but never run — he picks instead.
Production still shows his original 3 assignments.

- **"My projects" card** on `/site/team` → Manage. Checkbox list of active projects with search
  (appears past 8 — the tenant runs 56 active), select-all/clear, and rows he is already on shown
  disabled rather than hidden, so the list does not shift under him between saves. He is added as
  `role_on_project='pm'`.
- **"Put an engineer on projects"** card does the same for another engineer (`site_engineer` role).
- **Multiselect is deliberately confined to `/site/team`.** `/team`'s `AssignToProjectPanel` was
  briefly converted and then **reverted** — per the client, this feature is for the SE+PM view only.
  Shared picker lives in `components/projects/ProjectMultiSelect.tsx`; the two site cards use it,
  `/team` is untouched.
- **No new API surface.** Both cards loop `POST /api/projects/[id]/assignments` (one project per
  call), which re-checks `team:assign_to_project` per request. **Sequential, not `Promise.all`** —
  50-odd parallel writes would strain the pool, and a partial failure must name the project rather
  than collapse into one rejected promise. Per-project outcomes are reported.
- **Self-assignment needs no new permission.** Verified: neither `013`'s INSERT policy nor the POST
  route restricts *who* may be assigned; both gate on `team:assign_to_project` alone, which he holds.
- **Rehearsed against production in a rolled-back transaction:** inserts succeed, the
  `set_tenant_from_project` BEFORE INSERT trigger populates `tenant_id` (0 NULLs), and a repeat add
  raises **23505** on `UNIQUE (project_id, user_id, role_on_project)` — which the route already turns
  into "This user already has that role on this project". Confirmed afterwards that production still
  holds exactly 3 rows for him; nothing leaked.

**Dropdown is now active-first with a fallback** (`layout.tsx` + `site/page.tsx`, kept in sync — if
they disagree the dashboard resolves a project the selector cannot show). Neither query filtered on
`status` before, so finished work accumulated in the selector permanently.
- **A plain active-only filter was tried first and rejected on evidence.** It emptied **Mohammed
  Sidddiq's** dropdown outright — his single assignment is a completed project — leaving him a
  dashboard with no project at all. The shipped rule is: **show active projects when there are any,
  otherwise show everything assigned.** Verified live: Adarsha 3 → 1 (2 completed dropped),
  Mohammed 1 → 1 (fallback holds).

**Not done / known:**
- [ ] **Still never opened in a browser** — same login/credentials blocker. The picker, the loop's
      partial-failure path and the fallback rest on `tsc`, `eslint`, `npm run build`, the rolled-back
      rehearsal and live SQL — **not** on watching them work.
- [ ] The loop fires one request per project. Picking all 55 means 55 sequential requests; there is
      no progress bar beyond the button label, and no batch endpoint.
- [ ] Adding someone is one-way here — **there is no un-assign** on either card. Removal still lives
      on the project page.
- [ ] The fallback means a completed project can still appear for an engineer with no live work.
      Intended, per the client's call.

### Site engineer who is also a project manager gets a Team tab (2026-08-13)

Client: the project manager who is *also* a site engineer must be able to track all the other site
engineers — their tasks, updates, progress and check-ins — from his own dashboard.

**No migration. He already held every capability; the screen simply did not exist.** Verified live
before writing anything: **Adarsha Pejavar** is the person (`role='site_engineer'` **and** carries the
`project_manager` tag — the only tagged non-team_member in the tenant). The tag had already granted
him `member_tasks:view_all`, `daily_tasks:view_all`, `office_attendance:view_all`, `project:view_all`,
`team:assign_to_project` (source `tag`) plus `site_check_in:view_all` and `tasks:assign` (source
`manual`). Those grants were **dead** — `layout.tsx` routes every site engineer into
`SiteEngineerChrome`, whose seven tabs are all single-project, so nothing in the app ever read them.
This batch is the missing UI for rights that already existed, not a widening of access.

- **New `/site/team`.** Roster of every *other* active site engineer in the tenant, grouped by live
  state: **On site now** (open `site_check_ins` row) / **In the office** (`last_check_in_at` set) /
  **Not checked in**. A headline band gives on-site count, total open tasks, and tasks awaiting
  review. Each row expands to that engineer's projects, open tasks with due state, completed count
  and last 8 site check-ins (in→out, duration, off-site flag). Tap-to-call on the phone number.
- **Gate is `member_tasks:view_all`**, checked server-side; a site engineer without it is redirected
  to `/site`. Verified against production: **1 of 5 site engineers passes** (Adarsha), the other four
  fail every check. The Team tab is likewise conditional in the chrome, so the other four never see a
  link to a page they cannot open.
- **Actions ride on existing capabilities, re-checked per action.** Assign-task (`tasks:assign`) and
  Add-to-project (`team:assign_to_project`) reuse `AssignTaskModal` and `AssignToProjectPanel` from
  `/team` verbatim and post to the existing `/api/member-tasks` and
  `/api/projects/[id]/assignments` routes. **No new API surface was added.**
- **`site_check_ins` needed no RLS change** — 018's `site_checkin_select` already admits
  `site_check_in:view_all`, which he holds.
- **The updates feed reads through the service client**, for the same reason the project stream does
  (2026-08-06 entry): `updates` RLS is per-viewer, so the caller's client returns a different,
  mostly-empty feed. Scoped explicitly to his `tenant_id` **and** to the engineer ids already
  resolved, so the elevated read cannot widen past the roster.
- **`localDate()` is used for the attendance day**, not `toISOString()` — the 101 IST rule.

**Not done / known:**
- [ ] **Never opened in a browser.** Same standing blocker as every batch since 2026-08-05: the route
      is behind a login and there are no test credentials. Claims rest on `tsc`, `eslint`,
      `npm run build` and live SQL verification of the gate and roster — **not** on watching it work.
- [ ] **The roster will look almost empty on first open, and that is correct.** The other four site
      engineers currently have **0 member_tasks, 0 site check-ins in 30 days, and 0 updates** between
      them; only Mohammed Sidddiq has even a project assignment (1). Adarsha himself has the only 2
      site check-ins in the tenant. The screen fills as they use the app — do not read the empty
      state as a query bug.
- [ ] Scope is **all site engineers tenant-wide**, not just those on his projects (client's call).
      If that ever needs narrowing, it is a filter on the roster query, not a capability change.
- [ ] Office `attendance_logs` are read for **today only** — presence, not payroll. There is no
      hours-per-week view for the engineers he supervises.

(Previous: 2026-08-07 — attendance IST fix + auto check-out; migration 101 APPLIED)

### Attendance: IST day boundaries, auto check-out, geofence backfill (2026-08-07)

**Migration 101 APPLIED 2026-08-07** through `scripts/migrate.ts`. `tsc` clean, `eslint` clean,
`npm run build` passes. See SCHEMA.md 101 for the full record.

Three defects reported by the client, all in office attendance. Two shared one root cause: the DB
session runs in **UTC** while the tenant works in **IST**, and nothing reconciled them.

- **"People aren't being logged out — still says clocked in." FIXED.** `work_date` was derived from
  the UTC date, which lags IST until 05:30, so a check-out in that window looked up a row that did
  not exist and left `last_check_in_at` set forever. **13 rows were stuck open in production; now 0.**
  `work_date` now goes through `localDate()` in `lib/attendance/day.ts` everywhere. The card also
  re-reads the server row when a check-out fails, instead of continuing to display "Checked In".
- **Auto check-out at 18:15 IST. BUILT.** New `close_stale_attendance()` on a pg_cron job every 15
  minutes. Closed rows are marked `auto_checked_out` so a system close is distinguishable from a
  real one. Verified idempotent and verified end-to-end on a seeded open row (closes 18:15, 15 min
  OT, 525 min worked).
- **Overtime was never correct for anyone.** Not reported by the client, found while fixing the
  above: the OT trigger compared against 18:00 **UTC** = 23:30 IST, so OT only accrued after half
  eleven at night. **1 row of 72 had OT; now 58, with 0 mismatches against a fresh recomputation.**
- **"Flagged / out of geofence" at the office. FIXED BY BACKFILL, no code change.** Already fixed by
  093 — every flagged row predates its office existing in `offices`, and the flagged check-ins
  measure **5–55m** from the office (radius is 200m). GPS was never the problem. **12 → 0.**

**⚠️ OPEN — needs the client's answer.** They asked for "log out everyone at 6.15 pm and then it
comes out as ot". The job stamps the **real** closing time, not a flat 18:15, because a flat stamp
would erase genuine OT for someone working till 9pm and would give everyone exactly 15 minutes and
nobody more (OT accrues against 18:00). Confirm which they want before treating this as settled.

### Tasks: assigner edit/delete, owner-wide view, editable calendar events (2026-08-07)

**Migration 100 APPLIED 2026-08-07** through `scripts/migrate.ts`, rehearsed in a rolled-back
transaction first, ledger verified. `tsc` clean, `npm run build` passes. See SCHEMA.md 100 for the
policy/trigger record.

- **Assigner can now edit and delete.** "Assigned by me" rows gained inline edit (title, assignee,
  due date) and a delete confirm. Previously the surface was write-once — a typo meant asking the
  member to delete their own row. Only the assigner sees the controls
  (`t.assigned_by === currentUserId`); an owner watching the whole firm cannot rewrite work somebody
  else handed out.
- **Reassignment resets the clock.** Enforced in the trigger, not the API — the new person must not
  inherit the previous member's logged hours, which feed the performance algorithm.
- **The owner's task page was not broken, it was empty.** Both live owners already hold
  `tasks:assign` *and* `daily_tasks:view_all`, so RLS was never the blocker; `page.tsx` was filtering
  the assign tab to `assigned_by = me`, and the owner had assigned nothing. Owners now see **every**
  task in the tenant ("All tasks") and the whole review queue. This is a widened VIEW, not widened
  rights — the rows were already readable via `owner_view_member_tasks` and reviewable via
  `owner_review_tasks`.
- **Reviewer is now visible and editable.** The assign table shows who each submission was addressed
  to, falling back to "<assigner> (default)" / "Owner (default)" rather than a bare dash. A member
  can change their chosen reviewer *while the task is still pending* — locked once a verdict exists,
  since re-pointing a closed task would reattribute somebody's sign-off. Per the client: the owner
  keeps seeing everything, including work addressed to someone else, so they know what is going on.
- **Fixed in passing:** the non-owner review query on `page.tsx` handed every pending task to any
  assigner, but `PATCH` then 403s on tasks addressed elsewhere (096). It now mirrors the API's
  `GET ?scope=review` rules, so the page no longer renders buttons that cannot work.
- **Calendar events are editable** by whoever may create them — `PATCH`/`DELETE /api/calendar/[id]`,
  plus an edit/delete pair on each event card and a combined Add/Edit modal. **No migration needed:**
  026 already admits `created_by` or a `calendar:create_for_others` holder.
  - **Trigger-generated events are deliberately read-only** (`source_type IS NOT NULL` → 409).
    `sync_reminder_to_calendar()` rewrites a reminder event whenever the source row moves, so an edit
    would silently revert and a delete would orphan the reminder. Live data: 4 manual, 1 reminder.
  - A failed save used to close the modal and drop the edit silently; it now shows the error and
    keeps the form open.
- **`.sr-only`** added to `globals.css` — it did not exist, and the new actions column needs an
  accessible header.

**Incident during this session:** a `git stash` to test a lint baseline died on signal 10, leaving a
stale `.git/index.lock` and reverting four working-tree files plus emptying
`app/api/calendar/route.ts`. All were recovered from the stash commit (including this file's Bridge
section, which was uncommitted and briefly lost). **Everything in the working tree is uncommitted —
commit before running any further stash/reset.**

**Not done / known:**
- [ ] **None of this has been seen in a browser.** Same blocker as the Bridge work: the routes are
      behind a login and there are no test credentials. Claims rest on the migration rehearsal, live
      SQL verification, `tsc` and `npm run build` — **not** on watching the UI work. Needs one
      authenticated pass over: assigner edit/reassign, assigner delete, the owner's "All tasks" tab,
      the member's reviewer dropdown, and calendar edit/delete.
- [ ] Reassigning silently discards the previous member's logged time (by design, see SCHEMA.md) but
      the UI does not warn before it happens. Worth a confirm step if it bites anyone.
- [ ] The assign table now has 10 columns and scrolls horizontally on a phone. It was already
      `overflow-x: auto`; no phone-specific layout was added for the new columns.

(Previous: 2026-08-07 — Bridge rebuilt as a real chat; migrations 097 + 098 + 099 APPLIED)

### Bridge — realtime, unread, notifications (2026-08-07)

Client asked for Bridge to work "like Slack, but simple for this firm". Ran the `effortless` skill.
**Migrations 098 and 099 APPLIED 2026-08-07** — see SCHEMA.md for the record and the live verification.
The DB is now ahead of the deployed code, which is the safe direction. `tsc` clean, `npm run build`
passes, no new eslint findings.

**097 was replayed in the same run** — on disk but missing from `_migrations`, and its effect really
was undone (`offices` RLS-enabled but unforced). Now forced; zero tables in `public` are
enabled-but-unforced. Third instance of this ledger-drift class after 094/095.

**The headline finding: messages never arrived.** `bridge_messages` was not in the realtime
publication (071 lists 19 tables; this was not one), and `RealtimeRefresher` mapped `/bridge` to
`projects` + `project_assignments` — the two tables whose changes do not matter there. A sent message
was invisible to everyone else until they reloaded the page. There was also no notification path at
all (041 only generates personal-reminder notifications). Bridge was a shared notepad, not a chat.

- **Live messages** (098). `BridgeClient` holds its **own** subscription rather than joining
  `RealtimeRefresher` — that component calls `router.refresh()`, which would re-run the page's server
  components on every chat message and fight the optimistic append. The `/bridge` entry in
  `ROUTE_TABLES` is deliberately left without `bridge_messages`, with a comment saying why.
- **Unread + recency** (098). New `bridge_reads` table, `GET/POST /api/bridge/reads`. The project list
  sorts unread first, then most-recent-message; alphabetical order buried the thread you were just in
  at position 40 of 56. Search appears past 8 projects. Counts derive at read time.
- **Notifications** (099). Assignees + owners, minus author; **one live notification per thread**,
  revived when the thread moves again; cleared for that user alone when they open it. In-app bell
  only — no web push until real volume is known. Full rationale in SCHEMA.md.
  - `NotificationBell` now subscribes to `event: "*"` instead of `INSERT`. Clearing and reviving are
    both UPDATEs, so the badge would otherwise have gone stale on both.
- **Compose is one box.** The three type buttons (Text / Material Request / Clarification) forced a
  decision before every message when ~99% are plain text. Material Request and Clarification moved
  behind a `+`; the 020 trigger that drafts a `material_plan` row is untouched, just off the hot path.
- **Optimistic send.** The message appears immediately and reconciles when the insert returns. A
  failed send previously **vanished silently** (`if (res.ok)` with no `else`) — it now stays on screen
  with a red border and "Not sent".
- **Field-context floor** (the site engineer sets it): 44px targets throughout (type buttons were
  ~22px, under the WCAG 2.5.8 minimum), 15–16px body text (was 13px), Enter sends / Shift+Enter
  newlines (the old ⌘Enter-only binding meant nothing on a phone), phone-collapsible project list with
  a total-unread badge. Also added day separators and "You" on own messages.
- **Realtime subscription bug, found and fixed in-session.** First cut used a stable channel name and
  depended on `activeProjectId`, so switching project re-attached `.on()` to an
  already-subscribed cached-singleton channel: *"cannot add `postgres_changes` callbacks for
  realtime:bridge_messages_live after `subscribe()`"*. Now subscribes once per mount under a random
  channel name, reading changing values through a ref.
- **`agent-browser` installed** as a devDependency (0.27.0) for this project. Smoke-tested.

**Phone pass + notification badge fix (same day, later):**

- **The phone layout was genuinely broken and is now measured, not guessed.** The shell pads
  `.mobile-main` 120px for the fixed `MobileNav`, so the composer sat *under* the nav and the message
  list never scrolled — it grew and pushed the input off-screen. Two causes, both fixed:
  1. `min-height: 0` reached `.bridge-thread` but not the card inside it. A flex item defaults to
     `min-height: auto` and refuses to shrink below its content, so the list could not scroll.
  2. The chrome allowance counted the header but **not the nav**. Now composed from measured parts:
     top inset + 107px header + 64px nav + bottom safe-area, with a `display-mode: standalone`
     variant because the shell floors its top padding at 47px there.
  Verified in a standalone harness at 390×844, 375×667 and 412×915: composer clears the nav (29px
  gap) and the message list scrolls in all three. **The harness is not the app** — the real page is
  behind a login, so this proves the CSS math, not the finished screen.
- **Project picker is a native `<select>` on phones** (per request), sidebar retained on desktop. The
  OS picker is scrollable, type-ahead and one-thumb, and costs no vertical space in a chat view.
  Unread counts ride in the option label (`(3) Rehman Villa`) since a `<select>` cannot hold a badge.
  Removed the now-orphaned `listOpen` state and `totalUnread` memo that only fed the old toggle.
- **The "always 1" phone badge.** Not a bell bug — the bell renders a dot with no number. It was the
  **PWA home-screen icon badge**: `sw.js` never called `setAppBadge`, so iOS applied its own "1" on
  the first push and nothing ever updated or cleared it. Confirmed against production: 18 live push
  subscriptions, real unread counts of 8 / 6 / 1 per user, all showing "1" on the icon.
  - `sw.js` now sets the badge from `getNotifications().length` on push and recounts on
    `notificationclick`; `NotificationBell` re-syncs it to the true unread count while the app is
    open and calls `clearAppBadge()` at zero. All guarded — `setAppBadge` is unsupported on desktop
    Safari and older Android, and a badge failure must never break notification delivery.
  - **`CACHE_VERSION` bumped v7 → v8**, required or phones keep the old service worker.

**Not done / known:**
- [x] **098 + 099 applied 2026-08-07**, rehearsed in a rolled-back transaction first. The trigger's
      recipient set, the per-thread collapse and the unread → read → **revived** cycle were each
      confirmed against real production rows (rolled back). Post-apply: every object verified live and
      no rehearsal data leaked.
- [ ] **The signed-in page has still never been opened.** `agent-browser` is installed and reaches
      `/bridge`, but the route 307s to `/login` and I have no test credentials — so the UI claims
      (sidebar, optimistic send, live append, bell clearing) rest on build + source review, **not** on
      watching them work. Needs one authenticated two-browser pass.
- [ ] `clear_bridge_notification()` was not itself executed in the rehearsal — it keys on `auth.uid()`,
      null on a direct connection, so the clear was simulated with the equivalent UPDATE.
- [ ] **Bell rows are not clickable** — `NotificationBell` renders no link, so a bridge notification
      cannot be tapped through to its thread. Pre-existing and affects every notification type, so it
      was flagged rather than fixed. `notifications.url` exists and is unused.
- [ ] Completed projects stay hidden from Bridge (shipped deliberately 2026-08-05); their threads are
      unreachable, owner included.
- [ ] `/bridge` still shows no unread count in the nav. The data now exists; it needs a fetch in the
      layout.

(Previous: 2026-08-06 — team UI redesign + tasks in the updates feed; migration 096 APPLIED)

### Migration 096 applied (2026-08-06)

Applied through `scripts/migrate.ts` and verified — see SCHEMA.md 096 for the full record. Three
things worth carrying forward:

- **The first attempt failed** on `syntax error at or near "SELECT"`: the 2-arg delegating overload
  was declared `LANGUAGE plpgsql` with a bare `SELECT` body. Changed to `LANGUAGE sql`, re-applied
  clean. The failure rolled back whole, so nothing partial ever reached the database.
- **095 was replayed and is now recorded.** It had been applied by hand over `DATABASE_URL` on
  2026-08-05, so `_migrations` never knew about it and the runner ran it again. It is idempotent and
  its objects were verified untouched afterwards. Use the runner for migrations from here on — a
  hand-applied migration leaves the ledger lying.
- **The guard clause was tested behaviourally**, closing the gap this file flagged: a `tasks:assign`
  holder could write `review_status` on the row (control) but was refused on `review_requested_to`.
  Run inside a transaction that was rolled back; no production rows changed.

### Team UI redesign + tasks in the updates feed (2026-08-06)

No migration. Everything below is UI and read-path only — `member_tasks.project_id` (095) and the
existing RLS carried the data side already.

- **`/team/[memberId]` profile redesigned.** The page had 19 equal-weight stat tiles across five
  cards, so nothing read. Now: a three-figure headline band (hours, task completion %, flags),
  tabs (Overview / Attendance / Tasks / Performance), and secondary numbers demoted to inline
  label/value pairs that grey out at zero. The attendance strip became a **shift ribbon** — one
  column per day, height = hours worked, amber cap = overtime, hatched outline = still on the
  clock. Also: tap-to-call phone, `role_label` now used (it was fetched and ignored), Escape
  closes the export menu.
- **`/team` overview redesigned** to match. Team-level headline band (on the team / in flight /
  completed / needs attention), roster filters (Everyone · Needs attention · Nothing on), and
  each row's active-task count drawn as a workload bar instead of grey metric chips. "Needs
  attention" derives from tasks awaiting review, flagged verdicts, or a member who has not joined.
- **Project picker on existing tasks.** `/tasks` already had one at creation; it is now editable
  inline on open self-set tasks, and on the "Assigned by me" table the **assigner** can re-point
  a task they handed out (locked once complete — re-pointing finished work would move history
  between projects).
  - API: `PATCH /api/member-tasks/[id]` previously scoped every non-review write to
    `user_id = caller`, so an assigner could not touch it. Now a **project_id-only** body from the
    task's `assigned_by` holder writes via `assigned_by`, re-checking `tasks:assign` because that
    is what `owner_review_tasks` (083/095) gates on. Deliberately narrow: any other field in the
    same body falls back to the self-scoped write and 404s. No RLS change — `guard_member_task_review`
    already blocks `user_id`/`tenant_id`/the time-logging columns, and never covered `project_id`.
- **Pending tasks now appear in the updates feeds.** 095 merged project-linked tasks at read time
  but filtered `status = 'completed'`, so a task only surfaced once done. Both feeds now show work
  in progress as a pending entry that is **replaced** by the completed entry when the task closes
  (one task row = one entry, never both). A task in `pending_review` still counts as in progress.
  - Project stream: `app/api/projects/[id]/updates/route.ts` + the duplicate build in
    `app/(app)/projects/[id]/page.tsx`. Range filters now apply to whichever timestamp the entry
    sorts on, since a pending task has no `completed_at`.
  - Global `/updates`: previously read only the `updates` table. Tasks are merged in the page via
    the service client (same reason the project feed uses it — `member_tasks` RLS would give each
    viewer a different feed), scoped to the caller's tenant and to tasks that name a project.
    Rendered as `task_pending` / `task_completed` synthetic types. **Nothing is written to
    `updates`** — its `update_type` CHECK (020) is untouched and a task keeps one home row.
- **Team-member desktop home** (`TeamMemberHome.tsx`, desktop-only + team-member-only): Add Update
  moved under Broadcasts in the right rail; Tasks now spans the full work surface.
- **Removed the "Part…" (drawing_role) picker** from the team-member Tasks card at the client's
  request. The column and its data are untouched — the API still returns it and reports read it.
- **Shift ribbon hover readout.** Hovering (or keyboard-focusing) a ribbon column now shows a
  styled card with the weekday, the check-in–check-out clock times, hours, overtime and a late
  flag. The native `title` was ~1s-delayed, unstyled and keyboard-invisible; it is kept as the
  print/AT fallback. Columns are `tabIndex={0}`, and the card re-anchors at both ends of the
  ribbon so it never hangs off the edge.

`tsc` clean, `npm run build` passes, no new eslint findings on touched files.

### Team coordination, named reviewers, own profile (2026-08-06)

Client batch: some members need to add people to projects and see who is doing what, tasks need to
be sendable to a chosen reviewer, and everyone needs their own profile page. **Migration 096 was
applied 2026-08-06** (see the entry at the top of this file) — `/tasks` and the team-member card
both send `review_requested_to`, so this code must not deploy ahead of it. It no longer can.

`tsc` clean, `eslint` clean on all touched files, `npm run build` passes.

- **`team:coordinate` (096) opens a redacted `/team`.** Reuses the existing page rather than adding
  a route, per the owner's call. The redaction is in the **queries**, not the markup: a coordinator's
  `users` select omits `salary_inr` / `phone` / `experience_years` entirely, and the attendance,
  tag and site-check-in queries stay behind `team:create_user`. Hiding those in the client would
  still have shipped them over the wire.
  - Hidden for a coordinator: pay, KPI score / grade / leaderboard, attendance, leave approvals,
    invite form, per-row edit-remove menu, Access Matrix link, and the "Full profile" link (that
    page renders salary). Shown: members, active-task counts, the detail modal's task list, the
    project-assignment panel, and the review queue if they hold `tasks:assign`.
  - `member_tasks` **is** queried for a coordinator — who-is-on-what is the point — but without
    `review_status`, a KPI input belonging to the half they cannot see.
  - No grants were made. Grant `team:coordinate` per user in the Access Matrix after applying 096.
    It groups itself under "Team Management" there automatically (groups derive from `CAPABILITIES`).
- **Nav defs gained a `capability` field.** `team:coordinate` is deliberately conferred by no tag,
  so the existing role/tag gating would have left a coordinator with a page they could open and no
  link to reach it. `layout.tsx` resolves nav capabilities once and passes the held set to `TopBar`.
- **Named reviewers.** The submit-for-review confirmation now carries a "Send to" picker on both
  surfaces (`/tasks`, team-member `TasksCard`), backed by `GET /api/member-tasks/reviewers` —
  everyone holding `tasks:assign`, minus self. That route reads through the **service client**:
  `user_capabilities` RLS shows a plain member only their own rows, so the caller's client would
  return an empty pool for everyone but the owner. It returns names only, scoped to the caller's
  own tenant.
  - The review queue is now filtered by addressee. Named tasks go to that person alone; unnamed ones
    keep the old routing (assigner, or any owner for self-set work) so nothing reviewable before
    this batch became stranded.
  - `ConfirmDialog` gained an optional `children` slot to host the picker.
- **Assign-task modal gained a project select** (the POST route already accepted `project_id`).
  Naming a project routes the finished task through review per 095.
- **"Add to a project" panel** on `/team`, gated on the pre-existing `team:assign_to_project`;
  posts to the existing `POST /api/projects/[id]/assignments`. No new API surface.
- **Own profile.** `/team/[memberId]` now lets a caller read **their own** row without
  `office_attendance:view_all` — every query there is already filtered to `memberId` and RLS scopes
  each independently. `/me` is a thin redirect to it, in the nav for team members and site
  engineers. The owner is still bounced to `/team`: that page has no owner metrics.
- **Live worked-hours after check-in.** `accumulated_minutes` (068) only advances on check-**out**,
  so an open cycle displayed as nothing. `AttendanceCard` now samples the clock in a 30s timer
  (never during render — impure, and it would break hydration) and adds the open cycle to the stored
  total, labelled "Working". Display only; the cleanup zeroes it on check-out so the server's
  recomputed total is never double-counted.
- **"Due today" is no longer "overdue".** `new Date("2026-08-06")` parses as midnight **UTC**, so a
  task due today compared as already past at any hour. New shared `dueState()` / `dueSuffix()` in
  `lib/tasks/confirm-copy.ts` closes the day at its last local second — matching 084, which treats
  `completed_at::date <= due_date` as on time. Applied in `/tasks` (both card and table) and
  `MemberDetailModal`, which had the correct logic inline and now shares it.
- **The task card names its assigner.** The bug was in the page, not the card: `/tasks` fetched the
  member list **only when `canAssign`**, so a plain member's lookup was empty and the card rendered
  a bare "Assigned" with no name. Now fetched for everyone (id / name / role, tenant-scoped by RLS).
  The team-member `TasksCard` gained the same line plus a due-date state.

**Not done / known:**
- [x] **096 applied 2026-08-06.** The guard clause now has a behavioural test (run ad-hoc in a
      rolled-back transaction, not committed to `supabase/tests/` — the no-Docker pgtap gap stands
      for the routing overload, which was smoke-tested only).
- [ ] `lib/supabase/types.ts` was **not** regenerated for `review_requested_to`; the task routes
      already cast through `any`, so it type-checks, but the drift noted in earlier batches grows.
- [ ] A coordinator's member rows still call the same `memberScore()` path; it just scores from
      empty inputs. Harmless (the grade is not rendered for them) but the computation is dead work.

(Previous: 2026-08-05 — site engineer bridge access + audit page removal shipped; 095 applied)

### Shipped to production (2026-08-05)

Commit `2eb4f58` pushed to both remotes; Vercel deployed from `client`. Migration 095 was applied
first — `/tasks` selects `member_tasks.project_id`, so deploying ahead of the migration would have
500'd that page for every user.

- **Bridge is tenant-wide for every role.** Was assignment-scoped for non-owners, but 089 had
  already granted `project:view_all` to all non-owners, so the old filter was a UI restriction
  narrower than RLS. Migration 094 pairs the widened dropdown with tenant-wide
  `bridge:read`/`bridge:write` for site engineers — without it an SE could pick a project and get an
  empty thread with no error.
- **Completed projects are now hidden from Bridge** alongside cancelled ones. Their `bridge_messages`
  rows are untouched, but there is no UI path back to a completed project's thread — owner included.
  Flagged in review, shipped deliberately; revisit if anyone needs handover history.
- **Site engineers get `/site` in the nav and a sign-out control** on desktop and mobile. They
  previously had no way to log out.
- **Audit page and its API routes deleted.** `audit_log`, `audit_trigger`, the hash chain and the
  075 insert-time cap are untouched and still recording — UI only. `audit_log:view`/`audit_log:export`
  stay declared, so the Access Matrix still shows an "Audit Log" toggle that currently gates nothing.
  Known and intentional: keeps the page restorable without a capability migration.
- **Empty range-scoped cards on member detail** offer to widen to the full year instead of dead-ending.

### Task project links + self-task review + update images (2026-08-04)

Client batch: tasks name a project, self-set tasks get reviewed, the tick asks first, project-linked
tasks show in the project stream, and update authors can attach photos. `tsc` clean, `eslint` clean
on all touched files, `npm run build` passes.

**Migration 095 was APPLIED 2026-08-05** (see SCHEMA.md). It ran clean against production and the
column, index and RLS policy were each verified afterwards. Applied directly over `DATABASE_URL`
rather than the Supabase CLI — `supabase db push` would have replayed 094 as well, which was
already applied. The trigger and RLS swap still have no *execution* test (no Docker, locked
decision) — they were verified structurally, not behaviourally, so the review/revision loop is
worth watching on first real use.

- **`member_tasks.project_id`** (nullable) on both task pickers. Q: pickers list **all** active
  tenant projects, not just the author's assignments — members hold `project:view_all` (089), so a
  plain RLS-scoped `projects` query is already tenant-correct.
  - Cross-tenant hole closed in both `/api/member-tasks` POST and `[id]` PATCH: `member_tasks` RLS
    keys on `user_id` alone and says nothing about `project_id`, so a foreign project UUID would
    otherwise have been written straight in. Both routes now verify the project first.
- **Self-set tasks are reviewable** (095 RLS). A project-linked task's tick submits for review
  instead of closing; an unlinked personal todo still closes in one tap. Sending back as
  `revision`/`error` returns it to the member, who can re-submit — only `clean` closes it.
- **Confirmation on the check-mark**, both surfaces (`/tasks`, team-member `TasksCard`), both
  directions, context-aware copy from `lib/tasks/confirm-copy.ts` ("Submit for review?" /
  "Mark complete?" / "Mark incomplete?").
  - `/tasks` already had a fully-built "Is the task complete?" modal whose only trigger was the
    assigned-task Check button; `confirmId` state existed but no self-set path ever set it. Reused
    and widened rather than replaced — it shows live time-logged, which the generic dialog does not.
- **Completed project-linked tasks appear in the project stream**, merged at read time in both
  `/api/projects/[id]/updates` GET and `projects/[id]/page.tsx`. Nothing is written to `updates`, so
  a task keeps exactly one home row. Read-only in the feed (no edit/delete menu).
  - Read through the **service client**, because `member_tasks` RLS shows a plain member only their
    own rows (tenant-wide reads need `daily_tasks:view_all`, which only the `project_manager` tag
    carries) — the caller's client would have given every viewer a different, mostly-empty feed.
    Granting that capability broadly would have exposed every member's private todos app-wide.
  - The API route re-checks project access explicitly (`progress:view` OR an assignment row) before
    the elevated read. An empty `updates` result is **not** an access check: `updates_select` (021)
    returns zero rows both for no-access and for a project with no updates yet.
- **Images on updates** — `+` on `AddUpdateCard`, max 3, compressed client-side to WebP
  (`lib/images/compress.ts`, 2048px long edge, quality 0.9 — high enough that a drawing or site
  detail still reads when zoomed). HEIC is passed through untouched: Safari decodes it to canvas,
  Chrome/Android do not, and the upload route already accepts it. Images-only updates are allowed
  (`updates.body` is nullable and the POST schema already had `body` optional).
  - `kind` stays role-derived per the existing route (site_engineer → `site_image`, else `drawing`),
    so `prunePrivateMedia`'s 15-newest-per-kind behaviour is unchanged.
- **`lib/supabase/types.ts`** — `member_tasks` was missing **all** of 083's lifecycle columns, not
  just 095's `project_id` (the pre-existing gap already flagged in this file). Hand-patched Row /
  Insert / Update with the full set plus the `project_id` FK relationship.

**Not done / known:**
- 095 unapplied (above). No pgtap test was written for the new trigger branch or the RLS swap.
- The project stream merge is duplicated in two places (`page.tsx` re-queries rather than calling
  the API route) because that duplication already existed for `updates`; not refactored.
- The two pickers deliberately differ in scope: the **task** picker lists all active tenant
  projects (a task only *names* its project), while the **update composer** lists the member's
  assigned projects only (posting writes to the project, and the image upload route requires a
  `project_assignments` row — a wider list would 403 mid-post).


### SE navigation + dead-end empty states (2026-08-04)

Items 1 and 4 from the previous batch's "known, not addressed" list. No migration; tsc clean.

**Site engineers can now get back to their dashboard.** The earlier note said an SE off `/site` had
"no nav" — that was not quite right, and the real shape mattered for the fix. `layout.tsx` skips
chrome **only** on `/site`, so an SE on `/projects/[id]` or `/bridge` does render `TopBar` +
`MobileNav`. The problem was the nav's *contents*: neither `ALL_NAV_DEFS` (layout) nor `ALL_NAV`
(TopBar) had a `/site` entry, so the SE's own dashboard was the one screen unreachable from the nav.
The two routes an SE reaches from the dashboard (`SiteEngineerDashboard.tsx` pushes to
`/projects/[id]` for the Details tab and `/bridge` for the Bridge tab) were therefore one-way doors.
- Added `{ href: "/site", label: "My Site", roles: ["site_engineer"] }` as the first entry in both
  nav arrays, with a map-pin icon (`TopBar` uses stroke SVG, `MobileNav` needs a fill path in
  `ICON_FILL` — an unmapped href silently falls back to the settings gear, so `/site` was added
  there too).
- **`Overview` is now `roles: ["owner", "team_member"]`.** `app/(app)/page.tsx:437` redirects
  site engineers straight back to `/site`, so for an SE that nav item was a mislabelled second door
  to the same screen. Hiding it leaves exactly one obvious way home.

**7 dead-end empty states given a next step** (`team/[memberId]/MemberDetailClient.tsx`). New local
`EmptyState` component (message + optional action, rendered as a `Link` when `href` is given or a
`button` when `onAction` is) plus an `.emptyAction` class in `member-detail.module.css`.
- Five are **range-scoped** ("…in range") — the honest next step is widening the filter, not
  creating data, since the range pills sit in the page header far from the card. `AttendanceCard`,
  `TasksCard`, `PerformanceCard`, `SiteHoursCard` and `CheckInsCard` now take `range` + `onWiden`
  and offer **"Look at the full year"**, which calls `widenRange()` (sets range to `year` and
  refetches). The action is omitted when already at `year`, so it never offers a no-op.
- Two are not range-scoped and link instead: `ProjectsCard` → "Assign from a project" (`/projects`),
  `BroadcastsCard` → "Send a broadcast" (`/team`).

**Migrations: nothing pending.** Verified against the live `_migrations` table — 96 applied, 96 on
disk. 094's effect re-confirmed live (4/4 active site engineers hold `bridge:read` + `bridge:write`),
since a migration can be recorded as applied and still have been the failing first version.

**Still open from the previous batch** (items 2 and 3, untouched):
- [ ] `/broadcasts`, `/updates`, `/performance` are in no nav; `/settings/payment-presets` is
      linked from nowhere.
- [ ] 6 dead components, never imported: `AppNav.tsx`, `team/AttendanceOverview.tsx`,
      `projects/[id]/CustomerPortalCard.tsx`, `TeamSection.tsx`, `SiteChecklistCard.tsx`,
      `ProjectDetailClient.tsx`.
- [ ] The 6 remaining dead-end empty states outside `MemberDetailClient.tsx` were not swept.

### Usability batch — client "confusing to use" report (2026-08-04)

### Usability batch — client "confusing to use" report (2026-08-04)

Four fixes from a client message reporting confusion and disconnected parts. **Migration 094
APPLIED to cloud Supabase.** tsc clean.

**Site engineers had no way to log out.** `app/(app)/layout.tsx` treats `/site` as a self-contained
view and skips `TopBar` + `MobileNav` entirely, and neither SE component carried a sign-out control
— so a site engineer who logged in could not log out from any screen. Added a sign-out button to
both `DesktopSiteEngineer.tsx` (sticky header, beside the stage Chip) and `MobileSiteEngineer.tsx`
(top bar, beside the project select; the select is now wrapped in a flex container so the chevron
overlay still anchors correctly). Both use `<form action={signOut}>` — the same server-action
pattern as `MobileHome.tsx`.

**Bridge showed only assigned projects (094).** `bridge/page.tsx` branched on `role === "owner"`:
the owner saw all projects, everyone else queried `project_assignments`. Migration 089 had already
granted `project:view_all` to all 19 non-owner members, so the UI was **narrower than the
permission** — the concrete source of "unconnected parts". The role branch is gone; every role now
gets the same query (all non-completed, non-cancelled tenant projects, ~56 rows).
- **The dropdown alone was not enough.** `bridge_select` (021) gates message reads on
  `has_capability('bridge:read', project_id) OR is_assigned_to_project()`. Verified live before
  changing anything: all 14 team members held `bridge:read` tenant-wide, but **0 of 4 site
  engineers did**. Widening only the dropdown would have shown SEs every project and then returned
  a silent empty thread on any unassigned one — worse than the restriction it replaced. 094 grants
  `bridge:read` + `bridge:write` tenant-wide to the 4 site engineers (`source='manual'`, so the
  owner can revoke per user in the Access Matrix); `SITE_ENGINEER_CAPABILITIES` gains both so new
  SEs inherit them. Verified after apply: 4/4 site engineers now hold `bridge:read`.
- `user_capabilities.tenant_id` is NOT NULL with **no BEFORE INSERT trigger on that table** — the
  first version of 094 failed on the not-null constraint. `tenant_id` is taken from the target
  user's own row. Worth remembering for any future capability-granting migration.
- Empty-state string changed "No projects assigned." → "No active projects.", which is now the only
  case that can produce it.

**Audit page removed for all users.** Deleted `app/(app)/audit/` (page + AuditClient),
`app/api/audit/` (route + export) and `lib/audit/summarize.ts`; removed the nav entries from
`layout.tsx`, `TopBar.tsx` and `MobileNav.tsx`, and dropped `/audit` from `STATIC_PREFIXES` in
`RealtimeRefresher.tsx`. Nav removal alone was not enough — the route stayed reachable by typing
the URL, so the files went too.
- **The DB side is untouched by design.** `audit_log`, `audit_trigger()` and the hash chain still
  record every write; only the UI for reading it is gone. Invariant #3 (append-only) still holds.
- `audit_log:view` / `audit_log:export` capability strings are **deliberately kept** in
  `lib/auth/capabilities.ts` so the page can be re-exposed later without a migration. They are
  currently orphaned (nothing checks them). Their Access Matrix labels are also kept — groups are
  derived from `CAPABILITIES`, so deleting the label would render an unlabelled card, not hide it.

**Known, not addressed in this batch** (from a full read-only sweep of the app):
- [ ] Site engineers still have **no navigation off `/site`**. Sign-out works now, but if an SE
      lands on `/projects/[id]` there is no route back — `layout.tsx` renders no nav for them.
- [ ] `/broadcasts`, `/updates`, `/performance` are in **no nav** — reachable only via cards on the
      owner home or a corner button on `/team`. `/settings/payment-presets` is linked from nowhere.
- [ ] **6 dead components**, never imported: `AppNav.tsx` (carries its own unused logout),
      `team/AttendanceOverview.tsx`, `projects/[id]/CustomerPortalCard.tsx`, `TeamSection.tsx`,
      `SiteChecklistCard.tsx`, `ProjectDetailClient.tsx`. Pre-existing — flagged, not deleted.
- [ ] **13 dead-end empty states** with no call to action (`MemberDetailClient.tsx` has 7 alone).

### Client change-request batch (2026-08-02)

Sixteen requests from the client, delivered in four passes. **Migrations 088–093 APPLIED to cloud
Supabase**; `lib/supabase/types.ts` hand-patched (no Docker for `supabase gen types`). tsc clean.

Client-facing summary of this batch lives in `WHATS-NEW.md` (plain language, no jargon).

**Data fix.** Usha S's login email corrected `s.usha1086@` → `s.usha1068@` in **both**
`auth.users` and `auth.identities` (identity_data carries a duplicate copy — updating only
auth.users leaves a stale address behind). `scripts/seed-users.ts` corrected so a re-run cannot
reintroduce it.

**Passwords.** Minimum lowered to **6** characters. It was inconsistent before: 12 in settings, 8 in
the invite form, the invite API zod schema, the accept form and `setPassword`. All five now agree.
Note the Supabase project's own auth minimum still applies server-side — if it is set above 6, the
dashboard is the place to change it.

**Geofence instead of raw lat/lng.** New `lib/geo/mapsUrl.ts` (`parseMapsUrl`) + shared
`components/geo/GeofencePicker.tsx`: paste a Google Maps link, coordinates fill in, radius picked
from 100m/200m/500m/1km. Wired into New Project, Edit Project, and Settings → Workspace (office).
Columns already existed (010) — no migration. The parser prefers the `!3d!4d` marker over the `@`
map centre, decodes percent-encoding first, and reports short `maps.app.goo.gl` links explicitly
(they carry no coordinates until redirected).

**Projects search.** Name / project type / assigned member, composed with the existing filters.

**Attendance domain (088).** Leave requests + balance, overtime past the workday end, late marking,
configurable office hours. Members get a Leave card (request, withdraw, see pending) and a
"Who's in today" presence board; owners get an approval queue on /team and OT tiles on the member
detail page. See SCHEMA.md 088 for the self-approval guard and why overtime is trigger-derived.

**Project categories (089).** All 19 non-owner members were granted `project:view_all`, so everyone
now sees every project. Owners can narrow a member to specific project types in the Access Matrix;
**clearing the selection restores full access** (no rows = unrestricted).

**Editable KPI (090).** `kpi_settings` per tenant, edited under Settings → Performance scoring.
Weights must total 100%. Default weights reproduce the old hardcoded scores exactly — verified live:
a sample row scored 66.80 before and after, and moved to 78.80 only once weights were changed.

**Client feedback (091).** Rating + comment under each **completed** milestone in the customer
portal, submitted through a SECURITY DEFINER function that re-derives the customer from the portal
hash. Optionally feeds the KPI as a fourth pillar (off by default).

**Voice broadcasts (091).** 60-second cap enforced in the browser, in the API, and by a DB CHECK.
Audio in `media-private`, played back through a short-lived signed URL; the signing route refuses
paths outside the caller's own tenant prefix.

**Drawing roles (091).** Members tag a task as design / detail / technical / checked from the Tasks
card; `v_drawing_role_monthly` gives the monthly split.

**Review finding, fixed in-session (092).** 088's `REVOKE UPDATE (overtime_minutes, is_late,
workday_end_snapshot) FROM authenticated` was a no-op: a pre-existing table-level UPDATE grant
covers all columns, and a column-level REVOKE does not subtract from it. Not exploitable — the
BEFORE trigger recomputes those values regardless, proven by writing 9999 and reading back the
recomputed figure — but the documented second layer did not exist. 092 revokes table-wide UPDATE
and re-grants the 13 columns the app actually writes. Check-in/check-out verified still functional.

**Multi-office attendance (093).** The studio works out of more than one office (Mysore,
Bangalore), so the single `tenants.office_lat/lng` pair no longer fits. New `offices` table, one
row per office, managed under Settings → Office locations. Check-in resolves the office **by GPS**
— nearest active office whose own radius contains the member — rather than letting them pick from
a list. No match is recorded as remote/on-site, not rejected. `attendance_logs` gains
`check_in_office_id` / `check_out_office_id`; both had to be added to 092's column-grant list or
check-in would 403. Offices are retired (`is_active=false`), never deleted, so attendance history
survives an office closing. The `tenants.office_*` columns are deprecated but left in place — 069
still writes them. Verified live: two offices ~140km apart resolve independently, out-of-range
returns no match, a plain member is blocked from writing an office but can still read the list,
and the 092 overtime guard still holds.

**Open — needs the founder, not code:**
- [ ] **Confirm the office locations.** The one saved coordinate pair, `12.301284, 77.627762`, is
      ~70 km south of Bangalore — so it is either Mysore or simply wrong, but it cannot be
      Bangalore. 093 carried it into `offices` as **"Main office (confirm location)"**. Add the real
      Mysore and Bangalore offices under Settings → Office locations (paste each Maps link), then
      rename or deactivate the placeholder. Until then, office check-ins record as "not at a
      registered office" and lateness is measured against the wrong place. The check-in *window*
      (09:30–18:00, 15 min grace) is configurable under Settings → Workspace.
- [ ] Decide whether the 6-character password floor should also be lowered in the Supabase
      dashboard's auth settings (it enforces its own minimum independently).
- [ ] `lib/supabase/types.ts` `member_tasks` was already missing the 083 lifecycle columns before
      this batch (`status`, `tag`, `review_status`, …). Pre-existing drift, not introduced here —
      worth a real `supabase gen types` run once Docker is available.


### Completed projects — lifecycle milestones backfilled + marked complete (2026-07-20)

For every `status='completed'` project, ensured the **"Standard Architectural Lifecycle"** milestone set (system `checkpoint_templates`, 8 items) exists and marked all milestones complete. `scripts/complete_lifecycle_for_completed.py` (Python + psycopg2, dry-run + `--commit`). Backup: `backups/checkpoints_completed_backup_20260720_114039.json` (8 rows — the only pre-existing checkpoints on completed projects).

**Applied to cloud Supabase 2026-07-20. Data only — no schema change.**
- **91** completed projects had 0 checkpoints → applied the template via `apply_checkpoint_template(project, template, project.start_date)` RPC. **1** (`jevvan-40-35-vijaynagar-4th-stage`) already had 8 → kept them, no duplicate set.
- Marked **736 milestones** (92×8) complete: `started_at = completed_at = approved_at = project.start_date` (the historical MONTH-YEAR), `completion_percentage=100`, `approved_by = owner (Nayan Kumar H.T., b58964be…)`.
- **Trigger-safe**: `enforce_checkpoint_progression()` (043) is BEFORE UPDATE and requires sequential completion, so the script UPDATEs each project's checkpoints in `sequence_order` (1→8), committing per project — the audit trigger stays intact (no `session_replication_role` bypass). The `"FInish"` typo in template item 8 was applied as-is (existing system preset, not silently corrected).
- **Verified**: all 92 completed projects have exactly 8 milestones, all `complete` (view `v_project_checkpoint_status`), 0 pending. Non-completed projects' 152 checkpoints untouched.

### Derived customers, linked 1:1 to projects (2026-07-20)

### Derived customers, linked 1:1 to projects (2026-07-20)

The client workbook has **no customer contact fields** (only project names — see the load entry below). Per owner decision, created one `customers` row per project from the (cleaned, Title-cased) project name and set `projects.customer_id` to link them. `scripts/derive_customers.py` (Python + psycopg2, dry-run + `--commit`). Backups: `backups/customers_backup_20260720_112804.json` (1 row), `backups/projects_backup_20260720_112804.json` (148 rows).

**Applied to cloud Supabase 2026-07-20. Data only — no schema change.**
- Created **147 customers**, linked **147 projects** (only projects with `customer_id IS NULL` — the pre-existing NIHARIKA→"Niharika" link was left untouched). Post-load: **148 customers, all 148 live projects linked 1:1** (0 unlinked, 0 orphan customers, no customer on >1 project).
- **`phone` / `email` / `address` are NULL** — the source had none. Fill in when contact details arrive.
- Caveat: some project "names" are institutions/buildings, not people (e.g. "M.G.R Restaurant", "Darwad-Park Development", "Sunil-Convention", "Rainbow Clinic", "Sangeetha School"). These became stand-in customer rows named after the project — rename/merge as real contacts are collected. Script is idempotent (re-run only affects still-unlinked projects).

### Client data load — PROJECTS-UPTO-DATE.xlsx (2026-07-20)

### Client data load — PROJECTS-UPTO-DATE.xlsx (2026-07-20)

Client sent an updated portfolio workbook (`PROJECTS-UPTO-DATE.xlsx`, 2 sheets). Reconciled against the 45 live projects (from the original `PROJECTS.xlsx`) and loaded via `scripts/import_projects_upto_date.py` (Python + psycopg2; node_modules not installed in this checkout — dry-run + `--commit` gated). Backup of the pre-load `projects` table: `backups/projects_backup_20260720_112250.json` (45 rows).

**Applied to cloud Supabase 2026-07-20. Data only — no schema change.**
- **`running ` sheet (42 rows)** → 30 UPDATEs (enriched existing live projects with `project_type` + `start_date` from Year; upgraded `design→execution` where the sheet showed construction; only filled NULLs) + 11 INSERTs as new `status=active`. Spelling variants folded to existing projects via `RUNNING_CANON` (e.g. `mgr restorent→M.G.R RESTAURANT`, `satyanarayan→SATHYANARAYAN`, `dr. sunil→SUNIL-CONVENTION`, `rehaman→REHMAN`, `santhose thotappa→SANTHOSH`).
- **`completed` sheet (92 historical rows, 2018–2024)** → INSERTed as `status=completed`, `current_stage=execution`, `site_location = LOCATION · SITE-MEASUREMENT`, `start_date = MONTH-YEAR`. The 2 shifted/junk rows at the sheet tail (`vishal flat int`, `harsha` with no valid month-year) were excluded. 4 dropout-flagged rows loaded as completed (SUNIL BRICK, IRFAN, RUCHI KRS BACK WATERS, SHRAVYA).
- **Name-collision safety**: 6 completed rows share a name with a LIVE active project (RANJITH, LOKESH, MOHAN, HARSHA, SANDEEP, VIJAY RAMEGOWDA) — inserted with suffixed slugs (`mohan-2`, …). Verified: the live rows kept their status/stage; **no live project overwritten**.
- **Post-load**: 148 live projects (56 active + 92 completed), 0 duplicate slugs.

**Flagged for owner to verify (loaded as separate rows, NOT merged — could be a duplicate/new phase of an existing project):** `lakshman vijanagar 3rd stage` (vs LAKSHMAN- VIJAYANAGAR), `sandeep layout` (vs SANDEEP LAYOUT- TADAHALLI), `darwad hotel` / `darwad coproration` (vs the Darwad commercial/record-room projects), `kabini clubhose` (vs RAMESH KABINI FARM). To merge one: soft-delete the extra row, or re-slug — the intent was to avoid silently guessing.

_Note: the workbook carries a `fee` column (all null) and per-discipline progress phrases (`Aarc.design/int.design/ext`) not mapped to columns — no home in the current `projects` schema. Not loaded. Customer/enquiry/payment data is still absent (sheet has none); those tables remain empty as before._

### Realtime cost reduction (2026-06-21) — prior entry below
(Updated: 2026-06-21 — Realtime per-route subscription scoping + notification sub dedup)

### Realtime cost reduction (2026-06-21)

Triggered by `pg_stat_statements` analysis: `realtime.list_changes` was ~80% of total DB time (282k calls) — driven by every connected client subscribing to all 18 published content tables regardless of route.

**Built:**
- **`RealtimeRefresher` now scopes subscriptions per route.** Reads `usePathname()` and subscribes only to the published tables the current route actually renders (map derived from each page's `.from()` calls). Re-subscribes on navigation. Routes with no published content (`/audit`, `/performance`, `/settings`) subscribe to nothing; unmapped routes fall back to all tables so none silently lose live updates. Cuts WAL work per connected client.
- **Removed `notification_recipients` from `RealtimeRefresher`** — `NotificationBell` already has a dedicated subscription for it, so it was double-firing (full `router.refresh()` + bell refetch) on every notification insert. Table stays in publication 071 (the bell still needs it).
- **`NotificationBell` channel name is now stable (`"notif_bell"`)** instead of `Date.now()_random`, so remounts reuse one channel instead of accumulating `realtime.subscription` rows.
- No schema/migration change (publication 071 unchanged). tsc clean.

**Pending / flagged (not yet investigated):**
- [ ] `generate_personal_reminder_notifications()` cron cadence — 11.5k calls in the stats window; confirm the schedule isn't over-firing.
- [ ] `UPDATE tenants SET updated_at = now()` averaging 92ms on a single-row PK update — likely lock/trigger contention; investigate concurrent writers / AFTER UPDATE triggers on `tenants`.

### Hardening batch — request_id, rate limiting, pooler (2026-06-19)

### Hardening batch — request_id, rate limiting, pooler (2026-06-19)

**Built:**
- **Audit `request_id` now actually populated on the general (authed) write path.** Root cause: `lib/auth/middleware.ts` set `x-request-id` only on the **response** headers, and `lib/supabase/server.ts` passed no `global.headers` to PostgREST — so the audit trigger's `current_setting('request.headers')->>'x-request-id'` was **always null** for authenticated writes. Fix: middleware now sets `x-request-id` on the forwarded **request** headers (same mechanism as `x-pathname`); `server.ts` reads it via `headers()` and forwards it to PostgREST through `global.headers`, so the trigger captures it. `/api/public/enquiry/[slug]` is excluded from middleware → now self-generates the id via `uuidv4()` instead of relying on an absent header.
- **Rate limiting on login + MFA-verify + invite** (portal/enquiry were already covered by 025/030). New migration **079** (APPLIED to cloud Supabase 2026-06-19; function verified live) `check_auth_rate_limit()` SECURITY DEFINER wrapper over existing `public_rate_limit_hit()` + `public_abuse_log`; granted to `anon, authenticated`. New `lib/auth/rateLimit.ts` (`clientIp()`, `checkRateLimit()` — fails open). Login + MFA-verify server actions: 10 / 5 min per IP. `/api/invite`: 20 / hour per user (429). Hand-patched `check_auth_rate_limit` into `lib/supabase/types.ts` Functions block.
- **Transaction-pooler verification harness** — new `scripts/pooler-check.ts` (uses existing `pg` dep, no new deps): confirms transaction-mode (port 6543) and runs a concurrent short-transaction probe reporting success/fail, distinct backend PIDs (multiplexing evidence), and p50/p95/max latency. Run before onboarding tenant #3.
- tsc clean across all changes.

**Pending:**
- [ ] **Run the pooler load test before tenant #3** against the prod transaction-mode URI: `POOLER_URL="...:6543/postgres" CONCURRENCY=50 npx tsx scripts/pooler-check.ts` — needs prod creds + an agreed concurrency target; decide acceptable p95 + concurrency that maps to 3 tenants.

### Security audit pass (2026-06-19)
Triggered by Transcripts.md (OWASP/IDOR/dependency/CI guidance). Findings + fixes:
- **CRITICAL — cross-tenant IDOR, `/api/team/[memberId]` (PATCH+DELETE):** used service-role client (RLS bypassed) to mutate a target user by id with no tenant check. Owner in tenant A could edit/permanently-ban a tenant B member. **Fixed** — derive caller tenant from session, require `target.tenant_id === caller.tenant_id`.
- **HIGH — cross-tenant IDOR, `team_member_tags`:** RLS `owner_manage_tags` policy lacked a tenant predicate; API didn't filter tenant. **Fixed** — migration `078_team_member_tags_tenant_isolation.sql` adds tenant predicate to USING/WITH CHECK; API (`app/api/team-member-tags/route.ts`) filters by caller tenant.
- **Dependencies:** `npm audit` 8 → 2 vulns via non-breaking `npm audit fix` (cleared `ws` high, `qs`). Remaining 2 (postcss XSS + transitive) need `--force` → next@16.2.9 (major) — deferred, decide separately.
- **CI added:** `.github/workflows/security.yml` (npm audit high-fail + TruffleHog secret scan), `.github/workflows/codeql.yml` (CodeQL security-extended), `.github/dependabot.yml` (weekly npm + actions).
- **Audited all 18 service-role routes + 86 API routes.** Remaining service-role routes safe: project-scoped `has_capability(p_project_id)` or an authenticated/RLS read gates the row before the service write. Two unauthenticated routes (`auth/callback`, `public/enquiry/[slug]`) intentional. tenant_id is correctly session-derived everywhere else (never trusted from request body).

### Manage-UX polish + 30-day employee purge (2026-06-19)

**Built:**
- **Members card edit-mode toggle** — per-row pencil (`MemberManageMenu`) is now hidden until a **top pencil** in the Members card title is clicked. New client `MemberEditModeProvider` (`team/MemberEditMode.tsx`) renders the card title + a toggle pencil (shown only when `canManage`) and exposes `useMemberEditMode()` via context; `MemberManageMenu` returns `null` unless edit mode is on (stays mounted while a modal is open). `team/page.tsx` Members card body wrapped in the provider; the access-matrix corner link moved into the provider's `cornerSlot`.
- **Customer delete moved under the pencil** — `customers/page.tsx` detail header no longer shows a standalone trash button; the pencil is now a small menu (outside-click/Esc close) with **Edit details** + **Delete customer**.
- **Delete phrase is case-insensitive** — both `MemberManageMenu` and the customer `DeleteCustomerModal` compare `phrase.trim().toLowerCase() === "delete-employee-data"`, so typing `DELETE-EMPLOYEE-DATA` works (was an exact-case match that left the confirm button disabled — the "not working" report).
- **30-day DB purge** — migration **077** (APPLIED to cloud Supabase 2026-06-19; cron job + function verified live): `purge_removed_employees()` + daily pg_cron `removed-employee-purge` (04:00 UTC) anonymize then attempt full delete of members soft-deleted >30 days. See SCHEMA.md migration 077.
- tsc clean; `next build` clean (still needs `NODE_OPTIONS=--max-old-space-size=6144` locally).

### Broadcast dropdowns, audit dropdowns, team/customer manage (2026-06-19)

**Built:**
- **Broadcast compose redesign** (`team/BroadcastsPanel.tsx`) — the long recipient pill row is replaced by a **multi-select names dropdown** (checkbox list, "Select all"/"Clear all", outside-click/Esc close) alongside the existing **project dropdown** (picking a project preselects its assigned members). Typed broadcast text, the project `<select>`, and the names dropdown are now **black (`#000`)** per request.
- **Broadcast card on phones** — `MobileHome.tsx` now renders a Broadcasts card at the **bottom of the owner overview** (after Team). New optional props (`broadcasts`, `broadcastTeamMembers`, `broadcastProjects`, `canBroadcast`, `currentUserId`, `nowMs`); team-member MobileHome omits them (no card). `page.tsx` owner branch now fetches `project_assignments` (gated by `canBroadcast`), builds `broadcastProjects`, and passes them to **both** the desktop and mobile BroadcastsPanel (desktop overview card previously had no project dropdown — now it does too).
- **Audit filters → dropdowns** (`audit/AuditClient.tsx`) — Actor and Action chip rows replaced by `<select>` dropdowns (all actors / all actions); removed the now-unused `FilterChip` component; added `selectStyle`.
- **Finance expenses dropdown phone cutoff** — `ProjectExpensesPicker.tsx` panel gains `maxWidth: calc(100vw - 24px)` so it never overflows the right edge outside the ≤767px `.dropdown-mobile-safe` window (which still pins it left/right:12px).
- **Team member edit/delete** — `team/page.tsx` rows (non-owner, not self, `canManage`) get a pencil **`MemberManageMenu`** (new client component): Edit details modal (full_name, role_label, phone, experience_years, salary_inr) + "Remove access" modal requiring the typed phrase **`delete-employee-data`**. New `PATCH /api/team/[memberId]` (`team:edit_user`) and `DELETE` (`team:deactivate_user`): DELETE soft-deletes (`deleted_at`, `is_active=false`), deletes `user_capabilities`, and bans the auth user (876000h) to revoke sessions — all via **service client**; owner/self guarded. Members query now selects `phone, experience_years, salary_inr`.
- **Customer edit/delete** — `customers/page.tsx` detail header gains pencil (Edit) + trash (Delete) icon buttons. `EditCustomerModal` (PATCHes existing route). `DeleteCustomerModal` requires the same `delete-employee-data` phrase; blocks deletion when projects are linked. New `DELETE /api/customers/[id]` — `customer:view` gated, **service client** (authenticated has no DELETE grant), 409 when linked projects exist or on FK violation (`23503`).
- No DB/schema change. tsc clean; `next build` clean (needs `NODE_OPTIONS=--max-old-space-size=6144` locally — default heap OOMs the build worker, unrelated to these changes).

### Mobile CSS fixes + PWA icon swap (2026-06-19)

**Built:**
- **PWA theme = black (unchanged from original)** — `manifest.ts` `background_color`/`theme_color` + `viewport.themeColor` stay `#000000`. (A gray `#B8B8B8` theme + gray in-app bg was tried then reverted per request — splash looked bad.) In-app page background is back to the original paper radial-gradient (`globals.css` `body` + `:root`).
- **App icon = diamond mark on paper gradient, iPhone-style rounded** — all `public/icon-*`/`apple-icon`/`favicon-32`/`badge-72` PNGs regenerated from the trimmed `Tare-Logo-01.png` (yellow diamond) centered on the paper radial-gradient (mirrors `globals.css` body: `#F3EFE7` + green/cream radials). `any`-purpose icons (192/512/apple-source/favicon/badge) get a rounded-rect squircle mask (~22% radius) via `blend:'dest-in'`. **`apple-icon.png` is full-bleed square** (iOS applies its own squircle — don't pre-round). **`icon-maskable-512.png` is full-bleed square** (Android OS masks it; smaller logo frac for safe zone). Splash `background_color`/`theme_color` + `viewport.themeColor` = `#F3EFE7`; `appleWebApp.statusBarStyle` → `default` (dark icons, legible on light bg). `public/sw.js` `CACHE_VERSION` v3→v7. Source PNGs (`Tare-Logo-01.png`, etc.) live in repo root.
- **`middleware.ts` deleted** — deprecated Next.js convention; conflicted with the canonical `proxy.ts` (Both-files-detected build error). `proxy.ts` is the single session-middleware chokepoint.
- **Mobile modal "overflow at top" fix** — `.modal-mobile-full` (`globals.css`) now adds `padding-top: max(safe-area-inset-top,16px)` (47px floored under `@media (display-mode: standalone)`) + bottom safe-area pad + 20px side pad, so the modal header clears the iOS status bar/notch. Applies to all modals already using the class: EditProjectModal, NewProjectModal, customers, calendar, MilestonesCard, PerformanceClient, EnquiriesClient, PaymentsCard.
- **Mobile dropdown side-cutoff fix** — new `.dropdown-mobile-safe` class pins right-anchored popovers to `left/right:12px` (fixed, `top` = safe-area+56px, `max-height:70dvh`) on phones. Applied to `NotificationBell` panel + finance `ProjectExpensesPicker`. (TeamStreamCard's small pencil menu left as-is — anchors inside its card, no cutoff.)
- No DB/schema change. tsc clean; `next build` clean (pre-existing stray untracked `middleware.ts` conflicts with `proxy.ts` — unrelated, not modified).

### Demo seed v2 — reversible enrichment over the live Tare client (2026-06-11)

**Built:**
- `scripts/seed-demo.ts` — idempotent generator that enriches 9 of the 45 REAL Tare projects in place (customer/type/budget/dates/whatsapp) and attaches full demonstration data using the REAL 20 Tare users as authors/assignees. ~919 rows, all under the `dec0de00-…` UUID namespace. Covers customers, enquiries (+site-visit reminders), checkpoints+items, payment schedule+records, updates (+site images), material plan/consumption (one excess-flagged), expenses (approved/pending/rejected), site check-ins (closed+open+out-of-geofence), drawing register + site execution tables, bridge, calendar, broadcast+recipients, member/daily tasks, personal reminders, attendance (11 team + 4 SE × 5 days), 2 months performance.
- Site-engineer dashboard + team-member attendance explicitly enriched (per request). Customer portal verified (16-char hashes).
- **APPLIED to cloud Supabase 2026-06-11.** Teardown: `supabase/demo_teardown_v2.sql` (manual, kept OUT of migrations/). Generator/teardown both `SET LOCAL session_replication_role = replica` to bypass auth.uid()-based RLS while providing all columns.
- All migrations through 076 confirmed applied (prior 067/068/070 "not yet applied" notes were stale).
- No schema change — data only. See DEMO_VS_PROD.md.

### Site check-out + per-site hours (2026-06-01)

**Built:**
- **Site check-in → check-out** — the site-engineer Today card (Desktop + Mobile) now toggles Check In / Check Out. `POST /api/projects/[id]/checkin` accepts `action: "check_in" | "check_out"` (defaults `check_in`); check-out closes the latest open `site_check_ins` row and records `duration_minutes`. GET now returns `checked_out_at, duration_minutes`. Open session = latest row with `checked_out_at IS NULL`; card shows "since" time + minutes on site today.
- **Office attendance removed for SEs** — `SiteAttendanceCard` deleted; no longer rendered on the site-engineer dashboard (office attendance flow for **team members** is untouched). `site/page.tsx` no longer fetches `attendance_logs`; `todayAttendance` prop removed from `SiteEngineerDashboard` + Desktop/Mobile SE components.
- **Team SE detail — Site Hours card** — `/team/[memberId]` (site engineer) replaces the office Attendance card with a new **Site Hours** card: total hours, days on site, days absent (working days in range − distinct check-in days), per-site hours table. Site Check-Ins rows show in→out + duration. API SE branch fetches `checked_out_at, duration_minutes`.
- **Migration 070** (NOT YET APPLIED) — `site_check_ins.checked_out_at`, `.duration_minutes` + partial unique index `(user_id, project_id) WHERE checked_out_at IS NULL`; backfills pre-existing open check-ins to closed 8h sessions (incl. live demo rows). Types hand-patched.
- **Mobile project-details table** — `@media (max-width:767px)` rule: `executionTable td { white-space: nowrap }` + text inputs `min-width:140px` so row text is fully readable in the horizontal scroller (`project-detail.module.css`).
- Build: tsc clean.

### Mobile UX + SE project-details redirect batch (2026-06-01)

### Mobile UX + SE project-details redirect batch (2026-06-01)

**Built:**
- **SE "Details" → shared owner page** — the site-engineer "Details" tab no longer renders a custom panel; `SiteEngineerDashboard.tsx` intercepts `setTab("details")` and `router.push(/projects/[id])` so SEs see the exact same project detail page as the owner (RLS lets assigned SEs SELECT the project). Removed the now-dead `DetailsTab`/`DetailsScreen` from Desktop/Mobile SE components; reverted the extra `site/page.tsx` query columns + shared `Project` type additions from the prior batch.
- **Overview mobile: finance card → updates card** — `MobileHome.tsx` dark Collections/finance card removed (phones only — desktop overview unchanged); the Updates card now sits in that top slot (old bottom Updates section removed). Dropped unused `fmtLakhs`/`MiniStat`/`financeData` destructure (prop kept in interface).
- **Mobile log-out** — `MobileHome.tsx` top row gains a sign-out icon button (`<form action={signOut}>`, server action from `app/(auth)/actions`) beside the NotificationBell + avatar.
- **Material Plan card mobile** — table wrapped in an `overflow-x:auto` container with `minWidth:360`; add/edit form grid switched to `repeat(auto-fit, minmax(120px,1fr))` so fields stack on phones (`MaterialPlanCard.tsx`).
- **Customers page mobile overflow** — contact-card header now `flex-wrap` with `minWidth:0`; name/email/phone get `overflowWrap:anywhere`; financial-stats grid switched to `repeat(auto-fit, minmax(120px,1fr))` (`customers/page.tsx`).
- **Add Event modal** — rewritten in `CalendarClient.tsx`: flex-column layout, safe-area top padding, click-outside-to-close, responsive date/time grid; added a **Description** textarea (POST already accepted `description`) and an explanatory subtitle under the title (shown on phone + desktop).
- **Team members card** — removed the indigo (blue) tag chips on the right of each member row (tags still shown as text in the meta line; owner still manages via TagsPanel) (`team/page.tsx`).
- **Team Stream scroll** — feed moved to a `.streamFeed` CSS class (max-height 420 desktop / 320 mobile, `overflow-y:auto`, `overscroll-behavior:contain`) so messages scroll within the card (`TeamStreamCard.tsx` + `project-detail.module.css`).
- No DB/schema change. Build: zero errors.

### Team / Site-Engineer / Access Matrix UX batch (2026-06-01)

**Built:**
- **Access Matrix mobile fix** — the per-member "Capabilities" panel orientation was broken on phones because the editor reused the grid `.memberRow`. New flex-based `.accessRow` / `.accessRowControls` / `.accessRowSelect` classes in `team-access.module.css` (+ `@media (max-width:640px)` rules: controls drop to their own full-width line, dropdown + Capabilities button each `flex:1`). `AccessMatrixEditor.tsx` switched to these classes so the capability grid (`flexBasis:100%`) wraps correctly.
- **Team page SE attendance** — site-engineer rows now show Present / Hours / Check-ins (office attendance) + a 4th "Site visits" tile (was only site-check-ins). Owner attendance query was already role-agnostic so SE office attendance was available.
- **Owner metrics removed on team page** — owner's `memberStats` block hidden (`m.role !== "owner"` guard); owner filtered out of the Performance table (`rows.filter(m => m.role !== "owner")`).
- **SE detail page parity** — `/team/[memberId]` for a site engineer now renders Projects + Attendance + Tasks + Site Check-Ins + Broadcasts (was only CheckInsCard). No drawing-centric Performance card (SE have no drawings). Both `app/(app)/team/[memberId]/page.tsx` and `app/api/team/[memberId]/route.ts` SE branches fetch the extra data; `MemberDetailClient.tsx` SE branch renders the cards.
- **Broadcast by project** — owner compose in `BroadcastsPanel.tsx` gains a "Send to a project team…" `<select>` (new optional `projects` prop = `{id,name,memberIds[]}`); picking a project preselects only its assigned members. Team page builds `broadcastProjects` from a new `project_assignments` query (excludes completed projects + self). Overview's BroadcastsPanel usage unaffected (prop defaults to `[]`).
- **SE "Details" tab** — new project-details nav option on the site engineer dashboard (Desktop tab + Mobile bottom-bar `info` icon). Shows status/stage/type/location/dates/budget/checkpoints/geofence + WhatsApp group link. `site/page.tsx` project query extended with `project_type, budget_total, start_date, expected_end_date, whatsapp_group_url` (all existing columns — no migration); shared `Project` type + inline type updated.
- No DB/schema change. Build: zero errors.

### Reversible demo data (2026-06-01)

**Built:**
- `supabase/migrations/069_demo_seed.sql` — full-coverage demonstration data for Tare Design Studio: 6 demo logins (`*@demo.tare` / `demo1234`, real `auth.users`+`auth.identities`), 4 team members (2 tagged: project_manager, accountant) + 2 site engineers, 6 customers, 8 enquiries (full pipeline), 5 projects (mix of scope/status/stage) with assignments, checkpoints+items, payment schedule/records, materials (plan+consumption, one tripping the excess flag), expenses (pending+approved), site check-ins (one out-of-geofence), updates, bridge messages, member/daily tasks, personal reminders, 5 days attendance/user, broadcasts+recipients, 2 months performance. Sets `tenants.office_lat/lng` for the geofence.
- `supabase/demo_teardown.sql` — deletes everything 069 created, strictly by the `dec0de00-…` UUID namespace + demo user ids (FK-ordered); reverts office GPS to NULL. Kept OUT of `migrations/` so the runner never auto-applies it (it would wipe the seed immediately — happened once during setup).
- **069 APPLIED to cloud Supabase (2026-06-01); demo data is live** (5 projects, 6 customers, 8 enquiries, 6 demo users, etc.). 069 = on-demand demo data, NOT schema. See DEMO_VS_PROD.md.

**Pending:**
- [ ] Run teardown before any prod cutover: `psql "$DATABASE_URL" -f supabase/demo_teardown.sql`.

### Monthly team PDF report (2026-05-30)

**Built:**
- **Download Report button** beside Access Matrix on `/team` (owner / `team:create_user` only) — `app/(app)/team/DownloadReportButton.tsx`. Disclosure panel with a month `<select>` (last 12 completed months) → fetches the PDF as a blob → triggers a browser download. Months come from `availableReportMonths()` computed server-side and passed as a prop (hydration-safe).
- **Availability rule**: only fully-elapsed calendar months are downloadable; the current (in-progress) month becomes available on the 1st. `lib/reports/monthMeta.ts` — `availableReportMonths()`, `isMonthAvailable()`, `monthStartDate/EndDate()`, `monthKeyLabel()`; "now" computed in `Asia/Kolkata`.
- **PDF document**: `lib/reports/MonthlyReport.tsx` — `@react-pdf/renderer@4.5.1` (MIT, fully local, no paid service). Editorial cover (paper bg, amber left spine, **Tare wordmark `public/tare-logo.png` embedded as a data URI**, hairline, large serif title "Team &" ink + "*Performance*" forest italic, month in tracked caps, slate "At a glance" metric band with hairline-divided columns + footer rule) → Overview page (team-at-a-glance stat band + all-members table) → one detail page per member (excludes owner): team members show attendance/tasks/performance/broadcast stat bands + attendance log + task table; site engineers show site-check-in stats + check-in log. Brand palette mirrors `app/globals.css`. The logo is read server-side in the route (`loadLogo()` → base64 data URI) and passed via `ReportData.logoSrc`; falls back to a serif studio name if the file is missing.
- **API**: `GET /api/reports/monthly?month=YYYY-MM` (`route.tsx`, `runtime=nodejs`) — gated by `office_attendance:view_all`; rejects non-elapsed months (400); bulk-fetches all member sections scoped to the calendar month; renders via `renderToBuffer`; streams `application/pdf` with `Cache-Control: no-store`. Reuses the same tables as the per-member detail page (`attendance_logs`, `team_daily_tasks`, `member_tasks`, `team_performance_monthly`, `owner_broadcast_recipients`, `site_check_ins`, `team_member_tags`).
- New dep: `@react-pdf/renderer@4.5.1`.
- No DB/schema change.

### Team/Site-Engineer dashboard batch (2026-05-30)

**Built:**
- **General updates removed** — `app/(app)/team-member/AddUpdateCard.tsx` now posts project updates only (the "general" path tried to insert an `owner_broadcasts` row, which RLS blocks for team members → "Failed to post general update"). Project/general toggle gone.
- **Attendance accumulates worked minutes** across multiple check-in→check-out cycles a day. Migration 068 adds `attendance_logs.accumulated_minutes` + `last_check_in_at`. `app/api/attendance/route.ts` rewritten: check-out adds `(now − last_check_in_at)` to `accumulated_minutes`; a fresh check-in re-opens a cycle (bumps `check_in_count`); returns `worked_minutes`. `AttendanceCard.tsx` drives state off `last_check_in_at` (Check In ⇄ Check Out, "Check In Again" after a check-out); removed the old "+" re-log popover; "Worked" tile shows accumulated minutes.
- **Site engineers get office check-in/out** — same model as team members. New `app/(app)/site/components/SiteAttendanceCard.tsx` in the Today tab (Desktop + Mobile). Migration 068 grants `office_attendance:write_own` to existing site engineers; `SITE_ENGINEER_CAPABILITIES` adds it for new ones. `site/page.tsx` fetches today's `attendance_logs` row and threads it through `SiteEngineerDashboard`.
- **Scheduled site visits shown to site engineers** — new `SiteVisitsCard.tsx` lists upcoming `enquiry_reminders` (category `site_visit`, not done, `remind_at >= now`) for customers of the engineer's assigned projects. `site/page.tsx` fetches via **service client** (SE lacks `enquiry:view`/`customer:view`); `customer_id` added to the projects select; `SiteVisit` type in `site/components/shared.ts`.
- **Member-task completion time** surfaced to owner — `app/(app)/team/[memberId]/MemberDetailClient.tsx` Persistent Tasks rows show a duration chip (`completed_at − created_at`, humanised via new `fmtDuration`) for completed tasks. No API/DB change (data already fetched).
- **Owner reminder reschedule + delete** — `app/api/customers/[id]/reminders/route.ts` + `app/api/enquiries/[id]/reminders/route.ts`: PATCH extended to accept `remind_at`/`message`/`category` (reschedule); new DELETE (`?reminder_id=`). `CustomerDetail.tsx` `ReminderRow` gains a pencil button → inline edit (message/category/datetime) with Save + Delete (ConfirmPopover). RLS `enquiry_reminders_update`/`_delete` already allow `enquiry:set_reminder`.
- **Owner overview Broadcasts card** now shows only the single most recent broadcast (`page.tsx` owner query `.limit(1)`, `BroadcastsPanel refreshLimit={1}`).

**Pending:**
- [ ] Apply migration 068 (re-run after tenant_id fix): `DATABASE_URL=... npx tsx scripts/migrate.ts`

### Overview cards + updates filter + project scope (2026-05-30)

### Overview cards + updates filter + project scope (2026-05-30)

**Built:**
- Overview (`app/(app)/page.tsx`) reshuffled: removed the dark Collections card; Updates card moved into the top-right 3-col slot; a new full Broadcasts card (`BroadcastsPanel`, owner-compose, reused from `/team`) now occupies the bottom-left 8-col slot. Server fetches `owner_broadcasts` + recipients + `broadcast:create` capability and passes `nowMs` for hydration-safe relative time. Mobile view (`MobileHome`) still receives `financeData`, so the underlying queries stay.
- `/updates` rebuilt with new `UpdatesClient.tsx` (`app/(app)/updates/UpdatesClient.tsx`): month-pill filter (current + previous 5 months) **plus** custom `from`/`to` date inputs. Default = current month. Filter is URL-driven (`?month=YYYY-MM` or `?from=&to=`) so the server SQL applies `gte/lte` directly (limit raised to 500 within range). `nowMs` passed from server for hydration-safe `timeAgo`.
- Project scope (`projects.scope`) — settable via New + Edit project modals (Design + Execution / Design only). Migration 067 (`supabase/migrations/067_project_scope.sql`) **NOT YET APPLIED**. Stage route blocks `execution` when scope is `design_only`; PATCH route blocks `design_only` when project is in `execution`. EditProjectModal disables conflicting options in the Stage/Scope selects. `lib/supabase/types.ts` hand-patched (Row/Insert/Update — `scope: string`).
- `/projects` gains a Scope filter chip group beside the Stage chips (All / Design only / Design + Execution).
- Project detail page (`app/(app)/projects/[id]/page.tsx`): when `scope === "design_only"`, the Material Plan card, Expense Summary card, and the full-width Execution Tables section are all hidden. `isExecution = p.scope !== "design_only"` gates all three.

**Pending:**
- [ ] Apply migration 067: `DATABASE_URL=... npx tsx scripts/migrate.ts`

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
(Updated: 2026-08-06)

### Team & Access — UX pass (2026-08-06)

**`/settings/access-matrix`**
- Removed the per-toggle `ConfirmPopover` on every capability checkbox and on the tag select. They guarded nothing — edits are staged in local state and only the Save button reaches the API. Granting 10 capabilities cost 21 confirmations; it now costs 11 clicks and one confirm.
- Deleted the bottom "Capabilities" card (`CapabilityCards`, `groupCapabilities`, `actionLabel`, `CATEGORY_LABELS` in `page.tsx`). It rendered all ~100 capabilities as green ticks with `grantedSet={() => true}` — a screenful restating "the Owner is the Owner".
- Added a search filter (`.capSearch`) over the ~100-capability grid + per-category `granted/total` counts.
- Tag `<select>` is now **absent** for site engineers instead of disabled with a `title` tooltip.
- Capability rows are `.capToggle` (min-height 28px, 16px checkbox) — a bare checkbox is ~13px, under the WCAG 2.5.8 24px floor.
- `save()` drops each member from `edits` as its PATCH lands, so a mid-loop failure no longer re-posts already-applied changes; the error names the member.

**`/team`**
- Invite button shows a visible "Invite" label (collapses to a 40px icon ≤640px like its siblings). It was icon-only and needed a `title` to be understood.
- Roster row: `role="button"`/`tabIndex` removed from the container — it wrapped the Tags and Manage menus, which is an invalid ARIA nesting and flattened the row to one label for AT. The member name is now a real `<button>` (`.rosterNameButton`).
- **Grade is no longer derived from attendance alone.** `memberScore()` returned `consistencyScore` (days×4 + hours + check-ins×2) when a member had completed no tasks — an A for sitting in the office. It now returns `null`; roster/modal show `—` and the leaderboard excludes unscored members. `MemberDetail.score` is `number | null`.
- `--aos-muted` in `team-access.module.css` darkened `#8A857B` → `#69645A`. The tan was 3.46:1 on card paper (AA needs 4.5:1) and carries data: role label, "3 active", presence, filter tabs. Now 5.55:1 on paper-light / 4.78:1 on `--bg-2`. **One line — revert to `var(--color-tan)` if the mock mandates the lighter tan.**

**Known, not changed:** `CapRow` in `AccessMatrixEditor.tsx` is pre-existing dead code. `ProjectCategoryAccess` saves optimistically with no confirm while the capability grid requires Save — two models on one page. "My tasks today" (the owner's personal log) sits on the team-management page.

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
- [ ] Set office GPS coords — **superseded by 093**: add each office under Settings → Office
      locations (the `tenants.office_*` columns are deprecated and no longer read)
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

## Session 2026-08-13 — Task visibility, attendance office capture

**Done**
- 104: Zahra granted `member_tasks:view_all` + `daily_tasks:view_all` (manual source). Both needed —
  only `daily_tasks:view_all` is enforced by RLS (`owner_view_member_tasks`, 038); the other appears
  in no policy, so granting it alone renders an empty tab.
- `app/(app)/tasks/page.tsx` — firm-wide task view now capability-gated instead of
  `role === "owner"`. Fixes a capability-gated hard-rule violation; owner unaffected.
- `AccessMatrixEditor.tsx` — `ACTION_LABEL_OVERRIDES` spells out capabilities that rendered as a
  bare "view all" under several group headers and were effectively unfindable.
- 105: `attendance_logs.check_in/out_office_self_declared`. Check-in retries GPS once (6s→12s), then
  falls back to an office picker; the claim is recorded flagged, accepted only when no fix was
  obtained. Site engineers get the attendance card on `/site` (they already held
  `office_attendance:write_own` — no surface had ever rendered it).
- `PresenceCard` added to the owner desktop home.

**Not done — needs owner decision**
- `access_control:manage` for Zahra. Blocked by trigger `trg_cap_access_control` (004), which is a
  deliberate invariant, not an oversight. Only routes are dropping the trigger tenant-wide or
  promoting her to `owner` (which also grants finance). Neither is narrow.

**Verified, no change needed**
- 6:15 PM auto-checkout already exists (101): `close_stale_attendance()` on pg_cron
  `close-stale-attendance` `*/15 * * * *`, active. Cutoff = `workday_end` 18:00 + 15m grace = 18:15
  IST, confirmed against live tenant values.
- `broadcast:create` already granted to Zahra via her admin tag — she can broadcast today.

**Known data gap**
- ~70% of historical `attendance_logs` rows have no office because no GPS was captured. Left blank
  by decision; backfilling would write an assumption into attendance history as recorded fact.
