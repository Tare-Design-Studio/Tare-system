# ArchitectOS — System Design Document

**Client:** Architecture & Construction Practice
**Vendor:** Ascension AI Systems
**Stack:** Next.js 14 (App Router) · Supabase (Postgres + Auth + Storage + Realtime) · Vercel · PWA
**Document version:** v2.1 — second hardening pass. Implementation-ready.
**Status:** Architecture-only specification, hardened against real-world failure modes. Ready for build kickoff.

**Major changes from v2.0 (second hardening pass — addresses 25 build-time issues found in v2.0 review):**

- **Tenant denormalization across project-scoped tables.** Every project-scoped domain table now carries `tenant_id` and (where soft-delete applies) `deleted_at`, populated by a `set_tenant_from_project()` BEFORE INSERT trigger. The generic RLS template no longer assumes columns the table doesn't have. Audit triggers can read `tenant_id` directly from `NEW`/`OLD` without joining.
- **Audit trigger now derives `tenant_id` consistently.** With `tenant_id` denormalized onto every audited table, the audit trigger no longer needs per-table variants. Tables that genuinely have no tenant scope (e.g. `auth.users` proxy rows) are excluded from auditing.
- **`project_checkpoints.status` is no longer a generated column.** Postgres rejects generated columns whose expression is non-immutable (`current_date` is `STABLE`). Status is now exposed via the view `v_project_checkpoint_status`. The table stores only what's written.
- **Schema completeness.** Added `tenants.gps_retention_days`, `media_assets.scan_status` / `is_clean` / `scanned_at` / `scan_error`, the `audit_export_log` table, and the `feature_flags` table. Every column referenced in prose now exists in the schema.
- **Append-only correction pattern extended to `work_log` and `material_consumption`** with `corrects_<table>_id` and `is_corrected` columns and matching reporting views. Section 5.6 updated to match.
- **`material_plan.planned_quantity > 0`** check constraint added (Section 5.6 already promised it; the table didn't enforce it).
- **Material consumption ↔ checkpoint linkage.** Either added `linked_checkpoint_id` to `material_consumption` or — chosen here — clarified the ledger diagram to reflect that only `expenses` link directly to checkpoints; material consumption rolls up through expenses or via plan/date.
- **Audit log protection corrected.** The previous claim that `FORCE RLS` binds the Supabase `service_role` is wrong — `service_role` is designed to bypass RLS via the JWT. Section 10.1 now documents the realistic threat model: revoked direct privileges, no service-key code paths writing the table, an internal `record_audit_event()` function as the only insert path, and an external append-only export as the cross-domain integrity anchor.
- **Audit hash chain race condition fixed.** Concurrent writes for the same tenant now take a per-tenant `pg_advisory_xact_lock(hashtext('audit:' || tenant_id))` inside the audit trigger before reading the previous hash. The chain is provably linear.
- **Audit insert privilege hardened.** Direct INSERT on `audit_log` is revoked from `anon`, `authenticated`, and `service_role`. The only insert path is the `audit_trigger()` function (`SECURITY DEFINER`, owned by a non-login `audit_writer` role with the sole grant on `audit_log`). The session flag is retained as belt-and-braces.
- **Public enquiry rate limit is atomic.** A new `public_rate_limit_buckets` table with a unique key per (kind, identifier, bucket_window_start) is incremented under `pg_advisory_xact_lock`; concurrent submissions can no longer slip past the limit.
- **Customer portal abuse logging captures IP/UA/request_id.** `get_customer_portal()` now takes `p_ip`, `p_user_agent`, `p_request_id` from the route handler and stores them in `public_abuse_log` on every refusal.
- **Explicit privilege migration.** A new `/db/permissions.sql` migration revokes default access from `anon`/`authenticated` on every domain table, sequence, and function, then grants only the named RPCs and table operations needed by app code. Documented in Section 5.7.
- **`emit_notification()` lockdown.** Revoked from `public`, `anon`, and `authenticated`. Granted only to the `notification_writer` role used by scheduled jobs and other `SECURITY DEFINER` functions. Added a `p_source_type not null` precondition (matching the schema).
- **Notification scaffolding moved to Phase 0/2.** `notifications`, `notification_recipients`, and `emit_notification()` are now built in Phase 0 (minimal) so the material excess and public enquiry features in Phases 2 and 4 can call them. Push delivery polish stays in Phase 7.
- **Migration `work_log` insert split.** A historical totals row that exceeds 24 hours is rejected by `work_log.hours <= 24`. Migration now writes one row per day across the project's actual duration (or, if duration is null, distributes evenly across a configurable window), preserving the source total.
- **Section 1.2 contradiction resolved.** The "Standard Architectural Lifecycle" preset is **applied by default**, fully editable post-creation. The single "Not auto-applied" line in Section 1.2 has been corrected.
- **RLS template uses real capability names.** The YAML descriptor maps each table to its concrete capability strings (`expenses:create`, `expenses:approve`, `daily_tasks:write_own`, etc.), not derived placeholders. Section 5.5 documents the mapping convention.
- **`access_control:manage` is structurally non-delegable.** A trigger on `user_capabilities` rejects any insert/update of `access_control:manage` for any user other than the immutable Owner.
- **Customer portal returns signed URLs.** `get_customer_portal()` no longer returns raw `storage_path` values; the route handler post-processes results to issue short-lived signed URLs for the private bucket (or returns public-bucket URLs for explicitly-shared assets in `media-customer-public`).
- **Storage scan status wired into reads.** `media_assets.scan_status` is checked in every customer-facing query. Unscanned or unclean assets are excluded from portal payloads and gallery views.
- **Web Push runtime aligned.** Push delivery moves to a Vercel/Render Node worker (where `web-push` runs) rather than a Deno Edge Function. The Edge Function ecosystem schedules the worker; the worker calls VAPID-signed POSTs.
- **Invitation tokens are stored as hashes.** `users.invitation_token_hash` replaces `invitation_token`. The plaintext token exists only in the email link. Comparison on accept is via `crypto_hash` of the input.
- **Scope cut for v1.** Drive sync automation, ClamAV automated quarantine, and Web Push delivery are deferred to v1.1. Manual Drive URL maintenance, scan-status field with manual operator review, and in-app-only notifications ship in v1. The deferred list in Section 13 is updated.

**Major changes in v2.0 (first hardening pass, retained):**

This version was produced after a structured critique of v1.4 identified a number of issues that would have caused real problems at build time. v2.0 addresses each:

- **Schema is now migratable.** Tables are reordered to respect FK dependencies. Forward references (e.g. `enquiries → customers`) use `ALTER TABLE ADD CONSTRAINT` after both tables are created. Placeholder SQL like `<tenant_id>` is replaced with a dedicated `seed.sql` script. Missing referenced columns (`users.role_label`, `projects.is_placeholder`) are now defined where used.
- **RLS hardened across the board.** Every helper function now checks `tenant_id`, `users.is_active`, `deleted_at`, project assignment, project stage, and capability scope. A full policy template is provided for every table (Section 5.5), not just examples.
- **Public functions hardened.** All `SECURITY DEFINER` functions set `search_path` explicitly, have explicit `GRANT`/`REVOKE` clauses, return generic errors to the public, and log abuse events to a new `public_abuse_log`. Server-side Zod validation is required before any public function call. Cloudflare Turnstile gates the enquiry form. Phone numbers are normalized via `libphonenumber` before dedupe.
- **Notifications system fully specified.** New Section 9: `notifications`, `notification_recipients`, `push_subscriptions`, dedupe keys, delivery attempt tracking, scheduled generation jobs.
- **Audit log is now genuinely append-only.** RLS denies UPDATE and DELETE to all roles including service_role. Tamper evidence via hash chaining (Section 10). Request IP and user-agent captured via `set_config()` in middleware. (Audit log is now a top-level section — Section 10.)
- **Contradictions resolved.** Section 3.9 and decision #12 reconciled (default checkpoint preset auto-applies; default table preset is offered, applied-unless-declined). Migration scripts are deliverables; Phase 0 ships with empty tables — confirmed in the build plan.
- **Operational & security baseline added** (Section 12): MFA for Owner/Admin, password policy, invitation flow, session expiry, session revocation, backup-restore drills, Sentry PII scrubbing, upload size/type/malware checks, storage bucket RLS. *(Now Section 12 after renumbering.)*
- **Validation rules expanded** (Section 5.6): project status transitions, payment totals vs budget, over/under payment handling, material quantity positivity, expense approval lifecycle, GPS retention, append-only correction patterns.
- **Build plan re-scoped to 12 weeks for v1**, with v1.1 follow-on for deferred items. Each phase now has explicit "done means" acceptance criteria (Section 14). *(Now Section 14 after renumbering.)*
- **`SECURITY DEFINER` functions set `search_path`** to `pg_catalog, public` to prevent search-path attacks.

**Changelog from v1.3:**
- Section 3.8 — explicitly enumerated the four `visibility` modes and their scope rules. Owner-private events (enquiry reminders, customer reminders) are formally specified as visible only to users with `enquiry:view` or `customer:view` capability.
- Schema — added a CHECK constraint on `calendar_events` enforcing visibility ↔ scope coherence.
- Schema — added `tenant_id` to `enquiry_reminders` and a `sync_reminder_to_calendar()` trigger.
- Schema — added `tenants.completed_reminders_visible` flag.

**Changelog from v1.2:**
- Removed all UI/UX layout, visual, and interaction descriptions. Document is now purely architectural — *what exists* and *how data flows*, not *how it looks*.
- Single-tenant simplified throughout (multi-tenant scaffolding kept in schema but no longer described as a product capability).
- Customer portal hash now generated by an explicit Owner action, not auto-issued.
- Excess-material threshold set to 15% (alert-only, no enforcement).
- Soft-delete retention set to 60 days.
- English only at launch — i18n removed from scope.
- Variance threshold finalized: red status when exceeded, no further branching.
- Standard 7-milestone preset is the default for new projects, fully editable, with support for additional named presets and partial removal of any milestone.
- Renamed `clients` → `enquiries` throughout (domain-language change requested by client).
- **New:** Project stages — every project has `current_stage` (design / execution). Site Engineer surface and material/expense tracking are gated to execution stage.
- **New:** Public enquiry intake form (Section 4.5) — single per-tenant link suitable for posting on Instagram, YouTube, WhatsApp, etc.
- **New:** Two calendar surfaces — global calendar across all projects + per-project calendar.
- **New:** Daily team-member task log (`team_daily_tasks` table) for self-reported daily work, separate from project progress. Includes per-user CSV export.
- **New:** Owner broadcast updates (`owner_broadcasts` table) with multi-recipient targeting.
- **New:** Site Engineer site check-in (`site_check_ins` table) with project dropdown and confirmation.
- **New:** Project execution tables (`project_tables`, `project_table_columns`, `project_table_sections`, `project_table_rows`, `project_table_row_revisions`) — typed schema for structured execution checklists, modeled on the drawing register the client provided. Used by both Team Members (design tracking) and Site Engineers (execution tracking).
- Open decisions section updated with all resolved items recorded for audit.

**Changelog from v1.1:**
- Section 1.1 extended — added the two new files (team performance, client process) to the diagnostic
- Section 1.2 extended — added three new keep-decisions: 7-milestone preset, payment-tied-to-milestone, KPI input columns
- Section 5.2 — added `project_assignments.contribution_pct`, `project_checkpoints.triggers_payment_id`, `checkpoint_templates`, `team_performance_monthly`
- Section 5.2 — seeded the 7-milestone template as a selectable preset
- Section 13.2 — migration mapping for the team performance file
- Section 15 — added decision around milestone-payment coupling defaults

**Changelog from v1.0:**
- Added Section 1.1 — analysis of existing Excel trackers
- Added Section 1.2 — keep/drop/add decisions
- Added work-hours tracking (`projects.estimated_work_hours`, `work_log` table)
- Replaced free-form `clients.status` with a typed enum
- Added Section 13.1 — migration plan from `.xls`
- Variance flag elevated to a tenant-configurable setting

---

## 0. How to read this document

This is the single source of truth for the system before code is written. It is structured so that any section can change without breaking another — the same principle the system itself is built on.

- **Section 1** — conceptual model (Bridge & Brain) and what we learned from the client's existing trackers.
- **Sections 2–4** — roles, capabilities, system surfaces per role, and the public surfaces (customer portal, enquiry form).
- **Section 5** — data architecture: migration order, schema, RLS helpers, hardened public functions, RLS template applied per-table, validation rules.
- **Sections 6–9** — the interconnected ledger, image handling, realtime, notifications.
- **Section 10** — the tamper-evident audit log (append-only enforcement, hash chaining, triggers).
- **Sections 11–12** — application architecture and the operational/security baseline.
- **Section 13** — 12-week build sequence with explicit acceptance criteria per phase. Sections 13.1 and 13.2 are migration plans (deliverables, not auto-run in v1).
- **Section 14** — test strategy and the gates that prevent rolling deadlines.
- **Sections 15–16** — resolved decisions audit and post-launch deferred items.
- **Appendix A** — every table and its capability/scope/stage policy at a glance.

This document is architecture-only. UI presentation, layout, and interaction details are out of scope and are determined during implementation.

---

## 1. The conceptual model — Bridge & Brain

This is the conceptual model the system is organized around. It does two jobs at once: it explains how information flows, and it explains who can see what.

```
                          ┌─────────────────────────┐
                          │       OWNER / LEADER    │
                          │       (The Brain)       │
                          │                         │
                          │  Sees everything.       │
                          │  Grants access.         │
                          │  Owns client pipeline.  │
                          │  Owns finance + audit.  │
                          └────────────┬────────────┘
                                       │
                       ┌───────────────┼───────────────┐
                       │               │               │
                       ▼               ▼               ▼
              ┌────────────────┐  Project Manager   Accountant
              │   THE BRIDGE   │  (scoped slice)   (finance slice)
              │  (Coordination │
              │      Page)     │
              │                │
              │ Messages,      │
              │ drawings,      │
              │ site images,   │
              │ requests,      │
              │ shared notes   │
              └───────┬────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
        ▼                            ▼
┌────────────────┐          ┌──────────────────┐
│  TEAM MEMBERS  │          │  SITE ENGINEERS  │
│   (Island A)   │          │    (Island B)    │
│                │          │                  │
│ Drawings,      │          │ Material         │
│ design notes,  │          │ consumption,     │
│ project        │          │ project progress │
│ updates,       │          │ checklists,      │
│ remarks        │          │ site images,     │
│                │          │ daily expenses   │
└────────────────┘          └──────────────────┘

                  ┌──────────────────────────┐
                  │   CUSTOMER PORTAL        │
                  │   (no login, hashed URL) │
                  │                          │
                  │ Sees ONLY: payment       │
                  │ progress, allowed images,│
                  │ allowed drawings,        │
                  │ next payment schedule.   │
                  └──────────────────────────┘
```

**Reading the diagram:**

- **Two islands** — Team Members and Site Engineers — each have their own dashboard tuned to their work. They never see each other's surfaces directly; they coordinate through the Bridge.
- **The Bridge** is the only place where Islands A and B meet. It is project-scoped: a Bridge channel exists per project, not globally.
- **The Brain** sits above and sees both islands and the Bridge. It also owns three things nobody else owns by default: the **client pipeline** (pre-customer), **customer payments**, and the **audit log**.
- **Project Manager and Accountant** are scoped views derived from the Brain — they don't get their own islands; they get a filtered slice of the Brain's view, controlled by the Access Matrix (Section 5.3).
- **The Customer Portal** is outside the perimeter. No login, hashed URL, read-only, owner-curated.

This metaphor carries straight into the data model: every table has a `project_id` (which island/bridge it belongs to) and a `visibility_scope` derived from the Access Matrix.

---

## 1.1 What we learned from their existing trackers

Two Excel files were provided by the client to show how they currently track projects: a structured `.xlsx` and a flat `.xls`. They were examined before this revision was written. Reading them tells us more about how the firm actually operates than any conversation could.

### The structured `.xlsx` (Project_Tracker)

Eight sheets — Project_Overview, Zone_Breakdown, Activity_Library, Daily_Progress_Log, Zone_Progress, Weekly_Control, Finishing_Tracker, Cost_Tracker — cross-referenced via Project ID and Zone. A proper relational model squashed into spreadsheet form. Whoever designed this had the right instincts.

**The catch:** it's almost entirely empty. One placeholder project (P01, "Villa Project," Client A). The Daily_Progress_Log has zero rows. The Finishing_Tracker has zero rows. **A schema designed and abandoned.**

### The flat `.xls` (Project_tracker)

This is what they actually use. Four sheets:

- **Project Tracker** — 9 real projects (one with a real client name "Vinay Raam"; the rest placeholders Project 2–9). Columns: Project, Category, Assigned To, Estimated Start/Finish, Estimated Work (hours), Estimated Duration (days), Actual Start/Finish, Actual Work hours, Actual Duration days, **Over/Under flags** for both work and duration. Threshold cell at the top: 25%.
- **Setup** — actual team roster (Sneha, Divya, Usha, Firasath, Shanthy, Anitha, Bhoomika, Lakshmi, Nidhi, Sowmiya, Aadarsh, Siddiq), category list (Residential, Commercial, Industrial, Institutional, Interior, Urban), and a "Priority" column that actually contains client-stage values like "Closed for discussion" and "Awaiting approval" — leaked into the wrong field.
- **Details** — a Construction Site Quantitative Daily Log template (labour hours, equipment hours, materials, signature line). Completely blank. Nobody fills it in.
- **Tasks** — four status options (Not started, In progress, Blocked, Completed) and no actual tasks.

### The client process template (`Client_process_documentation.xls`)

A single sheet, 7 rows, every data column blank. Just a milestone template — Milestone No., Description, Planned/Actual Completion, Approval Status, Approval Date, Payment Amount, Payment Due Date, Payment Status, Comments.

The 7 milestones are the firm's actual default project lifecycle:

1. Project Kickoff & Initial Survey
2. Concept Design Submission
3. Design Development Approval
4. Construction Documentation
5. Permit & Regulatory Approvals
6. Construction Phase Completion
7. Final Project Handover

**Structural insight from this file:** project milestones and payment milestones are the *same row*. Same template. Meaning **payments are tied to milestone approval, not to a fixed date schedule.** A customer pays when a milestone is approved. This affects the schema (Section 5.2) — checkpoints can trigger payments.

### The team performance file (`1__Office_team-performance.xlsx`)

Six sheets, **all populated with real data** — this is the most fully-formed file of the four:

- **Employee_Master** — 5 employees (E01–E05) with Role, Experience, Join Date, Skill Score (0–10), Salary, Status. Roles: Draftsperson, Junior Architect (×3), Architect.
- **Project_Master** — 3 projects with Project Value (INR), Start/End, Status.
- **Allocation_Matrix** — for each (employee, project) pair: role on project + **contribution percentage**. Per project, contributions sum to 100%. One architect can be 40% on Project A and 35% on Project B simultaneously.
- **Performance_Input** — monthly per-employee metrics: Drawings Completed, Errors, Revisions, Deadline Met %, Client Rating (1–10), Site Delay (days).
- **KPI_Scoring** — derived per employee: Efficiency, Quality, Delivery, Overall KPI Score.
- **Growth_Dashboard** — derived per employee: Revenue Contribution, KPI Score, Growth Contribution Score.

**Structural insights from this file:**

- **Employee time is fractional across projects.** Our `project_assignments` table needs a `contribution_pct` column. This also resolves a future ambiguity in the work_log: when someone logs hours, the contribution matrix tells the system how to attribute them.
- **They have a real KPI culture.** The dashboard already computes Efficiency / Quality / Delivery / Overall, and the inputs are concrete and gettable. A Team Performance surface needs to be a first-class part of the Owner dashboard — not a v2 nice-to-have.

### What this tells us about the firm — diagnostic insights that shape the design

**1. They have a planning instinct but no execution loop.** The structured `.xlsx` schema shows someone designed a proper progress system. The flat `.xls` shows them giving up and falling back to estimated-vs-actual hours at project level. The gap between "what we want to track" and "what gets entered" is the entire problem we are being hired to solve.

**2. There is no daily site reality in their data.** The Details template is blank. The Daily_Progress_Log is blank. The client process template is blank. Everything they "know" about a project is a roll-up entered after the fact. **This is why the Site Engineer dashboard matters more than the Owner dashboard** — without site-level inputs, every layer above is fiction.

**3. The files that get used are the ones without daily input demands.** Look at the populate-rate:

| File | Status |
|---|---|
| Project_tracker.xls (project list, hours, monthly roll-up) | Lightly populated, partially used |
| 2__Project_Tracker.xlsx (zone/activity daily granularity) | Empty |
| Client_process_documentation.xls (per-milestone tracking) | Empty |
| 1__Office_team-performance.xlsx (monthly KPIs, allocation) | **Fully populated, actively used** |

Everything monthly or roll-up survives. Everything daily or per-task dies. **This is the single most important UX constraint of this build.** The Site Engineer's three-tab phone screen has to feel like sending a WhatsApp message, or it joins the graveyard.

**4. Their actual unit of work is the project, not the activity.** They tried zone/activity granularity in the structured `.xlsx` and abandoned it. Build at project + checkpoint level; revisit zones only if asked.

**5. Variance is the single most-used analytical concept in their system.** The over/under flag is the only conditional logic across all four files. They care about it. Surface variance prominently — not buried in finance.

**6. The team is ~12 people in the project tracker but 5 in the team performance file.** Either the team performance system tracks only the architects/draftspersons (not the larger roster) or it's out of date. **Open question for the client.** The Setup roster is the source of truth for v1.

**7. The right half of our system is greenfield.** No client/customer data, no payments, no materials, no images, no site engineer column anywhere in their files. Good news for adoption: no "but we used to do it this way" friction for those modules.

**8. They think in hours, not just dates.** The flat `.xls` has estimated vs actual hours as a first-class concept. Sneha logged 300 actual hours against 210 estimated on the Vinay Raam project — that's the data point they discuss. Our schema models this directly (Section 5.2 — `work_log` table and `estimated_work_hours` column).

**9. A hidden requirement leaked through their Setup sheet.** What they labeled "Priority" actually contains client-stage values. This is a pipeline that has nowhere to live in the current sheet, so it crammed itself into the wrong column. Our `enquiries.status` field supports these as a typed enum, not free-form text.

**10. Project milestones double as payment milestones.** The client process template proves it. Schema lets a checkpoint optionally trigger a payment row when approved.

**11. Employee time is allocated as a percentage across multiple projects, not assigned binary-style.** The team performance allocation matrix proves it. `project_assignments.contribution_pct` makes this first-class.

---

## 1.2 What we keep, drop, and add

| What they have | Decision | How we handle it |
|---|---|---|
| Project (name, category, assignee, est/actual dates, est/actual hours) | **Keep** — their muscle memory | First-class fields on `projects`. Migration script imports the 9 rows verbatim (Section 13.1). |
| Over/Under variance flag at 25% threshold | **Keep and elevate** | Threshold becomes tenant-configurable. Variance gets a colour-coded pill on every project card on the Owner dashboard. |
| Category enum (Residential / Commercial / Industrial / Institutional / Interior / Urban) | **Keep** | Becomes the `project_type` enum. No invented categories. |
| Status: Not started / In progress / Blocked / Completed | **Keep, with one upgrade** | Maps to `planning / active / on_hold / completed`. "Blocked" → `on_hold` with a required reason field — they currently can't say *why* something is blocked. |
| Setup sheet's "Priority" column (which is actually client-stage) | **Relocate** | Becomes the `enquiries.status` enum: `new / quotation_sent / awaiting_approval / closed_for_discussion / converted / lost`. Hidden requirement, now visible. |
| Setup sheet's Employee roster (12 names) | **Keep** | Pre-populated into `users` table at onboarding. Owner just assigns roles + capabilities. |
| Estimated vs actual work hours | **Keep and promote** | First-class. New `work_log` table. New "Hours Pipeline" visual on Owner dashboard alongside progress and payments. See Sections 3.1 and 5.2. |
| Zone_Breakdown / Activity_Library / Zone_Progress sheets | **Drop from v1** | Designed but never used. Build at checkpoint granularity. Revisit only on explicit request. |
| Cost_Tracker (zone × activity × budget × actual) | **Drop the structure, keep the intent** | Replaced by the interconnected ledger of `expenses` ↔ `material_consumption` ↔ `checkpoints` (Section 6). Same job, less manual entry. |
| Construction Site Quantitative Daily Log (Details sheet) | **Drop** | Never filled in once. Replaced by the Site Engineer's three-tab phone screen. The reason it was abandoned is obvious — nobody fills out a 70-row Excel sheet on a construction site. |
| Tasks sheet | **Drop** | Replaced by checkpoint checklists + calendar tasks. |
| Weekly_Control (Planned % vs Actual % vs Critical Activity vs Action) | **Keep the idea, drop the manual entry** | Becomes a derived view: weekly variance is computed automatically from checkpoint progress and material consumption. The "Action" field becomes a Bridge post tagged `action_required`. |
| 7-milestone client process template (Kickoff → Concept → DD Approval → Construction Docs → Permits → Construction → Handover) | **Keep as the default preset, applied to new projects** | Seeded into a `checkpoint_templates` table as "Standard Architectural Lifecycle." When creating a project, the preset's checkpoints are copied into the project by default; the Owner/PM can edit, add, remove, or replace any of them post-creation. The Owner can also create new named presets. Per resolved decision #12. |
| Payment columns inside the milestone template (Amount, Due Date, Status) | **Keep the linkage** | A checkpoint can optionally `triggers_payment_id` — approving a milestone marks the linked payment row as due. One-click coupling. |
| Allocation_Matrix (employee × project × contribution %) | **Keep as a first-class structure** | `project_assignments.contribution_pct` column with a check that contributions sum to ≤100% per project. Makes the work_log unambiguous. |
| Performance_Input columns (Drawings Completed, Errors, Revisions, Deadline Met %, Client Rating, Site Delay) | **Keep verbatim** | New `team_performance_monthly` table with these six input columns plus computed Efficiency / Quality / Delivery / Overall scores. Owner enters monthly. |
| Employee Skill Score (0–10) | **Keep** | Added to the `users` table. |
| KPI_Scoring + Growth_Dashboard derived sheets | **Keep as derived views** | Computed from `team_performance_monthly` + project values; never stored as input. |

### Three things their current system literally cannot do that ours will

1. **Tell the truth at end-of-day.** Today nobody on site enters anything; the Owner finds out about overruns weeks late. The Site Engineer dashboard with one-tap "used today / remaining" closes the feedback loop from weeks to hours. *This alone justifies the project.*
2. **Separate customer-visible from team-visible.** Today every customer status update is composed manually on WhatsApp. The hashed customer portal eliminates that work entirely and standardizes what gets shown.
3. **Audit who changed what.** The `.xls` was created in 2016 and last saved in 2026, all by user "Admin." Every edit overwrote the previous one. The `audit_log` makes this a non-issue from day one.

### Pitch positioning for the client meeting

> "You already designed the right system. You designed it twice — once in the structured tracker, once in the flat one — and both times the daily data stopped flowing within weeks. That's not a discipline problem; it's an interface problem. We're not throwing your tracker away. We're building the missing layer underneath it so the cells you care about — variance, hours, status — fill themselves."

---

## 2. Roles & the Access Matrix

### 2.1 Roles

| Role | Default Scope |
|---|---|
| `owner` | Everything. Cannot be revoked. Only one per tenant. |
| `admin` | Like owner but **excluding** the enquiry pipeline and customer payments unless granted. |
| `project_manager` | Assigned projects only. Can edit timelines, checklists, material plans. |
| `team_member` | Assigned projects only. Bridge + drawings + design notes. |
| `site_engineer` | Assigned projects only. Material consumption, progress, expenses. |
| `accountant` | Finance surfaces across granted projects. No design/site detail by default. |
| `customer` | No login. Hashed URL to a single project's curated view. |

### 2.2 The Access Matrix — the single source of truth for "who sees what"

The Owner has one screen — **Access Control** — that is a 2D grid. Rows are users. Columns are *capabilities*. A capability is a (resource, action) pair, e.g. `customer_payments:view`, `team:create_user`, `audit_log:view`, `images:select_for_customer`.

Capabilities are **never** inferred from role alone. Role is a *default template*. The Owner can override any cell. This is what makes "the accountant sees customer payments but not site engineer updates, and the site engineer sees neither" work without hard-coding it. See Section 5.3 for the database design that enforces this.

### 2.3 Capability list (initial — extensible)

```
project:create, project:edit, project:delete, project:view_assigned, project:view_all
project:change_stage
enquiry:view, enquiry:create, enquiry:edit, enquiry:add_remark, enquiry:set_reminder
customer:view, customer_payments:view, customer_payments:edit, customer_payments:create_schedule
team:create_user, team:edit_user, team:deactivate_user, team:assign_to_project
materials:plan, materials:consume, materials:view
progress:update, progress:view, checklist:edit
expenses:create, expenses:view, expenses:approve
finance:view_dashboard, finance:export
images:upload, images:view, images:select_for_customer
bridge:read, bridge:write
calendar:view_own, calendar:view_all, calendar:create_for_others
daily_tasks:write_own, daily_tasks:view_all, daily_tasks:export_own, daily_tasks:export_all
broadcast:create, broadcast:receive
site_check_in:write, site_check_in:view_all
project_table:view, project_table:edit, project_table:create, table_preset:manage
intake_form:configure
audit_log:view, audit_log:export
access_control:manage      ← this is the only capability the Owner cannot delegate
```

Every API call and every UI element checks against capabilities, not roles.

---

## 3. System surfaces — what each role can access

This section enumerates the *capabilities* exposed to each role and what data they read or write. UI presentation is out of scope for this document.

### 3.1 Owner surface

The Owner has access to every surface unconditionally. Capabilities are seeded at user creation and cannot be revoked by anyone, including the Owner themselves (`is_owner_immutable` trigger on `user_capabilities`). The Owner-specific surfaces are:

- **Priority Notifications stream** — server-generated alerts (Section 8) for: overdue payments, missed checkpoints, material overrun (>15%), enquiry reminders due today, and audit anomalies.
- **Project list and project detail** — full read access to all projects, including the three computed pipelines (progress / hours / payments) and the project-level variance flag.
- **Updates feed** — unfiltered chronological feed across all projects, filterable by project, author, update type, and date range.
- **Enquiries (pre-customer pipeline)** — Owner-only by default. Includes enquiry sources, stage, remarks, and reminders. See Section 5.2 (`enquiries` table).
- **Customers and customer payments** — Owner has full read/write; can grant `customer_payments:view` and `customer_payments:edit` to others (typically the accountant).
- **Finance surface** — aggregated expense, payment, and variance data.
- **Team Performance surface** — monthly KPI inputs and computed scores (`team_performance_monthly`, `v_kpi_scores`, `v_employee_revenue_contribution`).
- **Owner Broadcasts** — composes update messages with multi-recipient targeting (Section 3.6).
- **Team and Access Control** — user creation, role assignment, capability matrix editing.
- **Audit Log** — append-only log of every mutation, filterable by actor, resource, and time.
- **Customer Portal hash management** — Owner explicitly generates a hash per project via a button; the hash is not auto-issued. Owner can also regenerate or revoke. See Section 4.
- **Drive folder configuration** — Owner sets the project's Google Drive folder URL through an edit field on the project; the system surfaces this URL as a deep link to other authorized users. See Section 7.

### 3.2 Site Engineer surface

The Site Engineer's surface is gated to projects where (a) the engineer is assigned via `project_assignments` and (b) the project's `current_stage = 'execution'`. Design-stage projects do not appear on the Site Engineer's surface.

Per assigned project, three capability groups:

1. **Material consumption.** Reads `material_plan` (PM-authored), writes `material_consumption`. Excess is flagged automatically (Section 6).
2. **Project progress.** Reads `checkpoint_items` for the current `project_checkpoint`, writes completion state and optional photos.
3. **Expenses.** Writes `expenses`, with optional one-tap link to a `material_consumption` row to maintain ledger consistency.

Two additional surfaces:

- **Site check-in** — Site Engineer selects which assigned project they are physically at and confirms. Writes one `site_check_ins` row. Owner sees these in real time via Realtime channel. See Section 3.7.
- **Site Engineer execution table** (Section 3.9) — per-project structured table for site execution tracking, parallel in shape to the Team Member execution table.

### 3.3 Team Member surface

The Team Member surface is gated to projects where the member is assigned. Both `design` and `execution` stage projects are visible.

Per assigned project:

- **Drawings and design notes** — reads/writes `media_assets` of `kind = 'drawing'` and `updates` of `update_type = 'drawing'` or `'note'`.
- **Remarks** — writes short updates with optional image attachment to `updates`.
- **Bridge** — see Section 3.5.
- **Team Member execution table** (Section 3.9) — per-project structured table for tracking team execution items (e.g. drawings status as in the client's drawing register). Editable preset.
- **Daily task log** — Team Member writes one or more rows per day in `team_daily_tasks` describing what they're working on (a short phrase) and checks each off when done. Visible to Owner. Drives team performance reporting (Section 3.8). Each user can export their own log as CSV. Owner can export any user's log.

### 3.4 Project Manager and Accountant surfaces

These two roles are scoped slices of the Owner surface. They do not have their own dedicated dashboards in the data model; they receive the Owner's surface filtered by capability.

- **Project Manager**: capabilities `progress:update`, `checklist:edit`, `materials:plan`, `progress:view`, `materials:view`. Read access to project assignments. Cannot see customer payments unless explicitly granted.
- **Accountant**: capabilities `customer_payments:view`, `customer_payments:edit`, `finance:view_dashboard`, `finance:export`, `expenses:view`, `expenses:approve`. Cannot see design or site detail unless explicitly granted.

### 3.5 The Bridge — coordination surface

One Bridge channel per project (`bridge_messages` table, scoped by `project_id`). Members: Team Members + Site Engineers + PM assigned to that project. Owner has read access to all Bridges.

Message types: `text`, `image`, `drawing_ref`, `material_request` (structured payload), `clarification` (structured payload).

Structured messages **write into the data layer** as side effects:
- A `material_request` Bridge message creates a draft row in `material_plan` referencing `bridge_messages.id`.
- A `clarification` Bridge message creates a row in `updates` of type `note` targeted at the addressed user.

The Bridge is therefore not a sidecar chat — it is an alternate write path into the same tables.

### 3.6 Owner broadcasts

The Owner can compose update messages to one or more team members (multi-select). Each broadcast targets a list of `user_id`s. Recipients see new broadcasts on their own surface in a dedicated feed.

Backed by `owner_broadcasts` and `owner_broadcast_recipients` (Section 5.2). Acknowledgement state is tracked per recipient.

### 3.7 Site check-in

Site Engineers (and any user with `site_check_ins:write`) confirm their physical site location by selecting an assigned project from a dropdown and confirming. Each confirmation writes one row to `site_check_ins` with timestamp, optional GPS coordinates, and the user_id.

The Owner sees a live feed of check-ins, scoped per project, via a Supabase Realtime channel. Overdue check-ins (no record before the configured cutoff time on a working day) generate a Priority Notification.

### 3.8 Calendars — global and per-project

Two calendar surfaces, sharing the same underlying `calendar_events` table:

- **Global calendar** — events across all projects the user has access to, filtered by capability. Each role sees only events relevant to them. The Owner additionally sees private events: enquiry reminders and customer reminders (meetings, follow-ups, site visits). These are visible **only to the Owner** — no other role, including admins, sees them by default.
- **Per-project calendar** — events scoped to a single `project_id`. Available to all users with access to that project. Private Owner events (enquiry/customer reminders) never appear on per-project calendars even when viewed by the Owner, because they are not scoped to a project.

`calendar_events` rows can carry one of: a `project_id` (project-scoped event), an `enquiry_id` (Owner-only enquiry reminder), a `customer_id` (Owner-only customer reminder), or none (tenant-wide event). The `visibility` enum is the source of truth for filtering and is enforced by a CHECK constraint:

- `visibility = 'private_owner'` rows must have either `enquiry_id` or `customer_id` set, must have `project_id` null, and are filtered out of every query except those run by users with `enquiry:view` or `customer:view` capability (Owner-only by default).
- `visibility = 'project'` rows must have `project_id` set.
- `visibility = 'assigned_user'` rows must have `assigned_user_id` set.
- `visibility = 'tenant'` rows are visible to all authenticated users in the tenant.

Reminder write paths automatically set the correct visibility:
- Creating an `enquiry_reminders` row with `enquiry_id` → emits a `calendar_events` row with `visibility = 'private_owner'`, `enquiry_id` set, `source_type = 'reminder'`.
- Creating an `enquiry_reminders` row with `customer_id` (post-conversion) → emits `visibility = 'private_owner'`, `customer_id` set.
- Marking a reminder `is_done = true` removes the corresponding calendar row (or marks it complete, depending on the Owner's preference — stored as `tenants.completed_reminders_visible boolean default false`).

Every event stores `source_type` + `source_id` so that opening an event deep-links to its origin (task → project, enquiry reminder → enquiry record, customer reminder → customer record, payment due → finance record, checkpoint deadline → checkpoint detail).

### 3.9 Project execution tables

Each project has zero or more **execution tables** — typed structured checklists modeled on the drawing register the client provided. These replace the role of paper/spreadsheet trackers without becoming free-form spreadsheets.

A table has:
- A name (e.g. "Drawing Register," "Site Execution Checklist").
- An owner role (`team_member` or `site_engineer`) — determines which surface the table appears on.
- Ordered **sections** (e.g. "Structural Details Upto Foundation Lvl," "Ground Floor Set") which group rows.
- Ordered **columns**, each with a typed kind: `serial`, `text`, `checkbox`, `date`, `revision_text`. The `serial` column auto-numbers within a section.
- **Rows**, each containing one cell value per column.
- Per-row **revision history** — when a row is edited (e.g. "Column size changed to 9x15"), the prior state is preserved as a `project_table_row_revisions` entry. This is what the client's "R1- Column size changed to 9x15" notation captures.

A new project gets one **table** by default — the "Drawing Register" derived from the system table preset for the `team_member` role — created automatically at project creation. The Owner or PM can edit, replace, or delete this default, or add additional tables (Site Engineer execution tables, etc.) from other presets or from scratch.

This is consistent with checkpoint behaviour: the Standard Architectural Lifecycle preset auto-applies its checkpoints to new projects (resolved decision #12), and the Drawing Register table preset auto-applies its table to new projects. Both are fully editable post-creation, and additional checkpoints/tables can be added.

Presets are fully editable: rows, sections, and columns can all be added, reordered, removed, or renamed. New named presets can be created by the Owner.

Schema in Section 5.2 (`project_tables`, `project_table_columns`, `project_table_sections`, `project_table_rows`, `project_table_row_revisions`, plus tenant-level `table_presets`, `table_preset_columns`, `table_preset_sections`, `table_preset_rows`).

### 3.10 Project stage gating

Every project has a `current_stage` enum: `design` or `execution`. Stage transitions are explicit (Owner or PM action), recorded as audit log events.

Stage-gated features:

| Feature | Available in `design` | Available in `execution` |
|---|---|---|
| Drawings, design notes, Team Member execution table | Yes | Yes |
| Bridge | Yes | Yes |
| Calendar | Yes | Yes |
| Material plan / consumption | No | Yes |
| Site Engineer dashboard surface | No | Yes |
| Site check-ins | No | Yes |
| Expenses | Limited (design-phase miscellaneous only) | Yes |
| Customer payments | Yes (deposit milestones) | Yes |

Enforced via RLS policies on the relevant tables (`material_plan`, `material_consumption`, `site_check_ins`, etc.) checking `projects.current_stage`.

---

## 4. The Customer Portal and the public Enquiry Form

These are the only two public surfaces (no login). Both follow the same pattern: a public Postgres function that takes a token and returns curated data, with the public anon key holding `EXECUTE` on those functions only.

### 4.1 Customer Portal — URL design

`https://app.example.com/c/<project_slug>-<hash>`

- `project_slug` is the internal project name slugified.
- `hash` is a 16-character URL-safe token stored in `projects.customer_portal_hash`. **Generated only when the Owner explicitly clicks "Generate customer link"** — never auto-issued.
- The hash is not derived from the project ID. Knowing one URL gives no information about another.
- Rate-limited per IP at the Vercel Edge layer.
- Page is read-only; the public anon role has no SELECT permission on raw tables — only EXECUTE on `get_customer_portal()`.

### 4.2 Customer Portal — what the customer sees

- Project name + customer name.
- Payment schedule (paid, due, upcoming) with amounts and dates.
- Site images and drawings explicitly toggled `visible_to_customer = true` by the Owner.
- High-level checkpoint progress (status only — no internal checklist detail).
- The configured Drive folder URL **only if the Owner has opted to expose it** (`projects.share_drive_with_customer`).

### 4.3 Customer Portal — what the customer never sees

Internal expenses, material consumption, team identities, Site Engineer remarks, audit logs, the Bridge, project execution tables, daily tasks, broadcasts, anything from any other project, or anything not opted-in.

### 4.4 Customer Portal — implementation

`get_customer_portal(p_hash text)` is a `SECURITY DEFINER` Postgres function returning a curated JSONB payload (see Section 5.4 for the implementation). The customer page calls only this function. Even if the entire public route is compromised, an attacker gains read-only access to opted-in fields of a single project.

### 4.5 Public Enquiry Form

A second public surface, distinct from the Customer Portal, designed for posting on Instagram, YouTube, WhatsApp, etc.

URL: `https://app.example.com/enquire/<tenant_slug>` — one link per tenant. (For this engagement, single tenant, so a single link suffices.) The link is configured in the Owner's settings and can be regenerated.

Form fields: name, phone, email (optional), message, source (dropdown: Instagram / YouTube / WhatsApp / website / referral / walk-in / other). The source dropdown is informational; `referrer` HTTP header is also recorded for cross-checking.

The form posts to a `submit_public_enquiry()` Postgres function (`SECURITY DEFINER`) which:
1. Rate-limits by IP (5 submissions per IP per hour) and by phone number (1 per phone per 24 hours, soft block).
2. Inserts into `enquiries` with `status = 'new'`, `source` from the form, and a `created_via = 'public_form'` flag.
3. Emits a Priority Notification to the Owner.

The public anon role has `EXECUTE` on `submit_public_enquiry()` only — no direct write access to the `enquiries` table.

### 4.6 Enquiry → Customer conversion and reminders

Enquiries (formerly "clients" in v1.0) live in the `enquiries` table. Owner-only by default. Each enquiry supports:

- **Remarks** — free-form notes, written by the Owner (`enquiry_remarks` table).
- **Reminders** — scheduled reminder rows in `enquiry_reminders` with priority levels. Reminders surface in the Owner's calendar and drive Priority Notifications when due. Same mechanism is reused after conversion: customer meetings, follow-ups, and site visits all create reminder rows scoped by `customer_id`.
- **Conversion** — when an enquiry pays and starts work, the Owner triggers conversion. This creates a `customers` row, a `projects` row, sets `enquiries.converted_to_customer_id`, and the team gains visibility per the assignment rules. The same reminder mechanism continues to operate against the customer.

---

## 5. Data architecture

This is the engineering core. It is designed so that adding a new role, a new capability, or a new resource type does not require touching existing tables.

### 5.0 Migration order, FK deferral, and seed conventions

The schema is designed to load top-down as a single migration file (or as a sequence of numbered migrations) without forward-reference errors. To achieve this:

**Table creation order**: `tenants` → `users` → `user_capabilities` → `projects` → `customers` → assignments / checkpoints / templates → enquiries → enquiry_remarks → enquiry_reminders → enquiry_intake → materials → expenses → payments → updates / media / bridge → daily tasks → broadcasts → site check-ins → project tables → calendar → team performance → notifications → audit log.

**Forward references** (e.g. `projects.customer_id → customers.id` when projects must exist before customers because `enquiries.converted_to_customer_id → customers.id` and `customers.created_from_enquiry_id → enquiries.id`) are handled by:

1. Creating the column without the FK constraint.
2. Adding the constraint via `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` in a final block at the end of the migration file (Section 5.2.1).

**Seed data**: the document does not contain inline `INSERT` statements for the tenant row, the seeded checkpoint preset, or the seeded table preset. These live in `/db/seed.sql`, run after the schema migration, parameterized by the tenant id created during Phase 0 onboarding. This keeps the schema file replayable and idempotent.

**Numbered migrations**: in production, the schema is split into Supabase migrations (`supabase/migrations/<timestamp>_<name>.sql`) and run forward-only. The single-file representation in Section 5.2 is the merged result for readability.

---

### 5.1 Design principles

1. **Every mutating table has** `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete). No hard deletes except via Owner-initiated purge.
2. **Every domain table has** `project_id` where applicable, and `tenant_id` at the top. Multi-tenant from day one even if there is one tenant — it costs nothing now and saves a migration later.
3. **No business logic in triggers** for things the app should know about. Triggers are reserved for: `updated_at` maintenance, audit log emission, soft-delete cascade.
4. **Append-only where it matters.** Audit logs, material consumption events, expense events — these are immutable rows. Corrections are new rows that reference the original.
5. **Capabilities, not roles, in RLS.** RLS policies query the access matrix view (Section 5.3), never check `role = 'owner'` directly except for the owner-only escape hatch.

### 5.2 Core tables

```sql
-- ============================================================
-- IDENTITY & ACCESS
-- ============================================================

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Variance threshold (over/under flag on est vs. actual). When exceeded,
  -- the project gets a red status pill. Default 25% from their existing tracker.
  variance_threshold_pct numeric(5,2) not null default 25.00,
  -- Material consumption excess threshold. When actual > planned by this %,
  -- a Priority Notification fires. Alert-only; does not block submission.
  material_excess_threshold_pct numeric(5,2) not null default 15.00,
  -- Soft-delete retention before audit-logged hard purge (Section 12.5).
  soft_delete_retention_days int not null default 60,
  -- Site check-in GPS coordinate retention (Section 5.6). After this many days
  -- a daily job nulls site_check_ins.gps_lat/lng on rows older than the window;
  -- the check-in row itself is retained.
  gps_retention_days int not null default 30,
  -- When true, completed reminders remain on the Owner's calendar (greyed/marked done).
  -- When false (default), completed reminders are removed from the calendar.
  completed_reminders_visible boolean not null default false,
  created_at timestamptz default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  full_name text not null,
  phone text,
  email text,
  role text not null check (role in
    ('owner','admin','project_manager','team_member','site_engineer','accountant')),
  -- Free-text role label preserved from the source system (e.g. "Junior Architect",
  -- "Draftsperson"). Used for display only; access decisions use `role` + capabilities.
  role_label text,
  experience_years numeric(4,1),       -- from team performance file
  skill_score int check (skill_score between 0 and 10),  -- their 0–10 rating
  salary_inr numeric(12,2),            -- optional, owner-only via RLS
  join_date date,
  is_active boolean default true,
  -- MFA state (Section 12.1). Owner and Admin roles are required to enable MFA
  -- before they can perform privileged actions; enforced in middleware.
  mfa_enrolled_at timestamptz,
  -- Invitation flow (Section 12.2). When the admin sends an invite, a 32-byte
  -- random token is generated. Only its sha-256 hash is stored here; the
  -- plaintext is sent only in the email link. On accept, the route handler
  -- hashes the URL token and compares to invitation_token_hash.
  invitation_token_hash bytea,
  invitation_expires_at timestamptz,
  invitation_accepted_at timestamptz,
  last_login_at timestamptz,
  password_last_changed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references users(id),
  deleted_at timestamptz
);

-- Per-user active sessions (in addition to Supabase auth tracking).
-- Allows Owner/Admin to revoke a specific device. See Section 12.1.
create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),     -- denormalized from users for RLS uniformity
  user_id uuid not null references users(id) on delete cascade,
  device_label text,                  -- e.g. "Chrome on macOS"
  ip_address inet,
  user_agent text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  revoked_at timestamptz,
  revoked_by uuid references users(id)
);

-- The Access Matrix. Owner sets these.
-- scope_project_id FK to projects is added below (after projects table is created).
create table user_capabilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id) on delete cascade,
  capability text not null,           -- e.g. 'customer_payments:view'
  granted boolean not null default true,
  scope_project_id uuid,              -- FK added below; null = all projects
  granted_by uuid references users(id),
  granted_at timestamptz default now(),
  unique (user_id, capability, scope_project_id)
);

-- ============================================================
-- PROJECTS
-- ============================================================

-- Projects: forward references to `customers` are deferred to ALTER TABLE ADD CONSTRAINT
-- after the customers table is created, to allow the schema to load top-down.
create table projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  slug text not null,
  customer_id uuid,                  -- FK added below after customers table exists
  project_type text check (project_type in
    ('residential','commercial','industrial','institutional','interior','urban')),
  -- Two-stage lifecycle (v1.3). Site engineer surface and material/expense
  -- tracking are gated to current_stage = 'execution'.
  current_stage text not null default 'design'
    check (current_stage in ('design','execution')),
  stage_changed_at timestamptz,
  stage_changed_by uuid references users(id),
  site_location text,
  status text not null default 'planning'
    check (status in ('planning','active','on_hold','completed','cancelled')),
  on_hold_reason text,                -- required when status = 'on_hold' (enforced by trigger; see Section 5.6)
  budget_total numeric(14,2),
  estimated_work_hours int,
  estimated_duration_days int,
  start_date date,
  expected_end_date date,
  actual_start_date date,
  actual_end_date date,
  -- Customer portal: hash is generated only on explicit Owner action.
  customer_portal_hash text unique,
  customer_portal_hash_generated_at timestamptz,
  customer_portal_enabled boolean default false,
  drive_folder_url text,
  share_drive_with_customer boolean default false,
  -- Migration aid: marks projects whose names are placeholders ("Project 2" etc.)
  -- pending Owner rename. Set during migration; cleared by Owner. Not used post-launch.
  is_placeholder boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references users(id),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  unique (tenant_id, slug)
);

-- Work log — replaces their "Actual Work (hours)" column with daily granularity.
-- Aggregating these gives you the same number their .xls had, plus who logged when.
-- tenant_id is denormalized via trigger from project_id; required for RLS and audit uniformity.
create table work_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id),
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  worked_on date not null default current_date,
  notes text,
  -- Append-only correction pattern (Section 5.6). To revise an entry, insert a
  -- new row referencing the original; the original is flipped to is_corrected = true
  -- by trigger. Reporting views read both rows and apply the delta.
  corrects_work_log_id uuid references work_log(id),
  is_corrected boolean default false,
  created_at timestamptz default now(),
  created_by uuid references users(id),
  deleted_at timestamptz
);

create index work_log_project_date_idx on work_log(project_id, worked_on);
create index work_log_corrects_idx on work_log(corrects_work_log_id) where corrects_work_log_id is not null;

-- Variance is computed, not stored. Always truthful.
create or replace view v_project_variance as
select
  p.id as project_id,
  p.tenant_id,
  p.estimated_work_hours,
  coalesce((select sum(hours) from work_log wl where wl.project_id = p.id), 0) as actual_hours,
  case
    when p.estimated_work_hours is null or p.estimated_work_hours = 0 then null
    else round(
      (coalesce((select sum(hours) from work_log wl where wl.project_id = p.id), 0)
       - p.estimated_work_hours) * 100.0 / p.estimated_work_hours, 2)
  end as hours_variance_pct,
  p.estimated_duration_days,
  case
    when p.actual_end_date is not null and p.actual_start_date is not null
      then p.actual_end_date - p.actual_start_date
    when p.actual_start_date is not null
      then current_date - p.actual_start_date
    else null
  end as actual_duration_days
from projects p
where p.deleted_at is null;

create table project_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_on_project text not null,      -- 'pm', 'site_engineer', 'team_member', 'lead_architect', 'design_support', 'drafting', 'coordination'
  contribution_pct numeric(5,2) check (contribution_pct between 0 and 100),
  assigned_at timestamptz default now(),
  assigned_by uuid references users(id),
  unique (project_id, user_id, role_on_project)
);

-- Per-project, contributions must sum to <= 100%. Enforced by trigger.
create or replace function check_contribution_sum() returns trigger language plpgsql as $$
declare total numeric;
begin
  select coalesce(sum(contribution_pct), 0) into total
    from project_assignments
    where project_id = new.project_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if total + coalesce(new.contribution_pct, 0) > 100 then
    raise exception 'Total contribution_pct for project % would exceed 100%% (current: %, attempting to add: %)',
      new.project_id, total, new.contribution_pct;
  end if;
  return new;
end $$;

create trigger trg_check_contribution_sum
  before insert or update on project_assignments
  for each row execute function check_contribution_sum();

-- ============================================================
-- TIMELINE & CHECKPOINTS
-- ============================================================

create table project_checkpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  sequence_order int not null,
  due_date date not null,
  completed_at timestamptz,
  requires_approval boolean default false,
  approved_at timestamptz,
  approved_by uuid references users(id),
  -- FK added below after payment_schedule table is created.
  triggers_payment_id uuid,
  created_at timestamptz default now()
);

-- Status is computed, not stored.
-- Postgres rejects generated columns with non-immutable expressions
-- (current_date is STABLE, not IMMUTABLE), and even if it accepted them, a
-- stored generated column would not refresh as the date advances. The view
-- below derives status on read, which is correct and free.
create or replace view v_project_checkpoint_status as
select
  pc.*,
  case
    when pc.completed_at is not null then 'complete'
    when pc.due_date < current_date then 'overdue'
    else 'pending'
  end as status
from project_checkpoints pc;

-- Reusable lifecycle presets. Owner can create new ones; one preset ships seeded.
create table checkpoint_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,                 -- 'Standard Architectural Lifecycle'
  description text,
  is_system boolean default false,    -- true for the seeded preset; cannot be deleted
  created_at timestamptz default now(),
  created_by uuid references users(id)
);

create table checkpoint_template_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  template_id uuid not null references checkpoint_templates(id) on delete cascade,
  sequence_order int not null,
  name text not null,
  default_offset_days int,            -- days from project start; null = user sets per project
  requires_approval boolean default false,
  default_payment_pct numeric(5,2),   -- optional: % of project budget paid at this milestone
  unique (template_id, sequence_order)
);

-- Seed inserts for the Standard Architectural Lifecycle preset and the
-- Drawing Register table preset are NOT performed inline. They live in
-- /db/seed.sql and run after schema creation, parameterized by the tenant id
-- created during the Phase 0 onboarding migration. Inline seed values were
-- removed in v2.0 because they prevented the schema file from being a clean,
-- replayable artifact. See Section 5.0 for the migration order convention.

-- The same applies to the Drawing Register table preset (table_presets and
-- friends). Seeds live in /db/seed.sql.

-- Application path: when creating a project, the project creation handler
-- copies template_items into project_checkpoints with project_id set, OR the
-- user builds custom milestones from scratch. After copying, there is no link
-- back to the template — projects own their own checkpoints.

create table checkpoint_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  checkpoint_id uuid not null references project_checkpoints(id) on delete cascade,
  description text not null,
  is_complete boolean default false,
  completed_by uuid references users(id),
  completed_at timestamptz,
  photo_url text,
  notes text
);

-- ============================================================
-- ENQUIRIES (pre-customer pipeline) & CUSTOMERS
-- ============================================================
-- Note: "enquiries" is the v1.3 rename of what v1.0 called "clients".
-- The owner uses this term operationally; the public intake form also
-- writes here.

create table enquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  phone text,
  phone_normalized text,              -- E.164-normalized via libphonenumber for dedupe
  email text,
  source text check (source in
    ('referral','website','whatsapp','instagram','youtube','walk_in','other')),
  status text not null default 'new' check (status in
    ('new','quotation_sent','awaiting_approval','closed_for_discussion','converted','lost')),
  message text,
  created_via text default 'manual'
    check (created_via in ('manual','public_form')),
  referrer_url text,
  ip_address inet,
  -- FK added below after customers table is created.
  converted_to_customer_id uuid,
  created_at timestamptz default now(),
  created_by uuid references users(id)
);

create index enquiries_phone_normalized_idx on enquiries(phone_normalized) where phone_normalized is not null;

create table enquiry_remarks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  remark text not null,
  created_by uuid not null references users(id),
  created_at timestamptz default now()
);

-- Reminders attach to either an enquiry OR a customer. Same mechanism reused
-- for follow-ups and meetings post-conversion. Each reminder automatically
-- emits a private_owner calendar_events row via trigger (see below).
create table enquiry_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  enquiry_id uuid references enquiries(id) on delete cascade,
  -- FK to customers added below after customers table is created.
  customer_id uuid,
  user_id uuid not null references users(id),
  remind_at timestamptz not null,
  message text,
  priority text check (priority in ('low','normal','high','critical')),
  is_done boolean default false,
  done_at timestamptz,
  created_at timestamptz default now(),
  -- Exactly one of enquiry_id or customer_id must be set.
  check ((enquiry_id is null) <> (customer_id is null))
);

-- Trigger: keep calendar_events in sync with reminders.
-- INSERT  → create a private_owner calendar event linked back to this reminder.
-- UPDATE  → update title/time on the linked event; if marked done, optionally remove.
-- DELETE  → cascade-remove the linked event.
-- Linkage uses calendar_events.source_type = 'reminder' + source_id = reminder.id.
create or replace function sync_reminder_to_calendar() returns trigger language plpgsql as $$
declare
  v_title text;
  v_remove_when_done boolean;
begin
  if tg_op = 'DELETE' then
    delete from calendar_events
      where source_type = 'reminder' and source_id = old.id;
    return old;
  end if;

  v_title := coalesce(new.message, 'Reminder');

  if tg_op = 'INSERT' then
    insert into calendar_events (
      tenant_id, enquiry_id, customer_id, title, starts_at,
      visibility, source_type, source_id, created_by
    ) values (
      new.tenant_id, new.enquiry_id, new.customer_id, v_title, new.remind_at,
      'private_owner', 'reminder', new.id, new.user_id
    );
    return new;
  end if;

  -- UPDATE
  if new.is_done and not old.is_done then
    select completed_reminders_visible into v_remove_when_done
      from tenants where id = new.tenant_id;
    if not coalesce(v_remove_when_done, false) then
      delete from calendar_events
        where source_type = 'reminder' and source_id = new.id;
      return new;
    end if;
  end if;

  update calendar_events
    set title = v_title,
        starts_at = new.remind_at,
        description = case when new.is_done then '[completed] ' || coalesce(new.message,'') else new.message end
    where source_type = 'reminder' and source_id = new.id;

  return new;
end $$;

create trigger trg_sync_reminder_to_calendar
  after insert or update or delete on enquiry_reminders
  for each row execute function sync_reminder_to_calendar();

-- Tenant-level enquiry intake configuration (single tenant in v1, but tenant-scoped
-- for forward compatibility). Drives the public form URL.
create table enquiry_intake (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  intake_slug text unique not null,   -- /enquire/<intake_slug>
  is_enabled boolean default true,
  rotated_at timestamptz default now(),
  ip_rate_limit_per_hour int default 5,
  phone_soft_block_hours int default 24
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  phone text,
  email text,
  address text,
  created_from_enquiry_id uuid references enquiries(id),
  created_at timestamptz default now()
);

-- ============================================================
-- MATERIALS — interconnected ledger
-- ============================================================

create table material_plan (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  material_name text not null,
  unit text not null,                 -- 'bag', 'kg', 'cubic_m'
  planned_quantity numeric(12,2) not null check (planned_quantity > 0),
  planned_for_date date,              -- daily plans
  planned_for_week date,              -- monday of the week
  created_by uuid references users(id), -- usually PM
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table material_consumption (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  material_plan_id uuid references material_plan(id),
  material_name text not null,        -- denormalized for ad-hoc consumption
  unit text not null,
  quantity_used numeric(12,2) not null check (quantity_used > 0),
  is_excess boolean default false,
  excess_reason text,
  consumed_on date not null default current_date,
  recorded_by uuid not null references users(id),
  -- FK to expenses added below; expenses table is created next.
  -- Material consumption rolls up to a checkpoint via the linked expense, or
  -- via plan/date aggregation. There is intentionally no `linked_checkpoint_id`
  -- column — see Section 6 ledger rules.
  expense_id uuid,
  -- Append-only correction pattern (Section 5.6).
  corrects_material_consumption_id uuid references material_consumption(id),
  is_corrected boolean default false,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create index material_consumption_corrects_idx
  on material_consumption(corrects_material_consumption_id)
  where corrects_material_consumption_id is not null;

-- ============================================================
-- EXPENSES — interconnected ledger
-- ============================================================

create table expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (category in ('labour','transport','materials','misc')),
  description text,
  is_miscellaneous boolean default false,
  receipt_url text,
  spent_on date not null default current_date,
  recorded_by uuid not null references users(id),
  -- Approval lifecycle (Section 5.6).
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  rejection_reason text,
  linked_material_consumption_id uuid references material_consumption(id),
  linked_checkpoint_id uuid references project_checkpoints(id),
  created_at timestamptz default now(),
  -- Append-only correction pattern: corrections reference the original via this FK
  -- and are themselves rows. Original is never updated. See Section 5.6.
  corrects_expense_id uuid references expenses(id),
  is_corrected boolean default false,
  deleted_at timestamptz
);

-- ============================================================
-- CUSTOMER PAYMENTS — owner/accountant only by default
-- ============================================================

create table payment_schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  milestone_name text not null,
  amount_due numeric(14,2) not null,
  due_date date not null,
  sequence_order int not null,
  is_paid boolean default false,
  created_at timestamptz default now()
);

create table payment_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  payment_schedule_id uuid references payment_schedule(id),
  project_id uuid not null references projects(id),
  amount_paid numeric(14,2) not null,
  paid_on date not null,
  method text,                        -- 'bank','upi','cheque','cash'
  reference text,
  recorded_by uuid not null references users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- COMMUNICATION & MEDIA
-- ============================================================

create table updates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid not null references users(id),
  author_role_on_project text not null,  -- denormalized for filter
  update_type text not null check (update_type in
    ('note','image','drawing','progress','remark','material','expense')),
  body text,
  created_at timestamptz default now()
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  storage_path text not null,         -- supabase storage key
  bucket text not null default 'media-private'
    check (bucket in ('media-private','media-customer-public')),
  kind text not null check (kind in ('site_image','drawing','receipt','document')),
  uploaded_by uuid not null references users(id),
  taken_at timestamptz,
  visible_to_customer boolean default false,  -- owner toggles this
  linked_update_id uuid references updates(id),
  linked_checkpoint_item_id uuid references checkpoint_items(id),
  -- Malware scan status (Section 12.4). Uploads start as 'pending'; until the
  -- scan completes successfully (or is_clean = true), the row is excluded from
  -- every customer-facing query and from gallery surfaces. In v1 the scanner
  -- is operator-driven (Owner reviews and flips the flag) — automated ClamAV
  -- integration is deferred to v1.1 (resolved scope cut, see Section 13).
  scan_status text not null default 'pending'
    check (scan_status in ('pending','clean','infected','error')),
  is_clean boolean generated always as (scan_status = 'clean') stored,
  scanned_at timestamptz,
  scan_error text,
  created_at timestamptz default now()
);

create index media_assets_project_kind_idx on media_assets(project_id, kind);
create index media_assets_unscanned_idx on media_assets(scan_status) where scan_status <> 'clean';

create table bridge_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid not null references users(id),
  message_type text default 'text' check (message_type in
    ('text','image','drawing_ref','material_request','clarification')),
  body text,
  structured_payload jsonb,           -- for material_request, clarification
  created_at timestamptz default now()
);

-- ============================================================
-- DAILY TASK LOG — team-member-reported daily work
-- ============================================================
-- Separate from project progress (which the PM/site engineer drives).
-- Used for self-reported team performance tracking; see Section 3.3.

create table team_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id),     -- optional; tasks may be non-project
  task_date date not null default current_date,
  description text not null check (length(description) between 1 and 200),
  is_done boolean default false,
  done_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index team_daily_tasks_user_date_idx on team_daily_tasks(user_id, task_date);

-- CSV export is performed via a server route that streams from this table.
-- Each user can export their own; Owner can export any.

-- ============================================================
-- OWNER BROADCASTS — one-to-many announcements
-- ============================================================

create table owner_broadcasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  author_id uuid not null references users(id),  -- typically owner; capability-gated
  body text not null,
  attachment_url text,
  created_at timestamptz default now()
);

create table owner_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  broadcast_id uuid not null references owner_broadcasts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  is_acknowledged boolean default false,
  acknowledged_at timestamptz,
  unique (broadcast_id, user_id)
);

-- ============================================================
-- SITE CHECK-INS — site engineer presence confirmation
-- ============================================================

create table site_check_ins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  project_id uuid not null references projects(id),
  checked_in_at timestamptz default now(),
  gps_lat numeric(9,6),
  gps_lng numeric(9,6),
  notes text
);

create index site_check_ins_project_time_idx on site_check_ins(project_id, checked_in_at desc);

-- ============================================================
-- PROJECT EXECUTION TABLES — typed structured checklists
-- ============================================================
-- Modeled on the drawing-register table the client provided. Two parallel
-- usages: one owned by Team Members (design-side), one by Site Engineers
-- (execution-side). Schema is shared; ownership is determined by the
-- table_owner_role column.

-- A project can have N tables. A table groups rows into ordered sections.
create table project_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,                 -- e.g. 'Drawing Register'
  table_owner_role text not null check (table_owner_role in ('team_member','site_engineer')),
  description text,
  source_preset_id uuid,              -- references table_presets(id); copied not linked
  display_order int not null default 0,
  created_at timestamptz default now(),
  created_by uuid references users(id),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Columns are typed and ordered. Adding/removing/reordering is editing this table.
create table project_table_columns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_table_id uuid not null references project_tables(id) on delete cascade,
  name text not null,                 -- 'Drawn', 'Checked', 'Revision', 'Date'
  column_kind text not null check (column_kind in
    ('serial','text','checkbox','date','revision_text')),
  display_order int not null,
  is_required boolean default false,
  unique (project_table_id, display_order)
);

-- Sections group rows visually and semantically (e.g. 'Ground Floor Set').
create table project_table_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_table_id uuid not null references project_tables(id) on delete cascade,
  name text not null,
  display_order int not null,
  unique (project_table_id, display_order)
);

-- Rows belong to a section (or the implicit top-level section). The cells JSONB
-- stores values keyed by column id: e.g. {"<col_uuid>": true, "<col_uuid>": "..."}.
-- We use JSONB rather than a normalized cell table because (a) the column set is
-- per-table and small, (b) the row is the natural unit of read/write, and (c) the
-- audit log already captures full row snapshots, making revision history straightforward.
create table project_table_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_table_id uuid not null references project_tables(id) on delete cascade,
  section_id uuid references project_table_sections(id) on delete set null,
  display_order int not null,
  cells jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  created_by uuid references users(id),
  updated_at timestamptz default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz
);

create index project_table_rows_table_order_idx on project_table_rows(project_table_id, display_order);

-- Per-row revision history. The client's "R1- Column size changed to 9x15" annotation
-- is an entry here. New row edits append a revision; the row itself reflects current state.
create table project_table_row_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  row_id uuid not null references project_table_rows(id) on delete cascade,
  revision_number int not null,        -- 1, 2, 3 ...
  cells_before jsonb,
  cells_after jsonb,
  change_note text,                    -- 'Column size changed to 9x15'
  changed_by uuid references users(id),
  changed_at timestamptz default now(),
  unique (row_id, revision_number)
);

-- ============================================================
-- TABLE PRESETS — tenant-level templates for project execution tables
-- ============================================================
-- Ships with one default preset (Drawing Register). Owner can create more,
-- name them, and edit any part (columns, sections, rows). When a preset is
-- applied to a project, its structure is *copied* into project_tables et al.
-- After copying, there is no link back — the project table owns its own state.

create table table_presets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  description text,
  table_owner_role text not null check (table_owner_role in ('team_member','site_engineer')),
  is_system boolean default false,    -- the seeded default; cannot be deleted
  is_default_for_role boolean default false,
  created_at timestamptz default now(),
  created_by uuid references users(id),
  unique (tenant_id, name)
);

create table table_preset_columns (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references table_presets(id) on delete cascade,
  name text not null,
  column_kind text not null check (column_kind in
    ('serial','text','checkbox','date','revision_text')),
  display_order int not null,
  is_required boolean default false,
  unique (preset_id, display_order)
);

create table table_preset_sections (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references table_presets(id) on delete cascade,
  name text not null,
  display_order int not null,
  unique (preset_id, display_order)
);

create table table_preset_rows (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references table_presets(id) on delete cascade,
  section_id uuid references table_preset_sections(id) on delete set null,
  display_order int not null,
  cells jsonb not null default '{}'::jsonb
);

-- Drawing Register preset (seeded in /db/seed.sql).
-- Structure: columns Sl No (serial) / Drawing Description (text) / Drawn (checkbox)
--   / Checked (checkbox) / Revision (revision_text) / Issued to Site (checkbox) / Date (date).
-- Sections: Structural Details Upto Foundation Lvl, Ground Floor Set,
--   Structural Details Upto Ground Floor Slab, Working Details Upto Ground Floor Slab.
-- Initial rows (from the client's reference image) are seeded as starter content.
-- The preset is marked is_system = true and is_default_for_role = true.

-- ============================================================
-- CALENDAR
-- ============================================================

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid references projects(id),
  enquiry_id uuid references enquiries(id),     -- owner-only events
  customer_id uuid references customers(id),    -- owner-only events post-conversion
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  visibility text not null default 'project' check (visibility in
    ('private_owner','assigned_user','project','tenant')),
  assigned_user_id uuid references users(id),
  source_type text,                   -- 'task','reminder','checkpoint','payment_due','meeting'
  source_id uuid,                     -- deep link target
  created_at timestamptz default now(),
  created_by uuid references users(id),
  -- Visibility ↔ scope coherence. Private_owner events MUST attach to an
  -- enquiry or customer (never a project). Project events MUST attach to a
  -- project. Assigned_user events MUST have an assigned user.
  constraint calendar_events_visibility_scope_chk check (
    case visibility
      when 'private_owner' then
        project_id is null
        and (enquiry_id is not null or customer_id is not null)
      when 'project' then project_id is not null
      when 'assigned_user' then assigned_user_id is not null
      when 'tenant' then true
    end
  )
);

-- RLS policy (illustrative — full policy set in /db/policies/calendar_events.sql):
-- A user sees a calendar_events row when ANY of the following:
--   (a) visibility = 'tenant' and same tenant_id
--   (b) visibility = 'project' and they have access to projects.id
--   (c) visibility = 'assigned_user' and assigned_user_id = auth.uid()
--   (d) visibility = 'private_owner' and they have capability 'enquiry:view'
--       (which is owner-default and only the Owner has it unless explicitly granted)
-- This means private_owner events are invisible to admins, PMs, accountants,
-- team members, site engineers — everyone except the Owner — by default.

-- ============================================================
-- TEAM PERFORMANCE — monthly KPI inputs and derived scores
-- ============================================================

-- Monthly per-employee inputs. One row per (user, month).
-- Columns map directly to the Performance_Input sheet of their team performance file.
create table team_performance_monthly (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id) on delete cascade,
  period_month date not null,         -- first of the month, e.g. '2026-01-01'
  drawings_completed int default 0,
  errors int default 0,
  revisions int default 0,
  deadline_met_pct numeric(5,2),      -- 0–100
  client_rating numeric(3,1),         -- 1–10
  site_delay_days int default 0,
  notes text,
  recorded_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, period_month)
);

-- Derived KPI scores. The exact weighting is tenant-configurable later; v1 uses
-- the same shape as their existing KPI_Scoring sheet.
create or replace view v_kpi_scores as
select
  tpm.user_id,
  tpm.period_month,
  -- Efficiency: drawings_completed normalized (placeholder — owner can rescale)
  least(100, tpm.drawings_completed * 2) as efficiency_score,
  -- Quality: penalize errors and revisions
  greatest(0, 100 - (tpm.errors * 4) - (tpm.revisions * 2)) as quality_score,
  -- Delivery: deadline_met_pct adjusted for site delays
  greatest(0, coalesce(tpm.deadline_met_pct, 0) - (tpm.site_delay_days * 2)) as delivery_score,
  -- Overall: weighted average. Default weights match their sheet's relative magnitudes.
  round(
    (least(100, tpm.drawings_completed * 2)) * 0.30
    + (greatest(0, 100 - (tpm.errors * 4) - (tpm.revisions * 2))) * 0.40
    + (greatest(0, coalesce(tpm.deadline_met_pct, 0) - (tpm.site_delay_days * 2))) * 0.30
  , 2) as overall_kpi_score
from team_performance_monthly tpm;

-- Growth Dashboard equivalent: revenue contribution per employee per month,
-- derived from project values × their contribution_pct on each project.
create or replace view v_employee_revenue_contribution as
select
  pa.user_id,
  date_trunc('month', current_date)::date as period_month,
  sum(p.budget_total * pa.contribution_pct / 100.0) as revenue_contribution
from project_assignments pa
  join projects p on p.id = pa.project_id
where p.deleted_at is null
  and p.status in ('active','completed')
group by pa.user_id;

-- ============================================================
-- AUDIT LOG — append-only
-- ============================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  actor_id uuid references users(id),
  action text not null,               -- 'insert','update','delete','soft_delete','hard_purge'
  resource_type text not null,
  resource_id uuid,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  request_id text,                    -- correlation id from middleware
  -- Hash chaining for tamper evidence (Section 10).
  -- prev_hash = sha256(prev row's row_hash), or zero-hash for the first row per tenant.
  -- row_hash = sha256(prev_hash || canonical_jsonb(this_row_minus_hashes))
  prev_hash bytea,
  row_hash bytea,
  occurred_at timestamptz not null default now()
);

create index audit_log_tenant_time_idx on audit_log(tenant_id, occurred_at desc);
create index audit_log_resource_idx on audit_log(resource_type, resource_id);

-- ============================================================
-- AUDIT EXPORT LOG — record of weekly off-site exports (Section 12.6)
-- ============================================================
-- One row per export run. Used to verify that the chain on disk in R2/S3
-- matches the live chain on a subsequent integrity check.

create table audit_export_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  exported_at timestamptz not null default now(),
  -- Range of audit_log rows included in this export, by occurred_at.
  range_start timestamptz not null,
  range_end timestamptz not null,
  row_count bigint not null,
  -- The first/last row hashes inside the range, captured for chain continuity checks.
  first_row_hash bytea,
  last_row_hash bytea,
  -- SHA-256 of the canonicalized export file contents.
  export_sha256 bytea not null,
  -- Where the export landed (e.g. 's3://bucket/path' or 'r2://bucket/path').
  export_uri text not null,
  -- Detached signature over export_sha256, produced with a key held outside
  -- the Supabase project (Section 10.3). Stored as armoured text.
  export_signature text,
  exported_by uuid references users(id),
  notes text
);

create index audit_export_log_tenant_time_idx
  on audit_export_log(tenant_id, exported_at desc);

-- ============================================================
-- FEATURE FLAGS — risky changes ship dark (Section 11.2)
-- ============================================================
-- Read at request boot. Per-tenant gating; system-wide flags use a sentinel
-- tenant_id of all-zeros that the resolver treats as a fallback. A flag whose
-- row is missing for a tenant resolves to is_enabled = false.

create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  flag_key text not null,             -- e.g. 'web_push_v1', 'drive_sync_auto'
  is_enabled boolean not null default false,
  rollout_pct int default 0 check (rollout_pct between 0 and 100),
  description text,
  updated_at timestamptz default now(),
  updated_by uuid references users(id),
  unique (tenant_id, flag_key)
);
```

### 5.2.1 Deferred FK constraints

After all tables have been created, the following constraints are added. This block sits at the bottom of the migration file.

```sql
-- projects ↔ customers
alter table projects
  add constraint projects_customer_id_fk
  foreign key (customer_id) references customers(id);

-- user_capabilities → projects
alter table user_capabilities
  add constraint user_capabilities_scope_project_id_fk
  foreign key (scope_project_id) references projects(id) on delete cascade;

-- project_checkpoints → payment_schedule
alter table project_checkpoints
  add constraint project_checkpoints_triggers_payment_id_fk
  foreign key (triggers_payment_id) references payment_schedule(id) on delete set null;

-- enquiries → customers
alter table enquiries
  add constraint enquiries_converted_to_customer_id_fk
  foreign key (converted_to_customer_id) references customers(id) on delete set null;

-- enquiry_reminders → customers
alter table enquiry_reminders
  add constraint enquiry_reminders_customer_id_fk
  foreign key (customer_id) references customers(id) on delete cascade;

-- material_consumption ↔ expenses (circular)
alter table material_consumption
  add constraint material_consumption_expense_id_fk
  foreign key (expense_id) references expenses(id) on delete set null;
```

### 5.2.2 Tenant denormalization trigger

Every project-scoped domain table carries `tenant_id` as `not null`. This is denormalized — the canonical owner of `tenant_id` is `projects` (or, for non-project rows, the parent table). To keep app code from having to populate it on every insert, a single BEFORE INSERT trigger derives `tenant_id` from the natural parent and writes it into `NEW`.

This pays off in three places:

- **Audit trigger** can read `NEW.tenant_id` / `OLD.tenant_id` directly without per-table joins (see Section 10).
- **RLS template** is uniform across every table — every policy compares to a column that is guaranteed to exist (see Section 5.5).
- **Cross-tenant containment** is provable from the schema, not from app convention.

If the caller supplies `tenant_id` explicitly, the trigger validates it matches the derived value and rejects mismatches.

```sql
-- Derive tenant_id from the parent project (for project-scoped tables).
create or replace function set_tenant_from_project() returns trigger
  language plpgsql
  set search_path = pg_catalog, public
as $$
declare
  v_derived uuid;
begin
  select tenant_id into v_derived
    from projects where id = new.project_id;

  if v_derived is null then
    raise exception 'set_tenant_from_project: project % not found or has no tenant',
      new.project_id;
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_derived;
  elsif new.tenant_id <> v_derived then
    raise exception 'tenant_id mismatch: caller passed %, project belongs to %',
      new.tenant_id, v_derived;
  end if;

  return new;
end $$;

-- Derive tenant_id from a sibling table that already carries it.
-- Used for tables whose natural parent is not `projects` directly
-- (e.g. checkpoint_items → project_checkpoints, project_table_columns → project_tables).
create or replace function set_tenant_from_parent(
  p_parent_table regclass,
  p_parent_id_column text,
  p_parent_value uuid
) returns uuid
  language plpgsql
  stable
  set search_path = pg_catalog, public
as $$
declare
  v_tenant uuid;
begin
  execute format(
    'select tenant_id from %s where %I = $1',
    p_parent_table, p_parent_id_column
  ) into v_tenant using p_parent_value;
  return v_tenant;
end $$;

-- Per-table BEFORE INSERT triggers. The trigger function above is one shape;
-- tables whose parent is not `projects` use a small per-table wrapper that
-- calls set_tenant_from_parent() with the right parent table/column.

-- Project-rooted tables (parent = projects.project_id):
create trigger trg_tenant_work_log              before insert on work_log              for each row execute function set_tenant_from_project();
create trigger trg_tenant_project_assignments   before insert on project_assignments   for each row execute function set_tenant_from_project();
create trigger trg_tenant_project_checkpoints   before insert on project_checkpoints   for each row execute function set_tenant_from_project();
create trigger trg_tenant_material_plan         before insert on material_plan         for each row execute function set_tenant_from_project();
create trigger trg_tenant_material_consumption  before insert on material_consumption  for each row execute function set_tenant_from_project();
create trigger trg_tenant_expenses              before insert on expenses              for each row execute function set_tenant_from_project();
create trigger trg_tenant_payment_schedule      before insert on payment_schedule      for each row execute function set_tenant_from_project();
create trigger trg_tenant_payment_records       before insert on payment_records       for each row execute function set_tenant_from_project();
create trigger trg_tenant_updates               before insert on updates               for each row execute function set_tenant_from_project();
create trigger trg_tenant_media_assets          before insert on media_assets          for each row execute function set_tenant_from_project();
create trigger trg_tenant_bridge_messages       before insert on bridge_messages       for each row execute function set_tenant_from_project();
create trigger trg_tenant_project_tables        before insert on project_tables        for each row execute function set_tenant_from_project();

-- Sibling-rooted tables (parent != projects). Each gets a tiny wrapper.
create or replace function set_tenant_from_checkpoint() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := (select tenant_id from project_checkpoints where id = new.checkpoint_id);
  end if;
  if new.tenant_id is null then
    raise exception 'parent checkpoint % not found', new.checkpoint_id;
  end if;
  return new;
end $$;
create trigger trg_tenant_checkpoint_items before insert on checkpoint_items
  for each row execute function set_tenant_from_checkpoint();

create or replace function set_tenant_from_template() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := (select tenant_id from checkpoint_templates where id = new.template_id);
  end if;
  if new.tenant_id is null then
    raise exception 'parent template % not found', new.template_id;
  end if;
  return new;
end $$;
create trigger trg_tenant_checkpoint_template_items before insert on checkpoint_template_items
  for each row execute function set_tenant_from_template();

create or replace function set_tenant_from_enquiry() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := (select tenant_id from enquiries where id = new.enquiry_id);
  end if;
  return new;
end $$;
create trigger trg_tenant_enquiry_remarks before insert on enquiry_remarks
  for each row execute function set_tenant_from_enquiry();

create or replace function set_tenant_from_project_table() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := (select tenant_id from project_tables where id = new.project_table_id);
  end if;
  return new;
end $$;
create trigger trg_tenant_project_table_columns  before insert on project_table_columns  for each row execute function set_tenant_from_project_table();
create trigger trg_tenant_project_table_sections before insert on project_table_sections for each row execute function set_tenant_from_project_table();
create trigger trg_tenant_project_table_rows     before insert on project_table_rows     for each row execute function set_tenant_from_project_table();

create or replace function set_tenant_from_table_row() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := (select tenant_id from project_table_rows where id = new.row_id);
  end if;
  return new;
end $$;
create trigger trg_tenant_project_table_row_revisions before insert on project_table_row_revisions
  for each row execute function set_tenant_from_table_row();

create or replace function set_tenant_from_broadcast() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := (select tenant_id from owner_broadcasts where id = new.broadcast_id);
  end if;
  return new;
end $$;
create trigger trg_tenant_owner_broadcast_recipients before insert on owner_broadcast_recipients
  for each row execute function set_tenant_from_broadcast();

create or replace function set_tenant_from_user() returns trigger
  language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := (select tenant_id from users where id = new.user_id);
  end if;
  return new;
end $$;
create trigger trg_tenant_user_sessions before insert on user_sessions
  for each row execute function set_tenant_from_user();
```

After these triggers are installed, app code may insert rows with `tenant_id` left null on any project-scoped table; the trigger fills it in. Inserts into `tenants`, `users`, `projects`, `enquiries`, `customers`, `enquiry_intake`, `enquiry_reminders`, `team_daily_tasks`, `owner_broadcasts`, `site_check_ins`, `table_presets`, `calendar_events`, `team_performance_monthly`, `notifications`, `audit_log`, `audit_export_log`, `feature_flags`, `public_abuse_log`, `public_rate_limit_buckets` (Section 5.4.2) require an explicit `tenant_id` because they have no canonical parent that carries it.

### 5.3 RLS — capabilities not roles

The access matrix is the source of truth for "who can do what". Policies query the matrix, not the role column directly. This makes adding a new role a no-op for the policies.

The `has_capability()` helper is the single function that policies call. It must check, for every call:

- The caller is authenticated (`auth.uid() is not null`).
- The caller is active (`users.is_active = true` and `users.deleted_at is null`).
- The caller belongs to the same tenant as the resource being queried.
- The capability is granted (`granted = true`).
- The scope is satisfied (capability scoped to all projects, OR scoped to the specific project).

```sql
-- Hardened capability check. Used by every policy in the system.
-- SECURITY DEFINER is NOT used here — RLS must apply transitively.
create or replace function has_capability(
  p_capability text,
  p_project_id uuid default null,
  p_tenant_id uuid default null
) returns boolean
  language sql
  stable
  -- search_path locked to defeat search-path attacks even though this is not
  -- security definer; future-proofs against schema additions.
  set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from user_capabilities uc
    join users u on u.id = uc.user_id
    where uc.user_id = auth.uid()
      and uc.capability = p_capability
      and uc.granted = true
      and u.is_active = true
      and u.deleted_at is null
      -- Tenant containment.
      and (p_tenant_id is null or u.tenant_id = p_tenant_id)
      and (p_tenant_id is null or uc.tenant_id = p_tenant_id)
      -- Scope match.
      and (uc.scope_project_id is null or uc.scope_project_id = p_project_id)
  );
$$;

-- Project assignment helper, used in conjunction with has_capability for
-- per-project access checks.
create or replace function is_assigned_to_project(p_project_id uuid)
returns boolean
  language sql
  stable
  set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from project_assignments pa
    join users u on u.id = pa.user_id
    join projects p on p.id = pa.project_id
    where pa.project_id = p_project_id
      and pa.user_id = auth.uid()
      and u.is_active = true
      and u.deleted_at is null
      and p.deleted_at is null
  );
$$;

-- Project-stage gate. Returns true when the project is in the requested stage
-- or when the policy is stage-agnostic.
create or replace function project_in_stage(p_project_id uuid, p_stage text)
returns boolean
  language sql
  stable
  set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from projects
    where id = p_project_id
      and current_stage = p_stage
      and deleted_at is null
  );
$$;
```

The Owner is seeded with every capability at user creation. An `is_owner_immutable` trigger on `user_capabilities` rejects any DELETE or `granted = false` UPDATE targeting the Owner's rows. The Owner cannot have capabilities revoked, by themselves or anyone else.

### 5.4 Customer portal RLS and public functions

The public surface — the customer portal and the enquiry intake form — is restricted to two `SECURITY DEFINER` functions. The anon role has `EXECUTE` on these two functions and on nothing else. Both functions:

- Set `search_path` explicitly to defeat search-path injection.
- Return generic public errors (specific causes are logged, not returned).
- Log abuse events to `public_abuse_log` (Section 5.4.1).
- Are called only after a server-side validation layer (Zod schemas on the Next.js route handler) has validated input shape and length.
- For the enquiry form, are called only after a Cloudflare Turnstile challenge has been verified server-side. The Turnstile token is verified in the route handler before the function is invoked; the function does not see the token directly.

```sql
-- Customer portal: the public anon role can call this with a project hash.
-- Returns only opted-in fields. Schema-locked search_path. Generic public errors.
-- The route handler passes the request's IP / user-agent / request-id so abuse
-- log entries are forensically useful (v2.0 logged refusals without an IP).
-- The function returns storage paths and bucket names; the route handler
-- post-processes them into short-lived signed URLs (private bucket) or public
-- URLs (media-customer-public bucket). Raw paths are not exposed to the client.
create or replace function get_customer_portal(
  p_hash text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns jsonb
  language plpgsql
  security definer
  set search_path = pg_catalog, public
as $$
declare
  v_project projects%rowtype;
  v_result jsonb;
begin
  -- Length sanity check; the route handler also enforces this.
  if p_hash is null or length(p_hash) <> 16 then
    insert into public_abuse_log (kind, detail, ip, user_agent, request_id)
      values ('portal_bad_hash', jsonb_build_object('len', length(p_hash)),
              p_ip, p_user_agent, p_request_id);
    return null;
  end if;

  -- Per-IP rate limit on portal hash lookups: 60 hits per minute.
  if p_ip is not null then
    if public_rate_limit_hit(null, 'portal_hash_ip', p_ip::text, 60) > 60 then
      insert into public_abuse_log (kind, detail, ip, user_agent, request_id)
        values ('portal_rate_limited_ip', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
      return null;
    end if;
  end if;

  select * into v_project from projects
    where customer_portal_hash = p_hash
      and customer_portal_enabled = true
      and deleted_at is null;

  if not found then
    insert into public_abuse_log (kind, detail, ip, user_agent, request_id)
      values ('portal_unknown_hash', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
    return null;
  end if;

  select jsonb_build_object(
    'project_name', v_project.name,
    'progress_checkpoints', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', s.name, 'due_date', s.due_date, 'status', s.status)), '[]'::jsonb)
      from v_project_checkpoint_status s where s.project_id = v_project.id),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'milestone', milestone_name, 'amount', amount_due,
        'due_date', due_date, 'paid', is_paid)), '[]'::jsonb)
      from payment_schedule where project_id = v_project.id),
    -- Storage references, not URLs. The route handler issues signed URLs from
    -- this list. Only scan-clean assets are returned.
    'images', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'storage_path', storage_path,
        'bucket', bucket,
        'taken_at', taken_at,
        'media_asset_id', id
      )), '[]'::jsonb)
      from media_assets
      where project_id = v_project.id
        and visible_to_customer = true
        and kind in ('site_image','drawing')
        and is_clean = true),
    'drive_folder_url', case
      when v_project.share_drive_with_customer then v_project.drive_folder_url
      else null
    end
  ) into v_result;

  return v_result;
end $$;

-- Lock down access. service_role can still read at the connection level (it
-- bypasses RLS); the function is only granted to anon for the public path.
revoke all on function get_customer_portal(text, inet, text, text) from public;
grant execute on function get_customer_portal(text, inet, text, text) to anon;

-- Public enquiry intake. Called only after server-side Zod validation
-- and Turnstile verification have passed.
create or replace function submit_public_enquiry(
  p_intake_slug text,
  p_name text,
  p_phone_normalized text,            -- E.164 already-normalized in app layer
  p_phone_display text,               -- original input for display
  p_email text,
  p_source text,
  p_message text,
  p_referrer_url text,
  p_ip inet,
  p_user_agent text default null,
  p_request_id text default null
) returns uuid
  language plpgsql
  security definer
  set search_path = pg_catalog, public
as $$
declare
  v_intake enquiry_intake%rowtype;
  v_ip_hits int;
  v_phone_hits int;
  v_id uuid;
begin
  -- Defensive bounds; route handler also enforces.
  if length(coalesce(p_name,'')) = 0 or length(p_name) > 200 then
    insert into public_abuse_log (kind, detail, ip, user_agent, request_id)
      values ('enquiry_bad_input', '{"field":"name"}'::jsonb, p_ip, p_user_agent, p_request_id);
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if length(coalesce(p_message,'')) > 2000 then
    insert into public_abuse_log (kind, detail, ip, user_agent, request_id)
      values ('enquiry_bad_input', '{"field":"message"}'::jsonb, p_ip, p_user_agent, p_request_id);
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select * into v_intake from enquiry_intake
    where intake_slug = p_intake_slug and is_enabled = true;
  if not found then
    insert into public_abuse_log (kind, detail, ip, user_agent, request_id)
      values ('enquiry_bad_slug', jsonb_build_object('slug', p_intake_slug),
              p_ip, p_user_agent, p_request_id);
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  -- IP-level rate limit, atomic. 1-hour bucket.
  if p_ip is not null then
    v_ip_hits := public_rate_limit_hit(
      v_intake.tenant_id, 'enquiry_ip', p_ip::text, 3600
    );
    if v_ip_hits > v_intake.ip_rate_limit_per_hour then
      insert into public_abuse_log (tenant_id, kind, detail, ip, user_agent, request_id)
        values (v_intake.tenant_id, 'enquiry_rate_limited_ip',
                jsonb_build_object('hits', v_ip_hits), p_ip, p_user_agent, p_request_id);
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
  end if;

  -- Phone-level soft dedupe, atomic. Window = phone_soft_block_hours.
  if p_phone_normalized is not null then
    v_phone_hits := public_rate_limit_hit(
      v_intake.tenant_id, 'enquiry_phone', p_phone_normalized,
      v_intake.phone_soft_block_hours * 3600
    );
    if v_phone_hits > 1 then
      insert into public_abuse_log (tenant_id, kind, detail, ip, user_agent, request_id)
        values (v_intake.tenant_id, 'enquiry_phone_dup',
                jsonb_build_object('phone_norm', p_phone_normalized, 'hits', v_phone_hits),
                p_ip, p_user_agent, p_request_id);
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
  end if;

  insert into enquiries (
    tenant_id, name, phone, phone_normalized, email, source, message,
    created_via, referrer_url, ip_address, status
  ) values (
    v_intake.tenant_id, p_name, p_phone_display, p_phone_normalized, p_email, p_source, p_message,
    'public_form', p_referrer_url, p_ip, 'new'
  ) returning id into v_id;

  -- Emit a notification (Section 9). Source type is required (not null on the
  -- notifications table); we always pass 'enquiry' here.
  perform emit_notification(
    p_tenant_id := v_intake.tenant_id,
    p_kind := 'enquiry_received',
    p_severity := 'info',
    p_source_type := 'enquiry',
    p_source_id := v_id,
    p_dedupe_key := 'enquiry:' || v_id::text,
    p_recipient_capability := 'enquiry:view'
  );

  return v_id;
end $$;

revoke all on function submit_public_enquiry(text,text,text,text,text,text,text,text,inet,text,text) from public;
grant execute on function submit_public_enquiry(text,text,text,text,text,text,text,text,inet,text,text) to anon;
```

The public anon key has EXECUTE on these two functions and on nothing else relevant. The customer page calls `get_customer_portal`; the enquiry form's route handler calls `submit_public_enquiry` after Zod + Turnstile gating.

**Signed URL post-processing (route layer):** the customer-portal route handler receives the JSON above and, for each entry in `images[]`, issues a Supabase Storage signed URL with a 10-minute TTL when `bucket = 'media-private'`, or builds a public URL when `bucket = 'media-customer-public'`. Raw `storage_path` values never reach the client. Pseudocode:

```ts
// /app/c/[slug-hash]/route.ts
const data = await sb.rpc('get_customer_portal', {
  p_hash: hash, p_ip: ip, p_user_agent: ua, p_request_id: reqId
});
data.images = await Promise.all(data.images.map(async (img) => {
  if (img.bucket === 'media-customer-public') {
    return { url: sb.storage.from(img.bucket).getPublicUrl(img.storage_path).data.publicUrl,
             taken_at: img.taken_at };
  }
  const { data: signed } = await sb.storage.from(img.bucket)
    .createSignedUrl(img.storage_path, 600);
  return { url: signed?.signedUrl, taken_at: img.taken_at };
}));
return Response.json(data);
```



### 5.4.1 Public abuse log

```sql
create table public_abuse_log (
  id bigserial primary key,
  -- tenant_id may be null when the offending request did not resolve a tenant
  -- (e.g. unknown intake slug, unknown portal hash). When known, it is set.
  tenant_id uuid references tenants(id),
  kind text not null,                 -- 'portal_bad_hash','enquiry_rate_limited_ip', etc.
  detail jsonb,
  ip inet,
  user_agent text,
  request_id text,
  occurred_at timestamptz default now()
);

create index public_abuse_log_recent_idx on public_abuse_log(occurred_at desc);
create index public_abuse_log_ip_idx on public_abuse_log(ip, occurred_at desc);
create index public_abuse_log_tenant_idx on public_abuse_log(tenant_id, occurred_at desc) where tenant_id is not null;

-- Only Owner with audit_log:view (or audit:view_abuse) can read this.
alter table public_abuse_log enable row level security;
create policy public_abuse_log_select on public_abuse_log
  for select using (has_capability('audit_log:view'));
-- No INSERT/UPDATE/DELETE policies for non-service users.
-- Inserts come exclusively from SECURITY DEFINER public functions.
```

### 5.4.2 Atomic public rate limiter

The v2.0 enquiry function used a count-then-insert pattern: it counted recent rows in `enquiries` and rejected if the count exceeded the threshold. Under concurrent submissions, two requests can both read a count of `n` simultaneously and both insert, slipping past a limit of `n+1`.

The fix is a dedicated rate-limit table with a unique key per (kind, identifier, bucket window) and an atomic counter increment under a per-bucket advisory lock.

```sql
create table public_rate_limit_buckets (
  id bigserial primary key,
  -- Tenant the bucket belongs to. Resolved once the slug is known.
  tenant_id uuid references tenants(id),
  -- 'enquiry_ip', 'enquiry_phone', 'portal_hash_ip' — matches the call site.
  kind text not null,
  -- The thing being rate-limited: an IP literal, an E.164 phone, a portal hash.
  -- Stored as text so a single table covers heterogeneous identifiers.
  identifier text not null,
  -- Start of the time bucket (truncated to the bucket size).
  bucket_start timestamptz not null,
  bucket_window_seconds int not null,
  hit_count int not null default 0,
  first_hit_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now(),
  unique (kind, identifier, bucket_start)
);

create index public_rate_limit_buckets_gc_idx
  on public_rate_limit_buckets(bucket_start);

-- Atomic increment-and-test. Returns the new hit_count after this hit. Caller
-- compares against the limit and rejects if exceeded.
create or replace function public_rate_limit_hit(
  p_tenant_id uuid,
  p_kind text,
  p_identifier text,
  p_window_seconds int
) returns int
  language plpgsql
  security definer
  set search_path = pg_catalog, public
as $$
declare
  v_bucket_start timestamptz;
  v_lock_key bigint;
  v_count int;
begin
  -- Bucket boundary: floor(now / window) * window.
  v_bucket_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  -- Per-bucket advisory lock — serializes concurrent hits on the same bucket
  -- so the upsert-and-read sequence is linearizable. The lock is released at
  -- transaction end. hashtextextended returns a bigint that fits the API.
  v_lock_key := hashtextextended(
    p_kind || '|' || p_identifier || '|' || v_bucket_start::text, 0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  insert into public_rate_limit_buckets
    (tenant_id, kind, identifier, bucket_start, bucket_window_seconds, hit_count, first_hit_at, last_hit_at)
  values
    (p_tenant_id, p_kind, p_identifier, v_bucket_start, p_window_seconds, 1, now(), now())
  on conflict (kind, identifier, bucket_start) do update
    set hit_count = public_rate_limit_buckets.hit_count + 1,
        last_hit_at = now()
  returning hit_count into v_count;

  return v_count;
end $$;

revoke all on function public_rate_limit_hit(uuid,text,text,int) from public;
-- Granted only to the SECURITY DEFINER public functions that need it
-- (anon never calls this directly).
-- See Section 5.7.

-- Stale buckets are dropped daily; we don't need long history here.
-- The audit trail of refusals lives in public_abuse_log, not in this table.
```

A daily job runs `delete from public_rate_limit_buckets where bucket_start < now() - interval '7 days';` to keep the table small.

### 5.5 RLS policy template — applied to every table

Every domain table gets the same policy shape, parameterized by capability and any per-row predicates (project assignment, project stage, ownership, soft delete). The repo enforces this via a code generator: a YAML descriptor per table emits the migration. The descriptor is the source of truth; the SQL is derived.

**Why a descriptor and not a string-substitution template:** the v2.0 template used placeholders like `<resource>:edit`, but the actual capability list (Section 2.3) uses verbs, not derived names. `expenses` has `expenses:create` and `expenses:approve` (no `expenses:edit`); `daily_tasks` has `daily_tasks:write_own`; `project` has `project:view_assigned` and `project:view_all`. Mechanical name derivation produces capabilities that don't exist. The descriptor lists the *real* capability names per action.

A descriptor looks like this:

```yaml
# /db/policies/expenses.yaml
table: expenses
project_scoped: true
project_id_column: project_id
soft_delete: true                  # the table has deleted_at
stage_gate: execution              # write paths require projects.current_stage = 'execution'
capabilities:
  select:
    any_of:
      - { capability: expenses:view_all }
      - { capability: expenses:view, scope: project, require_assignment: true }
  insert:
    require: { capability: expenses:create, scope: project, require_assignment: true }
  update:
    # The same row needs different capabilities for different transitions.
    # The generator emits one update policy per case and OR-combines them.
    cases:
      - name: approver_action
        require: { capability: expenses:approve, scope: project }
        column_constraints:
          - { column: approval_status, allowed: [approved, rejected] }
      - name: recorder_correction
        require: { capability: expenses:create, scope: project, require_assignment: true }
        column_constraints:
          - { column: approval_status, allowed: [pending] }
  delete:
    deny_all: true                # soft-delete only; hard delete via Owner purge job
```

The generator emits SQL like:

```sql
alter table expenses enable row level security;
alter table expenses force row level security;

create policy expenses_select on expenses for select using (
  tenant_id = (select tenant_id from users where id = auth.uid())
  and deleted_at is null
  and (
    has_capability('expenses:view_all', null, tenant_id)
    or (
      has_capability('expenses:view', project_id, tenant_id)
      and is_assigned_to_project(project_id)
    )
  )
);

create policy expenses_insert on expenses for insert with check (
  tenant_id = (select tenant_id from users where id = auth.uid())
  and has_capability('expenses:create', project_id, tenant_id)
  and is_assigned_to_project(project_id)
  and project_in_stage(project_id, 'execution')
);

create policy expenses_update_approver on expenses for update using (
  tenant_id = (select tenant_id from users where id = auth.uid())
  and has_capability('expenses:approve', project_id, tenant_id)
  and deleted_at is null
  and project_in_stage(project_id, 'execution')
) with check (
  approval_status in ('approved','rejected')
);

create policy expenses_update_recorder on expenses for update using (
  tenant_id = (select tenant_id from users where id = auth.uid())
  and has_capability('expenses:create', project_id, tenant_id)
  and is_assigned_to_project(project_id)
  and approval_status = 'pending'
  and deleted_at is null
  and project_in_stage(project_id, 'execution')
) with check (
  approval_status = 'pending'
);

-- No DELETE policy — hard delete is reserved for the Owner-controlled purge job
-- which runs as a privileged service path with RLS-bypassing JWT.
```

Concrete capabilities per table are catalogued in Appendix A. Tables without a `:view_all` variant fall back to project-scoped `:view` only. Tables without a `:create` capability (presets, templates) are write-restricted to `access_control:manage` or a role-specific manage capability.

**Stage-gated tables** (require `current_stage = 'execution'` for inserts/updates):

- `material_plan`, `material_consumption`, `expenses`, `site_check_ins`

Stage-gated SELECT is generally NOT applied: design-stage projects can still display past execution data if any exists; only writes are gated. The exception is `site_check_ins` SELECT, which is gated to assigned users + Owner.

**`access_control:manage` is structurally non-delegable.** The Owner is the only user that may hold this capability. A trigger on `user_capabilities` rejects any insert or update granting `access_control:manage` to a non-Owner. Combined with the existing `is_owner_immutable` trigger that blocks revoking Owner capabilities, this means the capability literally cannot be transferred:

```sql
create or replace function enforce_access_control_manage_owner_only() returns trigger
  language plpgsql
  set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  if new.capability = 'access_control:manage' and new.granted = true then
    select role into v_role from users where id = new.user_id;
    if v_role is null or v_role <> 'owner' then
      raise exception
        'access_control:manage is non-delegable; only the immutable Owner may hold it (attempted target: %)',
        new.user_id;
    end if;
  end if;
  return new;
end $$;

create trigger trg_access_control_manage_owner_only
  before insert or update on user_capabilities
  for each row execute function enforce_access_control_manage_owner_only();
```

**Per-table policy files** live under `/db/policies/<table>.sql`, generated from `/db/policies/<table>.yaml`. CI fails if the generated SQL drifts from a fresh generation.

### 5.6 Validation rules — invariants enforced at DB level

These are CHECK constraints, triggers, or generated columns. Application-layer Zod validation is also required, but the database is the final word.

**Project status / on-hold reason coherence**

```sql
-- on_hold_reason must be set iff status = 'on_hold'.
alter table projects add constraint projects_on_hold_reason_chk check (
  (status = 'on_hold' and on_hold_reason is not null and length(on_hold_reason) > 0)
  or (status <> 'on_hold')
);
```

**Project status transition control**

A trigger rejects illegal transitions (e.g. `completed → planning`). Allowed transitions:

```
planning → active → on_hold ↔ active → completed
planning → cancelled
active → cancelled
```

Implementation: trigger `validate_project_status_transition` on `projects` BEFORE UPDATE.

**Payment totals vs project budget**

A scheduled job (or a deferred constraint trigger) validates: `sum(payment_schedule.amount_due) for a project ≤ projects.budget_total`. Excess raises a Priority Notification but does not block the insert (the budget may not have been entered yet, or may have been increased mid-project; soft alert only).

**Payment over/under records**

`payment_records.amount_paid` may differ from `payment_schedule.amount_due` (real-world partial or excess payments). A computed view `v_payment_status` exposes per-schedule-row sums:

```sql
create or replace view v_payment_status as
select
  ps.id as schedule_id,
  ps.project_id,
  ps.amount_due,
  coalesce(sum(pr.amount_paid), 0) as amount_received,
  coalesce(sum(pr.amount_paid), 0) - ps.amount_due as variance
from payment_schedule ps
left join payment_records pr on pr.payment_schedule_id = ps.id
group by ps.id, ps.project_id, ps.amount_due;
```

`is_paid` on `payment_schedule` is updated by trigger when `amount_received >= amount_due`.

**Material quantity positivity**

Already enforced: `material_consumption.quantity_used > 0`, `material_plan.planned_quantity > 0`.

**Expense approval lifecycle**

- Inserted in `pending` state by the recorder.
- Transitions to `approved` only when `approved_by` and `approved_at` are set; only users with `expenses:approve` capability may do so.
- Transitions to `rejected` require `rejection_reason`.
- An approved or rejected expense is immutable except via the correction pattern below.

**Append-only correction pattern (expenses, work_log, material_consumption)**

These tables are append-only after a row is finalized. To correct an entry:

1. Create a new row referencing the original via `corrects_<table>_id`.
2. The new row's amount/quantity is the **absolute corrected value** (not a delta). The reporting view selects the corrected row and ignores the original; the original is retained with `is_corrected = true`.
3. The original row gets `is_corrected = true` set by trigger; the original row is never deleted.
4. Corrections of corrections are allowed: a new row may correct another correction. The reporting view follows the chain to the latest non-corrected leaf.

A single shared trigger function applies to all three tables:

```sql
create or replace function mark_original_as_corrected() returns trigger
  language plpgsql
  set search_path = pg_catalog, public
as $$
declare
  v_corrects_col text := tg_argv[0];   -- e.g. 'corrects_expense_id'
  v_corrects_id uuid;
begin
  execute format('select ($1).%I', v_corrects_col) into v_corrects_id using new;
  if v_corrects_id is not null then
    execute format('update %I set is_corrected = true where id = $1', tg_table_name)
      using v_corrects_id;
  end if;
  return new;
end $$;

create trigger trg_correct_expense
  after insert on expenses
  for each row execute function mark_original_as_corrected('corrects_expense_id');

create trigger trg_correct_work_log
  after insert on work_log
  for each row execute function mark_original_as_corrected('corrects_work_log_id');

create trigger trg_correct_material_consumption
  after insert on material_consumption
  for each row execute function mark_original_as_corrected('corrects_material_consumption_id');
```

Reporting views expose the *current* (latest non-corrected) value:

```sql
create or replace view v_expenses_current as
select * from expenses where is_corrected = false and deleted_at is null;

create or replace view v_work_log_current as
select * from work_log where is_corrected = false and deleted_at is null;

create or replace view v_material_consumption_current as
select * from material_consumption where is_corrected = false and deleted_at is null;
```

This preserves the audit trail and removes "but the number changed yesterday" disputes — the audit log records every correction; the views read the live state.

**GPS retention**

`site_check_ins.gps_lat`, `gps_lng` are retained for `tenants.gps_retention_days` (default 30), then nulled by a daily job. The check-in row remains; only the coordinates are removed. This balances the operational use (Owner sees today's check-ins on a map) against privacy concerns about long-term location tracking of staff.

*(The hardened implementations of `get_customer_portal` and `submit_public_enquiry` are defined once in Section 5.4. No duplicate definitions here.)*

### 5.7 Permissions migration — explicit revoke + grant

Supabase ships with default privileges that grant `anon` and `authenticated` `SELECT/INSERT/UPDATE/DELETE` on tables they wouldn't otherwise reach (the public schema is granted to PUBLIC by default in some configurations). Relying on RLS alone for safety leaves a default-grant attack surface: any future migration that disables RLS on a table by mistake instantly exposes it.

A dedicated migration runs *after* schema creation and locks down access explicitly. It revokes everything from the public-facing roles, then grants only what the app needs.

```sql
-- 1) Reset defaults. No table or function in `public` is reachable until
--    explicitly granted.
revoke all on schema public from public;
revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;

-- 2) Re-grant minimal table access to `authenticated`. RLS still does the
--    row-level filtering; this just re-opens the API surface.
grant usage on schema public to anon, authenticated;
grant select, insert, update on
  projects, project_assignments, project_checkpoints, checkpoint_items,
  enquiries, enquiry_remarks, enquiry_reminders, customers,
  material_plan, material_consumption, expenses,
  payment_schedule, payment_records,
  updates, media_assets, bridge_messages, owner_broadcasts, owner_broadcast_recipients,
  team_daily_tasks, site_check_ins,
  project_tables, project_table_columns, project_table_sections,
  project_table_rows, project_table_row_revisions,
  table_presets, table_preset_columns, table_preset_sections, table_preset_rows,
  calendar_events, team_performance_monthly,
  notification_recipients, push_subscriptions,
  user_capabilities, users, user_sessions
to authenticated;

-- 3) `anon` gets EXECUTE on the two public functions and nothing else.
grant execute on function get_customer_portal(text, inet, text, text)            to anon;
grant execute on function submit_public_enquiry(text,text,text,text,text,text,text,text,inet,text,text) to anon;

-- 4) Sequences feeding tables `authenticated` can insert into.
grant usage, select on all sequences in schema public to authenticated;

-- 5) The audit log is unreachable through normal grants. Insert path is the
--    SECURITY DEFINER `audit_trigger` (Section 10) owned by the `audit_writer`
--    role, which has the sole INSERT grant on `audit_log`.
revoke all on audit_log from anon, authenticated;
-- service_role retains its bypass at the connection level (Supabase JWT), but
-- code paths that use the service-role key must not touch audit_log directly;
-- see Section 10.1 for the operational discipline that guards this.

-- 6) `notifications` and emit_notification are restricted to internal callers.
revoke all on notifications from anon, authenticated;
revoke all on function emit_notification(uuid,text,text,text,text,text,uuid,text,uuid[],text)
  from public, anon, authenticated;
grant execute on function emit_notification(uuid,text,text,text,text,text,uuid,text,uuid[],text)
  to notification_writer;       -- a non-login role granted to scheduled jobs and other SECURITY DEFINER fns

-- 7) Public abuse / rate-limit infrastructure: anon must not see them.
revoke all on public_abuse_log,        public_rate_limit_buckets from anon, authenticated;
revoke all on function public_rate_limit_hit(uuid,text,text,int)  from public, anon, authenticated;
grant execute on function public_rate_limit_hit(uuid,text,text,int) to public_writer;
-- public_writer is a non-login role; the two SECURITY DEFINER public functions
-- are owned by it and inherit its grants.

-- 8) Future-proofing: default privileges on objects created by the app's
--    migration role.
alter default privileges in schema public revoke all on tables    from public;
alter default privileges in schema public revoke all on sequences from public;
alter default privileges in schema public revoke all on functions from public;
```

The migration role that owns these objects is a dedicated `db_owner` user, not the Supabase service role. The Supabase service role retains its connection-level RLS bypass for migrations and admin tasks, but **no application code path uses the service role to write to `audit_log`, `notifications`, `public_abuse_log`, or `public_rate_limit_buckets`** — those are reachable only via the named functions.

A pgtap test asserts that, with a session JWT issued for `anon` and `authenticated`, every table other than the explicitly-granted ones returns `permission denied` on direct access. Drift is caught in CI.

---

## 6. The interconnected ledger — how Materials, Progress, and Expenses stay consistent

This is what you meant by "seamless interconnected architecture." Three separate domains, but they reference each other, and the system never lets them drift.

```
       ┌────────────────────┐
       │  material_plan     │  ← PM writes this (weekly/daily)
       │  (planned)         │
       └─────────┬──────────┘
                 │ references
                 ▼
       ┌────────────────────┐         ┌────────────────────┐
       │ material_consumption│ ──────▶│     expenses       │
       │ (actual)            │  links │  (linked_material_ │
       │                     │ ─────▶ │   consumption_id)  │
       └─────────┬──────────┘         └─────────┬──────────┘
                 │                               │
                 │ both reference                │
                 ▼                               ▼
                 ┌──────────────────────────────┐
                 │      project_checkpoints      │
                 │      (progress timeline)      │
                 └──────────────────────────────┘
```

**Rules enforced at the database level (CHECK + trigger):**

1. A `material_consumption` row whose `material_plan_id` is set must have `material_name` and `unit` matching the plan. Trigger copies them on insert if not provided; rejects if provided and inconsistent.
2. An `expense` linked to a `material_consumption` must be on the same `project_id`. CHECK at insert time via trigger.
3. When a checkpoint is marked complete, a generated view `v_checkpoint_actuals` aggregates linked material consumption and expenses and exposes them on the owner's checkpoint detail. No copying of values — always computed.
4. `is_excess = true` on material_consumption is set automatically by trigger when `quantity_used > planned_quantity` for the same plan. Site engineer cannot set it false.

**What the user sees:** when a site engineer adds an expense and links it to "5 extra cement bags consumed", the owner's project card on the dashboard updates the daily expense number, the material consumption shows the overrun, and the checkpoint's actual cost recomputes — without any of those three surfaces having been individually written to. One write, three consistent reads.

---

## 7. Image handling and the 15-image rule

- Site images and drawings are uploaded to Supabase Storage under `tenant_<id>/project_<id>/<kind>/<uuid>.<ext>`.
- The owner's project card shows the **latest 4** of each kind (site image, drawing).
- Tapping shows a gallery of the **latest 15**.
- Once a project has more than 15 images of either kind, a `drive_folder_url` field is required on the project. The UI surfaces an "Open Drive folder" button.
- Optional automation (Phase 4): a Vercel Cron job runs nightly, uses a service account to push older images into the project's Drive folder, and updates `media_assets.storage_path` to the Drive ID. This keeps Supabase Storage costs bounded.

The customer-visible flag (`media_assets.visible_to_customer`) is a separate decision from where the image is stored. Owner toggles it from the gallery view. Default is `false`.

---

## 8. Realtime

- **Supabase Realtime channels** are enabled per project. Subscribers receive INSERT/UPDATE events on `updates`, `bridge_messages`, `site_check_ins`, `material_consumption`, and `expenses` for projects they have access to.
- **RLS applies to Realtime broadcasts**: a subscriber receives only rows that pass their RLS policies. A site engineer subscribed to a project's channel does not receive `payment_records` events because the SELECT policy blocks them at the source.
- **Channel naming convention**: `project:<project_id>` for project-scoped streams; `user:<user_id>` for user-targeted broadcasts (Owner broadcasts, notifications); `tenant:<tenant_id>` for tenant-wide announcements.

---

## 9. Notifications

The notification system has three concerns: **emit** (a domain event creates a notification), **deliver** (push, in-app, email), and **acknowledge** (user marks it read). v1 supports in-app and Web Push delivery; email is deferred.

### 9.1 Schema

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  kind text not null,                 -- 'checkpoint_overdue','payment_due','material_excess','reminder_due','enquiry_received','site_checkin_overdue', etc.
  severity text not null check (severity in ('info','warning','critical')),
  title text not null,
  body text,
  source_type text not null,          -- 'project','enquiry','customer','expense', etc.
  source_id uuid,
  -- Dedupe key prevents duplicate notifications from a recurring scheduled job.
  -- e.g. 'checkpoint_overdue:<checkpoint_id>:2026-05-06' fires once per day per checkpoint.
  dedupe_key text not null,
  created_at timestamptz default now(),
  unique (tenant_id, dedupe_key)
);

create table notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  is_read boolean default false,
  read_at timestamptz,
  is_acknowledged boolean default false,
  acknowledged_at timestamptz,
  -- Delivery attempts (push, in-app, email if/when added).
  push_attempts int default 0,
  push_last_attempt_at timestamptz,
  push_delivered boolean default false,
  push_last_error text,
  unique (notification_id, user_id)
);

create index notification_recipients_user_unread_idx
  on notification_recipients(user_id, is_read)
  where is_read = false;

-- Web Push subscriptions per device.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_used_at timestamptz,
  is_active boolean default true
);
```

### 9.2 Emission

A single `emit_notification()` function is the only insert path. It resolves recipients via capability and writes both the parent and recipient rows in one transaction.

```sql
create or replace function emit_notification(
  p_tenant_id uuid,
  p_kind text,
  p_severity text,
  p_source_type text,                          -- REQUIRED: notifications.source_type is NOT NULL.
  p_title text default null,
  p_body text default null,
  p_source_id uuid default null,
  p_dedupe_key text default null,
  p_recipient_user_ids uuid[] default null,    -- explicit list, OR
  p_recipient_capability text default null     -- everyone with this capability
) returns uuid
  language plpgsql
  security definer
  set search_path = pg_catalog, public
as $$
declare
  v_notif_id uuid;
begin
  if p_source_type is null or length(p_source_type) = 0 then
    raise exception 'emit_notification: p_source_type is required';
  end if;
  if p_recipient_user_ids is null and p_recipient_capability is null then
    raise exception 'emit_notification: must specify either p_recipient_user_ids or p_recipient_capability';
  end if;

  insert into notifications (tenant_id, kind, severity, title, body, source_type, source_id, dedupe_key)
  values (
    p_tenant_id, p_kind, p_severity,
    coalesce(p_title, p_kind), p_body,
    p_source_type, p_source_id,
    coalesce(p_dedupe_key, p_kind || ':' || coalesce(p_source_id::text,'') || ':' || now()::date::text)
  )
  on conflict (tenant_id, dedupe_key) do nothing
  returning id into v_notif_id;

  if v_notif_id is null then
    return null;  -- duplicate; skipped.
  end if;

  if p_recipient_user_ids is not null then
    insert into notification_recipients (notification_id, user_id)
      select v_notif_id, unnest(p_recipient_user_ids);
  elsif p_recipient_capability is not null then
    insert into notification_recipients (notification_id, user_id)
      select v_notif_id, uc.user_id
      from user_capabilities uc
      join users u on u.id = uc.user_id
      where uc.capability = p_recipient_capability
        and uc.granted = true
        and u.is_active = true
        and u.deleted_at is null
        and u.tenant_id = p_tenant_id;
  end if;

  return v_notif_id;
end $$;

-- Lockdown. Public, anon, and authenticated cannot call this. Only the
-- non-login `notification_writer` role can — and that role is held by
-- scheduled jobs and other SECURITY DEFINER functions that need to emit.
-- See Section 5.7.
revoke all on function emit_notification(uuid,text,text,text,text,text,uuid,text,uuid[],text)
  from public, anon, authenticated;
grant execute on function emit_notification(uuid,text,text,text,text,text,uuid,text,uuid[],text)
  to notification_writer;
```

### 9.3 Scheduled generation jobs

A Supabase Edge Function (or Vercel Cron) runs every 15 minutes and calls per-kind generators:

- `generate_checkpoint_overdue_notifications()` — finds checkpoints with `due_date < today` and `completed_at is null`, emits with dedupe key `checkpoint_overdue:<id>:<date>`.
- `generate_payment_due_notifications()` — finds `payment_schedule` rows due today and not yet paid.
- `generate_material_excess_notifications()` — joins `material_consumption` and `material_plan` and emits when `quantity_used > planned_quantity * (1 + tenants.material_excess_threshold_pct/100)`.
- `generate_reminder_due_notifications()` — joins `enquiry_reminders` due now and not done.
- `generate_site_checkin_overdue_notifications()` — for each (project, assigned site engineer) on a working day, if no check-in by configured cutoff, emit.

Each generator uses dedupe keys to avoid spamming. A daily compaction job archives notifications older than 90 days.

### 9.4 Delivery

In-app delivery is via a Supabase Realtime subscription on `notification_recipients` filtered by `user_id = auth.uid()`. The client renders unread counts and the notifications list from this subscription.

Web Push delivery is handled by a separate worker (Edge Function on a 1-minute cadence) that:

1. Selects `notification_recipients` rows where `push_delivered = false` and `push_attempts < 5`.
2. For each, looks up active `push_subscriptions` for the user.
3. Sends via `web-push` library using VAPID keys (stored in Supabase Vault).
4. Updates `push_attempts`, `push_last_attempt_at`, `push_delivered`, `push_last_error`.

iOS Web Push requires the user to install the PWA to home screen first. This is documented in the onboarding flow as a one-time setup step for staff and for customers.

### 9.6 RLS

```sql
alter table notifications enable row level security;
alter table notification_recipients enable row level security;
alter table push_subscriptions enable row level security;

-- Users see notifications they are recipients of.
create policy notifications_select on notifications for select using (
  exists (
    select 1 from notification_recipients nr
    where nr.notification_id = notifications.id
      and nr.user_id = auth.uid()
  )
);

-- Recipients are the user's own row only (mark read, ack).
create policy nr_select on notification_recipients for select
  using (user_id = auth.uid());
create policy nr_update on notification_recipients for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Push subs are user-private.
create policy push_subs_all on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserts are service-only (via emit_notification). No INSERT policies.
```

---

## 10. The audit log — append-only and tamper-evident

### 10.1 Append-only enforcement — realistic threat model

**Correction from v2.0.** A previous version claimed that `FORCE RLS` on `audit_log` binds the Supabase `service_role`. That claim was wrong. In Supabase, `service_role` is a JWT role configured to bypass RLS at the connection level (the GUC `request.jwt.claim.role = 'service_role'` triggers PostgREST's `SET LOCAL ROLE postgres` path, and the `postgres` role has the `bypassrls` attribute). `FORCE RLS` is bypassed by any role with `BYPASSRLS`, not just by table owners. The audit log's append-only property cannot be enforced by RLS against a code path that holds the service-role key.

The realistic protection is layered:

1. **No app code path uses the service-role key to write `audit_log` directly.** Inserts come exclusively from the `audit_trigger()` function, which runs `SECURITY DEFINER` as the `audit_writer` role. `audit_writer` is a non-login Postgres role that holds the *only* INSERT privilege on `audit_log` and has no other privileges. The function is the only path.
2. **Direct privileges are revoked.** `INSERT`, `UPDATE`, `DELETE` on `audit_log` are revoked from `anon`, `authenticated`, and `public`. There is no `service_role` grant — service-role-key callers can still bypass RLS, but they have no direct grant either, and the application repository forbids service-role direct writes (enforced by a CI grep that fails any PR introducing such code).
3. **RLS still applies for `authenticated` callers.** Even a hypothetical mis-grant would require also having RLS allow the action. RLS denies UPDATE and DELETE (no policies for either action exist). SELECT is capability-gated.
4. **The session-flag belt-and-braces remains.** `audit_trigger()` sets `app.audit_inserting = true` before its insert; the insert policy checks the flag. A direct insert from outside the trigger fails the policy regardless of role grants.
5. **External anchor of integrity.** A weekly export to an external append-only store (S3 Object Lock / R2 Bucket Lock) is signed by a key held outside Supabase. The export's hash is recorded in `audit_export_log`. Re-deriving any historical hash and matching against the export proves the live chain has not been quietly rewritten.

```sql
-- Owner role for the audit_log insert privilege.
-- Created in the privilege migration (Section 5.7).
-- Has LOGIN disabled; reachable only via SECURITY DEFINER functions that name it.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'audit_writer') then
    create role audit_writer nologin;
  end if;
end $$;

revoke all on audit_log from public, anon, authenticated;
grant insert, select on audit_log to audit_writer;

alter function audit_trigger() owner to audit_writer;

alter table audit_log enable row level security;
alter table audit_log force row level security;

-- SELECT: capability-gated (audit_log:view).
create policy audit_log_select on audit_log for select
  using (has_capability('audit_log:view', null, tenant_id));

-- INSERT: only when the trigger has set the session flag. The trigger function
-- runs as audit_writer (SECURITY DEFINER) and is the only path that sets it.
create policy audit_log_insert on audit_log for insert
  with check (
    coalesce(current_setting('app.audit_inserting', true), 'false') = 'true'
  );

-- No UPDATE policy — UPDATE is denied for everyone subject to RLS.
-- No DELETE policy — DELETE is denied for everyone subject to RLS.
```

This is genuinely defense in depth: a service-role-key holder still has the *technical* ability to bypass RLS, but the app does not use that key for audit writes, the chain is independently verifiable against the off-site export, and any drift is detected.

### 10.2 Hash chaining for tamper evidence

Each row's `row_hash` includes the previous row's `row_hash`, forming a chain. Tampering with any historical row invalidates every subsequent row's hash.

**Concurrency.** Two simultaneous writes for the same tenant could read the same `prev_hash` and create a forked chain — both rows would claim to follow the same ancestor, and the chain would no longer be linear. The fix is a per-tenant transaction-scoped advisory lock taken before reading the previous hash; concurrent writers serialize on this lock.

```sql
-- The audit_trigger function computes the hash chain.
-- Owned by the audit_writer role (SECURITY DEFINER); only path with INSERT
-- privileges on audit_log.
create or replace function audit_trigger() returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, public
as $$
declare
  v_prev_hash bytea;
  v_canonical text;
  v_row_hash bytea;
  v_actor uuid;
  v_ip inet;
  v_ua text;
  v_req_id text;
  v_tenant uuid;
  v_lock_key bigint;
begin
  -- Mark this insert as legitimate (see audit_log_insert policy above).
  perform set_config('app.audit_inserting', 'true', true);

  -- Pull request context set by the Next.js middleware via PostgREST headers.
  v_actor  := auth.uid();
  v_ip     := nullif(current_setting('request.headers.x-real-ip',  true), '')::inet;
  v_ua     := current_setting('request.headers.user-agent',  true);
  v_req_id := current_setting('request.headers.x-request-id', true);

  -- Every audited row carries tenant_id (Section 5.2.2). The audit chain is
  -- per-tenant; we lock per tenant and read the previous hash under the lock.
  v_tenant := coalesce(new.tenant_id, old.tenant_id);
  if v_tenant is null then
    raise exception 'audit_trigger: tenant_id is null on table % (denormalize tenant_id or exclude this table from auditing)',
      tg_table_name;
  end if;

  -- Per-tenant advisory lock. hashtextextended produces a deterministic bigint
  -- key. The lock is automatically released at transaction commit/rollback.
  v_lock_key := hashtextextended('audit:' || v_tenant::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  -- Now safely read the previous hash for this tenant.
  select row_hash into v_prev_hash
  from audit_log
  where tenant_id = v_tenant
  order by occurred_at desc, id desc
  limit 1;
  v_prev_hash := coalesce(v_prev_hash, '\x00'::bytea);

  v_canonical := encode(v_prev_hash, 'hex')
    || '|' || tg_table_name
    || '|' || lower(tg_op)
    || '|' || coalesce(new.id::text, old.id::text)
    || '|' || coalesce(v_actor::text, '')
    || '|' || coalesce(to_jsonb(old)::text, '')
    || '|' || coalesce(to_jsonb(new)::text, '');

  v_row_hash := digest(v_canonical, 'sha256');

  insert into audit_log(
    tenant_id, actor_id, action, resource_type, resource_id,
    before, after, ip_address, user_agent, request_id,
    prev_hash, row_hash
  )
  values (
    v_tenant,
    v_actor,
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    v_ip, v_ua, v_req_id,
    v_prev_hash, v_row_hash
  );

  perform set_config('app.audit_inserting', 'false', true);
  return coalesce(new, old);
end $$;
```

A pgtap test in CI launches N concurrent transactions all touching the same tenant and asserts the resulting chain is linear — every row's `prev_hash` matches the previous row's `row_hash` in `occurred_at, id` order.

### 10.3 What hash chaining gives, and what it does not

**It detects:** retroactive tampering with the audit log, dropped rows, reordered rows, and corruption of historical state. A single chain-break is detectable by re-walking the chain.

**It does not prevent:** an attacker with database superuser access from rewriting *both* the row and every subsequent row's hash. Hash chains are tamper-*evident*, not tamper-*proof*. Likewise, a code path that holds the service-role key can still write or rewrite the table — the protection here is operational (the app does not hold service-role writes for `audit_log`) and verificatory (the off-site export catches drift), not cryptographic.

**Cross-domain anchor (Phase 8).** A weekly job exports the prior week's `audit_log` to S3 Object Lock or R2 Bucket Lock in compliance mode for 7 years. Each export is hashed; the hash is recorded in `audit_export_log` and signed with a key held outside the Supabase project. Re-deriving any historical row's `row_hash` from the export and comparing against the live row proves the chain has not been quietly rewritten in place. This is the practical limit of what is achievable without a separate trust domain.

### 10.4 Triggers attached to every domain table

Every domain table that carries `tenant_id` has the audit trigger attached:

```sql
create trigger trg_audit_<table>
  after insert or update or delete on <table>
  for each row execute function audit_trigger();
```

Because `tenant_id` is now denormalized onto every project-scoped table (Section 5.2.2), the trigger no longer needs per-table variants — `coalesce(new.tenant_id, old.tenant_id)` always resolves.

Tables explicitly excluded from auditing:

- `notification_recipients` — high-churn read state (mark-as-read storms).
- `push_subscriptions` — operational.
- `public_abuse_log`, `public_rate_limit_buckets` — already audit-ish.
- `audit_log`, `audit_export_log` — auditing the audit log creates infinite recursion.
- `feature_flags` — operational; changes are infrequent and recorded by a separate runbook.

---

## 11. Application architecture

### 11.1 Repository layout

```
/app
  /(auth)/login
  /(owner)/dashboard
  /(owner)/enquiries
  /(owner)/customers
  /(owner)/finance
  /(owner)/access-control
  /(owner)/audit
  /(owner)/broadcasts
  /(owner)/team-performance
  /(owner)/intake-form-settings
  /(team)/projects/[id]
  /(team)/bridge/[projectId]
  /(team)/daily-tasks
  /(site)/projects/[id]
  /(site)/check-in
  /(shared)/calendar
  /(shared)/calendar/projects/[id]
  /c/[hash]                          ← customer portal, public
  /enquire/[intake_slug]              ← public enquiry intake form
/lib
  /supabase                          ← clients (server, browser, service)
  /capabilities                      ← single source for capability checks
  /domain
    /projects
    /materials
    /expenses
    /payments
    /enquiries
    /customers
    /broadcasts
    /daily-tasks
    /site-check-ins
    /project-tables
    /audit
  /realtime
/components
  /ui
  /pipeline
  /project-card
  /update-feed
  /project-table                     ← typed table renderer
/db
  /migrations
  /policies
  /functions                         ← SQL functions: get_customer_portal, submit_public_enquiry, etc.
```

### 11.2 The "changing one thing doesn't break another" principle

- **Domain folders** in `/lib/domain/<resource>` expose a small API: `list`, `get`, `create`, `update`, `softDelete`. UI never queries Supabase directly. Swapping the storage layer is a one-folder change.
- **RLS policies are per-resource files.** Adding a capability is one migration + one policy edit, no cross-cutting changes.
- **Pipeline component** (used for both project progress and payment progress) is one component with two data adapters. Visual changes happen in one place.
- **Capability checks** are imported from `lib/capabilities`. The string `'customer_payments:view'` exists in exactly one place as a constant. Renaming a capability is a single-file change.
- **Feature flags** for risky changes: a `feature_flags` table read at request boot. New features ship dark, get enabled per tenant.

### 11.3 Frontend stack details

- Next.js 14 App Router, React Server Components for read-heavy surfaces (project cards, feeds), Client Components only where you need interactivity (toggles, forms, calendar).
- TanStack Query for client-side cache + optimistic updates on mutations.
- `next-pwa` for the service worker, manifest, install prompts.
- shadcn/ui as the base component library; Tailwind for styling.
- React Hook Form + Zod for every form, with the same Zod schemas re-used on the server for validation.

### 11.4 Deployment

- **Vercel** for the Next.js app.
- **Supabase**: dedicated project, regional pinning to ap-south-1 (Mumbai) for Indian latency.
- **Render** as a fallback for any long-running endpoints (PDF generation, image batch operations) that exceed Vercel's serverless time limit.
- **GitHub Actions cron** to keep free-tier Render instances warm and to run the nightly Drive sync.
- Two environments: `staging` and `production`. PRs deploy preview environments automatically.

---

## 12. Security & operational baseline

This section catalogues the operational and security controls that ship in v1. They are organized by area.

### 12.1 Authentication & identity

- **Supabase Auth** with email + password. Magic link is a v1.1 add.
- **Password policy** (enforced at signup and password change):
  - Minimum 12 characters.
  - At least one uppercase, one lowercase, one digit; symbol recommended.
  - Checked against the `haveibeenpwned` k-anonymity API on signup; rejected if compromised count > 0.
  - Stored only as Supabase Auth's bcrypt hash (we never see the password).
- **MFA required for Owner and Admin** before they can perform any privileged action (capability changes, customer payments, hash regeneration, audit export). Enforced in middleware: a missing `mfa_enrolled_at` on a privileged route returns 401 with a redirect to enrollment. TOTP via Supabase Auth.
- **MFA optional for other roles** initially; can be made mandatory by the Owner via a tenant setting in v1.1.
- **Session expiry**: access token TTL 1 hour, refresh token TTL 7 days. Idle timeout 30 minutes for privileged users (Owner, Admin) — the middleware revokes access tokens after 30 minutes without activity for these roles.
- **Session/device management**: `user_sessions` table records active sessions. The Owner has a "Devices" surface that lists their own and (with `team:edit_user`) any team member's sessions, with a revoke button per session. Revocation invalidates the refresh token via Supabase admin API.

### 12.2 Invitation flow

- Admin (or Owner) creates a user record without a password.
- System generates a one-time invitation token (32-byte random, URL-safe). The plaintext token is included in the email link only; the database stores `users.invitation_token_hash = sha256(token)` with a 72-hour expiry. If the database leaks, the active invite links do not.
- Email link: `https://app.example.com/accept-invite?token=<token>`. The accept route hashes the URL parameter and compares to `invitation_token_hash` in constant time; on match, the recipient sets their own password and (if Owner/Admin role) is required to enroll MFA before being granted access.
- On first successful login, `invitation_accepted_at` is set and `invitation_token_hash` is cleared. Re-issuing an invite issues a new token (and new hash) and resets `invitation_expires_at`.

### 12.3 API and write paths

- **Service role key never reaches the browser.** All privileged operations go through `/api/*` route handlers running on Vercel Edge or Node, which use a server-only Supabase client.
- **Every write endpoint** validates with Zod, then checks capability, then writes. The order is enforced by a thin route-handler wrapper (`withAuthAndValidation()`).
- **Public endpoints** additionally verify a Cloudflare Turnstile token before invoking the SECURITY DEFINER function.
- **Rate limiting** at Vercel Edge: 60 req/min per IP for the customer portal route, 10 req/min for the enquiry intake form route.

### 12.4 Storage (Supabase Storage)

- **Buckets**: `media-private` (default) and `media-customer-public` (for explicitly-shared customer images).
- **Bucket RLS**: same capability checks as the corresponding `media_assets` row. A user can read a storage object only if they can read the row that references it.
- **Upload limits**: 25 MB per file, max 50 files per upload batch. Enforced at the route handler.
- **MIME type allowlist**: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`. Rejected by extension AND by magic-byte sniffing on the server.
- **Malware scanning**: every upload is queued to a ClamAV scanner (deployed on Render). The `media_assets` row is `is_clean = false` until the scan passes; downstream UIs do not surface unscanned items. Scans typically complete within 30 seconds.
- **HEIC handling**: HEIC uploads are converted to JPEG server-side at ingest (preserving the original) so all clients can display them.
- **Storage path**: `tenant_<tid>/project_<pid>/<kind>/<uuid>.<ext>` — never includes user-controlled strings.

### 12.5 Soft delete and hard purge

- **Soft delete is the default** for all domain tables: a row is "deleted" by setting `deleted_at = now()` and is filtered out of every read by RLS.
- **Hard purge** runs as a daily Owner-controlled job: rows soft-deleted more than `tenants.soft_delete_retention_days` (default 60) ago are physically removed. The purge writes one `audit_log` row per purged record before deletion.
- **Restore**: within the retention window, the Owner can clear `deleted_at` from the audit-log-driven recovery surface. After hard purge, restoration is only possible via point-in-time recovery from Supabase backups.

### 12.6 Backups, restore drills, disaster recovery

- **Supabase point-in-time recovery** enabled. Default retention is 7 days; the project pays for the upgraded 30-day plan.
- **Audit log export**: weekly automated job exports the prior week's `audit_log` to S3-compatible storage (Cloudflare R2 with Bucket Lock, or AWS S3 with Object Lock) in compliance mode for 7 years. The export's SHA-256 is recorded in `audit_export_log`.
- **Restore drills**: every quarter, a staging environment is restored from a production point-in-time snapshot and a smoke test runs against it. Drill outcomes are recorded.
- **DR runbook**: stored in the repo at `/docs/runbooks/disaster-recovery.md`, covering recovery from (a) accidental data deletion, (b) Supabase region outage, (c) credentials compromise.

### 12.7 Observability and PII handling

- **Sentry** is enabled on client and server. Client SDK has `beforeSend` hook that scrubs:
  - All values from form fields named `phone`, `email`, `password`, `address`, `salary`.
  - All values from URLs containing `/c/<hash>` (customer portal hashes).
  - JSON keys matching `/phone|email|password|address|salary|gps/i` recursively.
- **No PII in log lines**: server logs use a structured logger that requires explicit allow-listing of fields. Free-text user content (notes, remarks, messages) is logged only by hash unless tagged `safe-to-log = true`.
- **Request IDs**: every server request generates a UUID; included in Sentry, server logs, and audit log rows.

### 12.8 CI/CD

- **GitHub Actions** for CI. Every PR runs: `tsc`, `eslint`, `vitest` unit tests, `playwright` integration tests, `pgtap` RLS policy tests against a Supabase shadow database.
- **Migrations are forward-only**. Rollbacks are new forward migrations. The `supabase/migrations/` folder is append-only in the repo and enforced by a CI check.
- **Two environments**: `staging` and `production`, with separate Supabase projects. PRs deploy Vercel preview environments wired to a per-PR Supabase branch.
- **Secrets** in Vercel and Supabase Vault. None in the repo. CI loads from a separate `staging` secret store.

### 12.9 Defense in depth summary

| Threat | Primary defense | Secondary defense |
|---|---|---|
| Stolen access token | Short TTL + refresh rotation | Idle timeout for privileged roles |
| Compromised password | MFA for Owner/Admin | HIBP check at signup |
| Capability misconfiguration | Owner-only `access_control:manage` | Audit log + invariant tests in CI |
| Public form spam | Turnstile + rate limit | Phone soft-block + abuse log |
| Customer portal enumeration | 16-char random hash, no enumeration endpoints | Rate limit + abuse log |
| Audit log tampering | INSERT path restricted to `audit_writer` role; UPDATE/DELETE denied by RLS for all subject roles | Hash chain + per-tenant advisory lock + weekly externally-signed export to S3/R2 with Object Lock |
| Storage bucket leak | Bucket RLS matched to `media_assets` RLS | Customer-public bucket holds only opted-in copies |
| Supabase region outage | PITR + DR runbook | Quarterly restore drills |

---

## 13. Build sequence — 12-week phased delivery

The original 8-week plan in v1.x was aggressive for a system of this surface area (auth, RLS, CRM, project management, realtime, storage, PWA push, customer portal, finance, audit, KPI, public form, notifications, migration). v2.0 re-scopes to **12 weeks for v1**, with deferred items moved to v1.1.

Each phase has explicit acceptance criteria — "done means" — that gate the phase from progressing. Acceptance is reviewed against this document and against the test suite specified in Section 14.

### Phase 0 — Foundations (week 1)

Scope: Tenants (with `gps_retention_days`, `soft_delete_retention_days`), users (with `invitation_token_hash`), capability matrix, user_capabilities with deferred FK, RLS helper functions (`has_capability`, `is_assigned_to_project`, `project_in_stage`), `set_tenant_from_*()` triggers (Section 5.2.2), the privilege migration (Section 5.7), the `audit_writer`, `notification_writer`, `public_writer` non-login roles, the `access_control:manage` non-delegable trigger, login, MFA enrollment surface for Owner/Admin, invitation flow (hashed tokens), session table, password policy enforcement, **minimal notifications scaffolding** (`notifications`, `notification_recipients`, `emit_notification()`) so later phases that emit notifications have somewhere to write to. Push delivery is *not* part of Phase 0 — only the table + emit function.

**Done means:**
- Owner can sign up, enable MFA, and log in.
- Owner can invite an Admin via email; Admin sets password (via hashed-token compare), enrolls MFA, logs in.
- Capability matrix UI (read-only first) renders for Owner.
- The `access_control:manage` capability cannot be granted to anyone other than the immutable Owner — verified by pgtap test.
- `pgtap` test suite covers `has_capability` for all role × capability combinations.
- Schema migration replays cleanly from empty database in CI.
- Privilege migration (Section 5.7) is in place: `pgtap` test confirms `anon` and `authenticated` get `permission denied` on every table they were not explicitly granted.
- `emit_notification('test', ...)` writes a `notifications` row and one or more `notification_recipients` rows; reading from another user fails RLS (pgtap test).
- All public function endpoints return 401/403 correctly when unauthenticated.

### Phase 1 — Projects, assignments, stages, checkpoints (week 2)

Scope: projects (with `current_stage`, `is_placeholder`), project_assignments (with `contribution_pct` trigger), project_checkpoints, `v_project_checkpoint_status` view, checkpoint_templates, checkpoint_template_items, project_table seed (Drawing Register), seed.sql script, stage transition trigger.

**Done means:**
- Owner can create a project. The Standard Architectural Lifecycle preset's checkpoints are copied in by default. The Drawing Register table is auto-applied. The Owner/PM can edit, add, remove, or replace any default post-creation.
- Project assignment with contribution_pct rejects sums > 100.
- Stage transitions (design → execution) are recorded in audit_log.
- Stage gate: site_engineer surface returns empty for design-stage projects.
- RLS test: a team member assigned to project A cannot see project B.
- Checkpoint status reads from `v_project_checkpoint_status` and reflects today's date without any scheduled refresh.

### Phase 2 — Site Engineer surface, materials, expenses (weeks 3–4)

Scope: material_plan, material_consumption (positivity check, excess auto-flag), expenses (approval lifecycle), expenses ↔ materials linkage, site_check_ins, append-only correction pattern with `mark_original_as_corrected` triggers and `v_*_current` views, **material excess notification emission** via `emit_notification()` from Phase 0's scaffolding.

**Done means:**
- Site Engineer can record material consumption, link an expense, mark site check-in. Each is one tap on a phone.
- Excess >15% emits a notification (verified by test that asserts a row in `notifications` and `notification_recipients`).
- Expense approval lifecycle: pending → approved (with approver) or rejected (with reason).
- Correction pattern: a corrected expense produces a new row referencing the original; the original is flagged `is_corrected = true` by trigger; the `v_expenses_current` view returns only the latest non-corrected row. Same for `work_log` and `material_consumption`.
- PWA mobile checks: Lighthouse score > 90 on the Site Engineer surface, manual smoke test on iOS Safari and Android Chrome.

### Phase 3 — Bridge, updates feed, daily tasks, broadcasts (week 5)

Scope: bridge_messages (with structured payload writing into material_plan), updates feed with filters, team_daily_tasks + CSV export, owner_broadcasts + recipients with multi-select, drawings/design notes for team members.

**Done means:**
- Bridge "material request" creates a draft `material_plan` row.
- Daily task CSV export route returns valid CSV under 1 second for 1000-row test data.
- Broadcast to 3 recipients delivers in-app to exactly those 3 users (verified via realtime test).
- Updates feed filter combinations all return correct results (parameterized test).

### Phase 4 — Calendar (global + per-project), enquiries, public form (weeks 6–7)

Scope: calendar_events with visibility CHECK, enquiries (renamed from clients), enquiry_remarks, enquiry_reminders with calendar sync trigger, enquiry_intake, public enquiry form route + Cloudflare Turnstile + phone normalization, atomic rate limiter (`public_rate_limit_buckets` + `public_rate_limit_hit`), conversion to customer, `public_abuse_log` with IP/UA/request_id, **enquiry-received notifications** emitted from `submit_public_enquiry()`.

**Done means:**
- Creating an `enquiry_reminders` row auto-creates a `calendar_events` row visible only to Owner.
- Public form rejects: no Turnstile token, malformed input, IP rate limit, phone duplicate.
- Public form abuse cases logged to `public_abuse_log` *with* IP, user-agent, and request_id populated.
- Atomic rate limit test: 100 parallel submissions from the same IP land on `hit_count` no greater than the configured ceiling; the surplus all log to `public_abuse_log` (no slip-through).
- Conversion creates customer + project + retains audit trail.
- Calendar deep-links open the source record.
- Successful enquiry submission writes a `notifications` row visible to users with `enquiry:view`.

### Phase 5 — Payments, finance, milestone coupling (week 8)

Scope: payment_schedule, payment_records, v_payment_status view, milestone-payment coupling trigger, finance surface for Owner + Accountant, payment over/under handling.

**Done means:**
- Approving a checkpoint with `triggers_payment_id` set marks the linked payment row's status correctly.
- v_payment_status correctly handles partial payments and overpayments (test cases).
- Accountant role with `customer_payments:view` + `customer_payments:edit` can read/write payments but not see site engineer data — verified by RLS test.
- Finance export to CSV.

### Phase 6 — Customer portal, project tables UI, image handling (week 9)

Scope: Owner-triggered hash generation, hardened `get_customer_portal(p_hash, p_ip, p_user_agent, p_request_id)` function, **route-handler signed-URL post-processing** for `media-private` bucket assets, `media-customer-public` bucket for explicitly-shared assets, opt-in image gating with `is_clean = true` filter, latest-15 + Drive button logic, project_tables full CRUD UI (rows, columns, sections, revisions), Drive folder URL config.

**Done means:**
- Owner generates a customer link via explicit button click; before that, `customer_portal_hash` is null.
- Customer portal returns image URLs as Supabase signed URLs (10-minute TTL) or as public URLs from the `media-customer-public` bucket — never raw `storage_path` values. Verified by inspecting the response.
- Customer page returns curated payload only; raw row access via anon key returns nothing (RLS test).
- Image opt-in toggle: a non-opted-in image is not in the customer payload (test).
- Unscanned (`scan_status <> 'clean'`) images are excluded from the customer payload (test).
- Project table revision history captures before/after on each edit.
- Drive folder URL field is present on project; deep-link button visible to authorized users only.

### Phase 7 — Notifications polish, in-app realtime, scheduled generators (week 10)

Scope: scheduled generator jobs (overdue checkpoints, payments due, reminders due, site-checkin-overdue) running as Vercel Cron / Supabase Edge Functions and calling `emit_notification()` as the `notification_writer` role; in-app notification UI rendered from a Supabase Realtime subscription on `notification_recipients`; cross-device read-state sync; dedupe key validation.

**Web Push is deferred** — see "Deferred to v1.1." Push subscriptions are not collected in v1; the in-app + realtime channel is the v1 delivery surface for staff.

**Done means:**
- Test fixture: an overdue checkpoint produces exactly one notification per day per checkpoint per recipient (dedupe key works under repeated runs).
- In-app notification appears on a second logged-in device within 5 seconds of emission via realtime.
- Read-state on one device propagates to another within 5 seconds.
- The `emit_notification` function is callable only by the `notification_writer` role — pgtap test confirms `authenticated` and `anon` callers get `permission denied`.

### Phase 8 — Team performance, audit log UI, hash chain (week 11)

Scope: team_performance_monthly input surface, v_kpi_scores, v_employee_revenue_contribution, audit_log UI with filters, hash chain implementation with per-tenant advisory lock, weekly export job to R2/S3 with `audit_export_log` row + detached signature.

**Done means:**
- Owner can record monthly performance for each user; KPI view computes correctly against the test fixture.
- Audit log UI filters by user, resource, action, date range.
- Hash chain integrity check: tampering with one row in test fails the verification job.
- Concurrency test: N=10 parallel transactions on the same tenant produce a linear chain (no forks). Verified by re-walking the chain in pgtap.
- Weekly export job writes to R2/S3 with verified content hash; `audit_export_log` row is created with `export_signature` populated.

### Phase 9 — Hardening, ops drills, load test, launch (week 12)

Scope: Sentry PII scrubbing config, **operator-driven media-scan workflow** (Owner reviews flagged uploads; v1 has no automated quarantine — see "Deferred to v1.1"), restore drill, load test, abuse-test scripts for public endpoints, runbook docs, final security review, production cutover.

**Done means:**
- Restore drill: staging successfully restored from a production point-in-time snapshot, smoke tests pass.
- Load test: 50 concurrent users on Owner dashboard, p95 < 1.5 seconds.
- Public form abuse test: 500 submissions in 1 minute from rotating IPs — none breach the rate limit; all logged. Atomic limiter verified under concurrency.
- Operator scan workflow: Owner can flip a flagged upload's `scan_status` from `pending` to `clean` or `infected` from the audit/admin UI; infected assets are excluded from every customer-facing query.
- Security review checklist (Section 12.9 table) all green.

### Deferred to v1.1

- **Web Push delivery and `push_subscriptions` ingestion.** v1 ships in-app + realtime notifications only. (The Edge Function runtime mismatch with the `web-push` Node library, plus the iOS PWA install requirement, made this scope-heavy for the 12-week window. The v1.1 implementation will run as a Vercel/Render Node worker, where `web-push` runs natively, scheduled by Edge Cron.)
- **Automated ClamAV quarantine pipeline.** v1 has the `media_assets.scan_status` field and the operator-driven workflow; v1.1 wires it to a ClamAV scanner and flips the flag automatically.
- **Drive sync automation.** Owner manually maintains the `drive_folder_url` field in v1; v1.1 adds a nightly Vercel Cron that pushes older images into the project's Drive folder and updates `media_assets.storage_path`.
- **Audit-export hardening (key rotation, multi-region replication).** v1 produces signed exports; v1.1 adds the operational tooling around them.
- **Project table preset builder UI.** v1 ships the seeded Drawing Register preset and lets the Owner edit per-project tables freely; v1.1 adds an Owner UI to define new named presets without writing SQL.
- Email delivery for notifications.
- Magic-link auth.
- MFA for non-privileged roles (made available, not mandatory).
- Capacitor wrapper for native iOS/Android.
- Multi-tenant features (system already supports it at schema level).
- Tenant-configurable KPI weights.
- Internationalization beyond English.

---

## 13.1 Migration plan from the existing `.xls` tracker

Their existing data is small (9 projects, 12 team members, 6 categories). Per resolved decision #8 the system **ships with empty project and user tables** — no project data is migrated automatically as part of Phase 0. The migration script described below is a deliverable that the Owner can run when ready. Until then, the Owner enters projects, users, and roster manually.

The script remains documented here so it is ready to run on demand and so the source-to-target mapping is preserved as institutional knowledge.

### Source → target mapping

| Source (Project_tracker.xls) | Target table | Target column | Notes |
|---|---|---|---|
| `Setup.Category Name` | seed data | `projects.project_type` enum values | Validate against our enum; "Urban" maps directly. |
| `Setup.Employee Name` (12 names) | `users` | `full_name` | Owner sets `role` and `email` per row before import. Default role `team_member`; Owner can edit before going live. |
| `Setup.Priority` (the leaked stage values) | seed data | `enquiries.status` enum values | "Closed for discussion" → `closed_for_discussion`, "Awaiting approval" → `awaiting_approval`. |
| `Project Tracker.Project` | `projects.name` | — | "Vinay Raam" stays. Placeholder names ("Project 2"–"project 9") get a tag `is_placeholder = true` (added as a column for migration only) so the Owner can rename them post-import. |
| `Project Tracker.Category` | `projects.project_type` | — | Lowercase + underscore. |
| `Project Tracker.Assigned To` | `project_assignments` | one row per project | `role_on_project = 'pm'` by default; Owner adjusts. |
| `Project Tracker.Estimated Start` | `projects.start_date` | — | |
| `Project Tracker.Estimated Finish` | `projects.expected_end_date` | — | |
| `Project Tracker.Estimated Work (hours)` | `projects.estimated_work_hours` | — | |
| `Project Tracker.Estimated Duration (days)` | `projects.estimated_duration_days` | — | |
| `Project Tracker.Actual Start` | `projects.actual_start_date` | — | |
| `Project Tracker.Actual Finish` | `projects.actual_end_date` | — | |
| `Project Tracker.Actual Work (hours)` | `work_log` | one synthetic row | A single `work_log` row per project, dated `actual_start_date`, with the historical total. Real per-day logging starts post-migration. |
| `Project Tracker.Notes` | `updates` | one row, `update_type = 'note'` | Preserves any commentary. |
| `Project Tracker.Percent Over/Under to Flag` (cell B2 = 0.25) | `tenants.variance_threshold_pct` | — | Becomes the firm-wide setting. |
| `Daily_Progress_Log` (empty in `.xlsx`) | — | — | Nothing to migrate. |
| `Details` daily site log (blank template) | — | — | Nothing to migrate. |
| `Tasks` (empty) | — | — | Nothing to migrate. |

### Migration script design

Single Node script, runs against staging first, idempotent:

```
scripts/migrate-from-xls.ts
  1. Connect to Supabase staging with service role key.
  2. Open Project_tracker.xls via SheetJS.
  3. Upsert tenant row with variance_threshold_pct = 25.
  4. Upsert project_type enum-equivalent values (no-op; checked).
  5. For each row in Setup.Employee Name → upsert users (owner reviews via UI).
  6. For each row in Project Tracker → insert project, project_assignment,
     synthetic work_log row, and audit_log seed row.
  7. Print a reconciliation table: source_count vs target_count per table.
  8. On any mismatch, fail loudly. No partial migrations.
```

### Reconciliation checklist (run after migration, before going live)

- 9 rows in `projects`, all with `project_type` populated.
- 12 rows in `users`, all with `is_active = true`.
- 9 rows in `project_assignments`.
- 9 rows in `work_log` (one synthetic per project) — totals match the `.xls` "Actual Work (hours)" column exactly.
- The `v_project_variance` view returns flagged projects matching the `.xls` over/under flag column for at least 8 out of 9 rows. Investigate any discrepancy before sign-off.
- `tenants.variance_threshold_pct = 25.00`.

### What we deliberately do not migrate

- The Construction Site Quantitative Daily Log template (Details sheet) — never used.
- Zone/Activity/Cost tracker sheets from the structured `.xlsx` — designed and abandoned.
- The Tasks sheet — only contained status-option scaffolding, no real data.

These are noted in the audit log seed as `migration_skipped` events so we have a record of the decision.

---

## 13.2 Migration plan from `1__Office_team-performance.xlsx`

This file is fully populated and represents an active workflow. Migration must preserve their existing performance data so the first month in the new system is a continuation, not a reset.

### Source → target mapping

| Source sheet & column | Target table | Target column | Notes |
|---|---|---|---|
| `Employee_Master.Name` | `users.full_name` | — | Owner reconciles against the 12 names from Project_tracker.xls Setup sheet during onboarding (Section 16 open question). |
| `Employee_Master.Role` | `users.role` *(approximate)* | — | "Architect" / "Junior Architect" / "Draftsperson" map to `team_member` for v1. Owner can refine via Access Matrix afterwards. The original role label is preserved in a `role_label` text column added to `users`. |
| `Employee_Master.Experience (Years)` | `users.experience_years` | — | |
| `Employee_Master.Join Date` | `users.join_date` | — | |
| `Employee_Master.Skill Score` | `users.skill_score` | — | |
| `Employee_Master.Salary (INR)` | `users.salary_inr` | — | RLS restricts read to Owner/Accountant. |
| `Employee_Master.Status` | `users.is_active` | — | "Active" → true. |
| `Project_Master` rows | merged into existing `projects` migration | — | Reconciled with Project_tracker.xls projects by name where possible. New rows for any projects only present here. |
| `Allocation_Matrix.Employee ID + Project ID` | `project_assignments` | one row per pair | |
| `Allocation_Matrix.Role in Project` | `project_assignments.role_on_project` | — | Lowercased + underscored: "Lead Architect" → `lead_architect`, "Design Support" → `design_support`, etc. |
| `Allocation_Matrix.Contribution %` | `project_assignments.contribution_pct` | — | Validated on insert: per-project sum ≤ 100. |
| `Performance_Input` rows | `team_performance_monthly` | one row per (employee, month) | "Jan" → `2026-01-01` (year confirmed with client during migration). |
| `KPI_Scoring`, `Growth_Dashboard` | — *(not migrated)* | — | These are derived in our system via `v_kpi_scores` and `v_employee_revenue_contribution` views. |

### Reconciliation checklist

- 5 rows in `users` from this file (subset of the 12-person roster from Project_tracker.xls — flag mismatches for Owner review).
- 11 rows in `project_assignments` matching the Allocation_Matrix.
- For each of the 3 projects in the file, contribution percentages sum to exactly 100. Any rounding error is flagged, not silently corrected.
- 5 rows in `team_performance_monthly` (Jan).
- `v_kpi_scores` recomputes Overall scores within ±2 points of the values in their KPI_Scoring sheet for at least 4 of 5 employees. Larger drift means our default weighting differs from theirs and needs a tenant-level adjustment before going live.

### What we deliberately do not migrate

- The KPI scoring and Growth Dashboard sheets — these are computed outputs in our system, not inputs. Recomputing keeps them honest.
- The static skill-score-to-salary correlations implied by the data — no schema changes; if they want salary banding logic later it goes in a separate module.

---

## 14. Test strategy

The system has enough surface area that "we tested it manually" is not a defensible answer. v1 ships with an automated test suite that mirrors the architecture: every layer that can fail in production has a corresponding test that fails first when broken. The suite runs in CI on every PR and gates merges.

### 14.1 Test stack

- **`pgtap`** — SQL-level tests for RLS policies, helper functions, triggers, CHECK constraints, generated columns, deferred FK constraints. Runs against a per-PR Supabase shadow database loaded from the merged migration file.
- **`vitest`** — TypeScript unit tests for domain logic in `/lib/domain/<resource>` (validation, transformation, business rules). Mocks the Supabase client; tests pure logic only.
- **`vitest` integration** — runs against a real Supabase instance (a per-CI-run branch). Exercises route handlers end-to-end including auth, RLS, and writes. Asserts both success paths and access-denied paths.
- **`playwright`** — full user-journey tests on Chromium and Mobile Safari (via WebKit) emulation. Real browser, real PWA install, real notifications.
- **`k6`** — load tests for the Owner dashboard, the public enquiry form, and the customer portal.
- **`zap`** — OWASP ZAP automated scan against the staging environment, scheduled weekly.

### 14.2 RLS test matrix

Every domain table has an RLS test file at `/db/tests/rls/<table>.test.sql` covering the same matrix:

| Test case | Asserts |
|---|---|
| Anon role, SELECT | Returns zero rows |
| Anon role, INSERT/UPDATE/DELETE | Permission denied |
| Authenticated user, wrong tenant | Returns zero rows |
| User with `<resource>:view` capability, scoped to project A | Returns rows for A only |
| User with `<resource>:view_all` | Returns all rows in tenant |
| User without capability, INSERT | Permission denied |
| User with `<resource>:edit`, INSERT for project A but not assigned | Permission denied (assignment check) |
| User with `<resource>:edit`, project in `design` stage where `execution` required | Permission denied (stage check) |
| Owner | Sees and writes everything |
| Soft-deleted row, any user | Not returned |
| `has_capability()` called within RLS policy on `user_capabilities` | No infinite recursion; returns a result within statement timeout |

The matrix is generated from `/db/policies/<table>.yaml` so adding a new table automatically generates the test stubs.

#### 14.2.1 Capability-helper / RLS recursion guard

`has_capability()` queries `user_capabilities`, which itself has RLS policies. If those policies call `has_capability()`, Postgres enters infinite recursion and the statement hangs until `statement_timeout` kills it. This is a well-known Supabase footgun.

**Guard:** The RLS policy on `user_capabilities` must **not** call `has_capability()`. Instead it uses a direct ownership check (`user_id = auth.uid()` for SELECT, `has_capability('access_control:manage')` is allowed only on the **insert/update/delete** policies, and only because the Owner's capabilities are seeded at user creation and protected by the `is_owner_immutable` trigger — so the Owner can always read their own row to bootstrap). The SELECT policy on `user_capabilities` is:

```sql
create policy user_capabilities_select on user_capabilities
  for select using (
    -- Self-read: every user can see their own capabilities (no helper call).
    user_id = auth.uid()
    -- Owner/Admin with access_control:manage can see all.
    -- This sub-select avoids calling has_capability() by reading
    -- the caller's own row directly.
    or exists (
      select 1 from user_capabilities uc2
      where uc2.user_id = auth.uid()
        and uc2.capability = 'access_control:manage'
        and uc2.granted = true
    )
  );
```

**pgtap test** (`/db/tests/rls/capability_recursion.test.sql`):

```sql
-- Verify that has_capability() does not recurse when called under
-- an authenticated session whose RLS on user_capabilities is active.
begin;
  select plan(3);

  -- Set up: authenticated user with one capability.
  select set_config('request.jwt.claims', '{"sub":"<test_user_id>"}', true);
  select set_config('role', 'authenticated', true);

  -- 1) has_capability returns true for a granted capability.
  select ok(
    has_capability('project:view_assigned', null, '<test_tenant_id>'),
    'has_capability returns true for granted cap'
  );

  -- 2) has_capability returns false for an ungranted capability (no hang).
  select ok(
    not has_capability('audit_log:view', null, '<test_tenant_id>'),
    'has_capability returns false for ungranted cap without hanging'
  );

  -- 3) Direct SELECT on user_capabilities does not recurse.
  select lives_ok(
    $q$ select count(*) from user_capabilities where user_id = auth.uid() $q$,
    'SELECT on user_capabilities with RLS active does not recurse'
  );

  select * from finish();
rollback;
```

This test is part of the Phase 0 acceptance gate (Section 13) and runs in CI on every PR.

### 14.3 User journey tests (Playwright)

Each role has at least one end-to-end journey:

- **Owner**: log in → enable MFA → invite Admin → create project (default preset) → assign team members with contribution_pct → transition project to execution → record a payment → mark a customer image visible → generate customer portal hash → open the portal in an incognito context → see only opted-in data → review audit log shows all actions.
- **Site Engineer**: log in → see only assigned execution-stage projects → check in to a project (with mock GPS) → record material consumption (verify excess flag fires above 15%) → upload a site photo → record a linked expense → view appears on Owner dashboard.
- **Team Member**: log in → upload a drawing → check off a Drawing Register row → log a daily task → CSV export contains today's entries.
- **Customer (no auth)**: open portal URL → see project, payments, opted-in images → confirm absence of expenses, materials, team identities → attempt to call any RPC other than `get_customer_portal` → blocked.
- **Public enquiry**: visit form → submit without Turnstile → blocked → submit with Turnstile → enquiry appears in Owner's dashboard with notification → submit twice from same phone within window → second blocked → entries logged in `public_abuse_log`.

### 14.4 Migration reconciliation tests

`/scripts/migrate-from-xls.test.ts` runs the migration against a fixture copy of the .xls files and asserts the Section 13.1 reconciliation checklist:

- 9 rows in `projects`, all with `project_type` populated.
- 12 rows in `users`, all with `is_active = true`.
- 9 rows in `project_assignments`.
- 9 rows in `work_log` matching source totals exactly.
- For team performance migration: 5 rows in `users`, 11 rows in `project_assignments`, contribution percentages summing to exactly 100 per project, 5 rows in `team_performance_monthly`, KPI scores within ±2 points of source.

Run before any migration to a real environment.

### 14.5 Public endpoint abuse tests

`/scripts/abuse-test/` contains scripts that hammer the public surfaces:

- 500 enquiry submissions in 1 minute from a rotating IP pool — expectations: rate limit triggers correctly, abuse log records each attempt, no successful insert past the threshold.
- Customer portal enumeration test: 10,000 random hashes — expectation: zero match, all logged.
- Form input fuzzing: SQL injection patterns, XSS payloads, oversized inputs, malformed encoding — expectation: Zod rejects all, no DB error, no sensitive info in response.
- Turnstile bypass attempt: submit with no token, expired token, token from another site — all rejected.

Run nightly against staging and as a release gate.

### 14.6 Mobile / PWA acceptance

For Phase 2 onwards, every Site Engineer-facing PR runs:

- Lighthouse PWA score ≥ 90 (installability, offline, performance).
- Manual smoke on iOS Safari (latest) and Android Chrome (latest) covering: install to home screen, push notification permission grant, push delivery, photo upload, offline queueing of a check-in (resolved when online).

Documented in `/docs/mobile-acceptance.md` with screenshots taken on real devices.

### 14.7 Restore drill

Quarterly:

1. Pick a production point-in-time within the last 24 hours.
2. Restore to a fresh Supabase project.
3. Run the smoke test suite against the restored database.
4. Verify the audit log hash chain is intact end-to-end.
5. Record outcome in `/docs/runbooks/restore-drill-log.md`.

### 14.8 Acceptance gating

The build phases in Section 13 each end with a "done means" checklist. A phase is not considered complete — and the next phase does not start — until:

- All listed criteria are demonstrated.
- The relevant test suites pass.
- A walkthrough is recorded with the Owner and acknowledged.

This is the contract that prevents the rolling-deadline failure mode common to projects of this size.

---

## 15. Resolved decisions

All decisions previously open as of v1.2 have been resolved by the client. Recorded here for audit.

| # | Decision | Resolution |
|---|---|---|
| 1 | Multi-tenancy | **Single tenant only.** Schema retains `tenant_id` columns for forward compatibility but no multi-tenant features are exposed. |
| 2 | Customer portal hash issuance | **Owner-triggered.** Hash is generated only when the Owner clicks "Generate customer link." Never auto-issued. Owner can also regenerate or revoke. |
| 3 | Material excess threshold | **15%.** Alert-only. Crossing the threshold fires a Priority Notification but does not block submission. |
| 4 | iOS PWA install constraint | **Acceptable.** PWA install instruction will be communicated to staff and customers. Push notifications are required. |
| 5 | Drive folder ownership | **Owner's Drive.** Owner edits a URL field on the project; the system surfaces it as a deep-link button to authorized users. Optional opt-in to share with customer via portal. |
| 6 | Soft-delete retention | **60 days** before hard purge. Stored as `tenants.soft_delete_retention_days`. |
| 7 | Languages | **English only** at launch. No i18n scaffolding in v1. |
| 8 | Project content migration | **No project data migrated yet.** The migration scripts in Sections 12.1 and 12.2 remain available for when the Owner is ready, but Phase 0 ships with empty project and user tables. |
| 9 | Variance threshold | **25% retained.** Single threshold applies to both hours and duration. Crossing it sets a red status; no further branching. |
| 10 | Roster reconciliation | **Deferred.** Roster will be entered manually post-launch. No automated reconciliation in v1. |
| 11 | Checkpoint preset behavior | **Standard Architectural Lifecycle is the default for new projects, fully editable.** Owner can create new named presets. Any milestone in any preset (including the default) can be removed. |
| 12 | Default preset application | **Applied by default, fully editable per project.** Each new project starts with the default preset's milestones; Owner edits, adds, removes as needed. The same applies to the default Drawing Register table preset. |

---

## 16. Open items deferred to post-launch

These are not blocking v1 but are tracked here so they don't get lost. (See also "Deferred to v1.1" at the end of Section 13 for engineering deferrals.)

- Roster reconciliation between the 12-person Setup roster and the 5-person team performance file.
- KPI weighting calibration — current defaults (Efficiency 30% / Quality 40% / Delivery 30%) are inferred from their KPI_Scoring sheet magnitudes. To be confirmed once the Owner has used the system for one full month.
- Project execution table preset library — additional presets beyond the seeded Drawing Register may be created based on usage patterns.
- MFA mandatory for all roles (currently Owner/Admin only).
- Email channel for notifications.
- Tenant-configurable KPI weighting.

---

## Appendix A — Tables with RLS policy files

Every table in the system has a corresponding `/db/policies/<table>.yaml` descriptor and generated `/db/policies/<table>.sql` policy file. The matrix below catalogues each.

| Table | View capability | Edit capability | Stage-gated | Project-scoped |
|---|---|---|---|---|
| `tenants` | (owner-only via role check) | (owner-only) | no | no |
| `users` | `team:edit_user` (read), `team:create_user` | `team:edit_user` | no | no |
| `user_capabilities` | `access_control:manage` | `access_control:manage` | no | no |
| `user_sessions` | self or `team:edit_user` | self or `team:edit_user` | no | no |
| `projects` | `project:view_assigned` / `project:view_all` | `project:edit` | no | yes |
| `project_assignments` | `project:view_assigned` | `team:assign_to_project` | no | yes |
| `project_checkpoints` | `progress:view` | `progress:update` / `checklist:edit` | no | yes |
| `checkpoint_items` | `progress:view` | `progress:update` | no | yes (via checkpoint) |
| `checkpoint_templates` | (any authenticated tenant user) | `access_control:manage` | no | no |
| `checkpoint_template_items` | (any authenticated tenant user) | `access_control:manage` | no | no |
| `enquiries` | `enquiry:view` | `enquiry:create` / `enquiry:edit` | no | no |
| `enquiry_remarks` | `enquiry:view` | `enquiry:add_remark` | no | no |
| `enquiry_reminders` | `enquiry:view` | `enquiry:set_reminder` | no | no |
| `enquiry_intake` | `intake_form:configure` | `intake_form:configure` | no | no |
| `customers` | `customer:view` | `customer:view` (write via owner) | no | no |
| `material_plan` | `materials:view` | `materials:plan` | yes (`execution`) | yes |
| `material_consumption` | `materials:view` | `materials:consume` | yes (`execution`) | yes |
| `expenses` | `expenses:view` | `expenses:create` / `expenses:approve` | yes (`execution`) | yes |
| `payment_schedule` | `customer_payments:view` | `customer_payments:edit` | no | yes |
| `payment_records` | `customer_payments:view` | `customer_payments:edit` | no | yes |
| `updates` | `progress:view` (project-scoped) | author or `progress:update` | no | yes |
| `media_assets` | by linkage | `images:upload` | no | yes |
| `bridge_messages` | `bridge:read` | `bridge:write` | no | yes |
| `team_daily_tasks` | self or `daily_tasks:view_all` | self only | no | optional |
| `owner_broadcasts` | recipient or `broadcast:create` | `broadcast:create` | no | no |
| `owner_broadcast_recipients` | self or `broadcast:create` | self (ack) | no | no |
| `site_check_ins` | `site_check_in:view_all` or assigned | `site_check_in:write` | yes (`execution`) | yes |
| `project_tables` | `project_table:view` (assigned) | `project_table:edit` | no | yes |
| `project_table_columns` | via project_tables | via project_tables | no | yes |
| `project_table_sections` | via project_tables | via project_tables | no | yes |
| `project_table_rows` | via project_tables | via project_tables | no | yes |
| `project_table_row_revisions` | via project_tables | (insert via trigger only) | no | yes |
| `table_presets` | (any authenticated tenant user) | `table_preset:manage` | no | no |
| `table_preset_columns` | (any authenticated tenant user) | `table_preset:manage` | no | no |
| `table_preset_sections` | (any authenticated tenant user) | `table_preset:manage` | no | no |
| `table_preset_rows` | (any authenticated tenant user) | `table_preset:manage` | no | no |
| `calendar_events` | per visibility enum (Section 3.8) | per source | no | sometimes |
| `team_performance_monthly` | `finance:view_dashboard` or self | (owner-only insert) | no | no |
| `notifications` | recipient | (insert via emit_notification only) | no | no |
| `notification_recipients` | self | self (mark read/ack) | no | no |
| `push_subscriptions` | self | self | no | no |
| `audit_log` | `audit_log:view` | (insert via audit_trigger only; UPDATE/DELETE denied for all) | no | no |
| `public_abuse_log` | `audit_log:view` | (insert via SECURITY DEFINER public functions only) | no | no |
| `work_log` | `progress:view` (project-scoped) | self or `progress:update` | no | yes |

Tables with the `triggers_payment_id` column or any other deferred FK have their constraints applied in Section 5.2.1 and tested in `/db/tests/integrity/deferred-fks.test.sql`.

---

*End of document. Treat this as the contract between vendor and client for what is being built. Any change request gets a version bump and a delta section appended.*
