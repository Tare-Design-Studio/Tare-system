# DEMO_VS_PROD.md
(Updated: 2026-06-11 — demo seed v2 over the live Tare client)

## Demo seed v2 — enrichment over the LIVE Tare client (2026-06-11)

After migrations 073/074 wiped everything and seeded the **real** Tare client (20 real users, 45 real projects with only name/slug/scope/stage/status), the system had zero customers/enquiries/milestones/payments/updates. This seed adds thorough demonstration data **on top of the real data** for a demo, fully reversible.

- **Generator:** `scripts/seed-demo.ts` (idempotent — self-deletes its namespace + reverts enrichment, then re-inserts). Run: `DATABASE_URL=... npx tsx scripts/seed-demo.ts`. `--sql` flag writes `supabase/demo_seed_v2.generated.sql` (artifact only; NOT in migrations/).
- **Teardown:** `supabase/demo_teardown_v2.sql` (manual — kept OUT of migrations/ for the same reason as the 069 teardown). Run: `psql "$DATABASE_URL" -f supabase/demo_teardown_v2.sql`.
- **APPLIED then TORN DOWN on cloud Supabase 2026-06-11.** Demo data is currently **NOT live** — `supabase/demo_teardown_v2.sql` was run; 0 namespaced rows remain, 0 projects carry enrichment, real 20 users / 45 projects intact. Re-run the seed (`npx tsx scripts/seed-demo.ts`) to bring it back.
- **Namespace:** every demo CHILD row uses the fixed `dec0de00-…` UUID namespace; teardown deletes strictly by it (FK-ordered) so real users/projects are never deleted.
- **Enriched in place:** 9 REAL projects get `customer_id/project_type/budget_total/start_date/expected_end_date/whatsapp_group_url` set (HARSHA, VARUN, NIHARIKA, SURESH, RANGA SRINIVAS — execution; MOHAN, PRAKASH, SHEELA, M.G.R RESTAURANT — design). Teardown nulls those 6 columns back (base seed left them NULL).
- **Authors/assignees = REAL Tare users** (Nayan owner; Divya/Anitha/Sowmiya/Noor/Zahra/Bhoomika etc. team; Srinivas/Manjunath/Siddiq/Adarsha site engineers). The seed never creates demo users — teardown removes content only.
- **Coverage:** 10 customers (3 portal-enabled, 16-char hashes), 12 enquiries (full pipeline incl. converted/lost), 12 enquiry_reminders (incl. 5 `site_visit` for SE dashboards), 23 assignments, 63 checkpoints + 252 items, 63 payment_schedule + 34 payment_records, 42 updates (+5 site-image media_assets), 20 material_plan + 20 material_consumption (one tripping the >15% excess flag on HARSHA cement), 25 expenses (approved/pending/rejected), 20 site_check_ins (closed sessions w/ duration + 1 open today + 1 out-of-geofence on NIHARIKA), 10 bridge_messages, 4 calendar_events, 1 broadcast + 10 recipients, 7 member_tasks, 5 team_daily_tasks, 4 personal_reminders, 75 attendance_logs (5 days × 11 team + 4 SE), 10 team_performance_monthly (2 months × 5).
- **Site-engineer dashboard** explicitly populated: SE assignments, site check-in/out + per-site hours, SE-authored site-image/progress updates, Site Execution Checklist tables, material plan/consumption, SE expenses, scheduled site visits, bridge threads.
- **Customer portal** verified working (HARSHA hash `dec0de0000000001` → 1 project, 7 milestones, 7 payments).

⚠️ Tear down before any prod cutover: `psql "$DATABASE_URL" -f supabase/demo_teardown_v2.sql`.

---

(Updated: 2026-06-01 — Phase 10 in progress)

> Note (2026-06-01): Migration 070 backfills the 4 demo `site_check_ins` rows (069) to closed 8h sessions (`checked_out_at`, `duration_minutes=480`) so the new per-site-hours feature has realistic data and the open-session unique index applies cleanly. No teardown change needed — demo rows are still deleted by namespace.

## Current Status
Reversible demo data set: `supabase/migrations/069_demo_seed.sql` (insert) + `supabase/demo_teardown.sql` (delete). **069 is APPLIED to cloud Supabase (2026-06-01) — demo data is currently live.** Every demo row uses the fixed `dec0de00-…` UUID namespace; teardown deletes strictly by that namespace + the 6 demo user ids, so real Tare data is never touched.

⚠️ The teardown is deliberately kept OUT of `supabase/migrations/` — the migrate runner applies every `*.sql` in that folder, so a teardown placed there auto-runs immediately after the seed and wipes it (this happened once during setup). It lives at `supabase/demo_teardown.sql` and is run manually.

**069 seeds:** 6 demo logins (`*@demo.tare`, password `demo1234`) — 4 team members (Priya=project_manager tag, Arjun=accountant tag, Meera, Rohan) + 2 site engineers (Vikram, Sneha), all with `auth.users` + `auth.identities` so they can sign in; 6 customers; 8 enquiries (full pipeline, 2 converted); 5 projects (Sharma Villa exec/active, Kapoor design-only/active, Mehta exec/active, Desai exec/completed, Reddy exec/on_hold) with assignments, checkpoints (+items), payment schedule/records, material plan/consumption (one over-15% to trip excess flag), expenses (pending+approved), site check-ins (one out-of-geofence), updates, bridge messages, member/daily tasks, personal reminders, 5 days attendance per user, broadcasts (+recipients), 2 months team performance. Also sets `tenants.office_lat/lng` (Bengaluru) for the attendance geofence; teardown reverts it to NULL.

**Seed:** `DATABASE_URL=... npx tsx scripts/migrate.ts` (069 applies via the normal chain). **Teardown:** `psql "$DATABASE_URL" -f supabase/demo_teardown.sql`. **Re-seed after teardown:** `DELETE FROM _migrations WHERE filename='069_demo_seed.sql'` then re-run migrate.

v1 production launches empty — demo data is for demonstrations only and must be torn down before prod cutover.

---

## Rules
1. `supabase/seed/001_seed.sql` contains only stubs. Fill with real data; do NOT commit with real credentials.
2. Any mock/hardcoded data added during development must be removed before prod cutover.
3. `.env.local` is gitignored and must never be committed.
4. The `is_placeholder` flag on `projects` (Phase 1) marks imported legacy rows — not demo rows.
5. Design mocks in `ArchitectOS copy/` are reference-only — never ship them.

---

## Demo / Placeholder Code Log

| Date | What | File(s) | Status |
|------|------|---------|--------|
| 2026-05-07 | Placeholder login page | `app/(auth)/login/page.tsx` | Replaced — real form built |
| 2026-05-07 | Dashboard static data | `app/(app)/page.tsx` | Partial — ProjectsCard now real data; AgentsCard, UpdatesCard, CalendarCard, Pillars still mock; replace in Phase 3/5/7 |
| 2026-05-07 | Mobile home static data | `app/(app)/MobileHome.tsx` | Active — revenue card, schedule, quick actions, project tiles, recent updates use static data (same as phone.jsx); replace with real DB queries in Phase 1 |
| 2026-05-07 | Placeholder enquiry form | `app/(public)/enquire/[tenantSlug]/page.tsx` | Active — replace in Phase 4 |
| 2026-05-08 | Customer portal | `app/(portal)/c/[hash]/page.tsx` | Replaced — real SSR portal with signed URLs, checkpoint progress, payments, tables |
| 2026-05-07 | Stub seed file | `supabase/seed/001_seed.sql` | Active — fill before first migration run |
| 2026-05-08 | Expense card | `app/(app)/projects/[id]/page.tsx` | Replaced — real data from `expenses` table |
| 2026-05-08 | Site check-ins feed | `app/(app)/projects/[id]/page.tsx` | Replaced — real data from `site_check_ins` table |
| 2026-05-08 | Payments placeholder | `app/(app)/projects/[id]/page.tsx` | Replaced — real PaymentsCard with milestone management |
| 2026-05-07 | Phase 1 SAL + Drawing Register seed | `supabase/migrations/014_phase1_seed.sql` | Active — system presets for Tare Design Studio; applied once after migrations run |
| 2026-05-11 | NotificationBell static bell replaced | `app/(app)/TopBar.tsx` | Live — real Realtime-backed bell; no demo data |
| 2026-05-12 | Performance page | `app/(app)/performance/PerformanceClient.tsx` | Live — real DB; no demo data; empty until Owner enters monthly KPIs |
| 2026-05-12 | Audit log page | `app/(app)/audit/AuditClient.tsx` | Live — real DB; no demo data; populated by audit triggers |
| 2026-06-01 | Demo data set (reversible) | `supabase/migrations/069_demo_seed.sql`, `supabase/demo_teardown.sql` | SUPERSEDED — 069's users/projects were wiped by 073/074; the 069 teardown is now a no-op |
| 2026-06-11 | Demo seed v2 over live Tare client | `scripts/seed-demo.ts`, `supabase/demo_teardown_v2.sql`, `supabase/demo_seed_v2.generated.sql` | TORN DOWN (not live) — was applied for a demo then removed via teardown_v2; re-run seed-demo.ts to restore. `dec0de00-…` namespace |

---

## Production Go-Live Checklist

### Database
- [ ] Enable pg_cron in Supabase dashboard (Extensions → pg_cron)
- [ ] Fill `supabase/seed/001_seed.sql` with real tenant name + slug
- [ ] Set `DATABASE_URL` in `.env.local`
- [ ] Run all migrations: `DATABASE_URL=... npx tsx scripts/migrate.ts`
- [ ] Run seed: `DATABASE_URL=... npx tsx scripts/migrate.ts --seed`
- [ ] Regenerate types: `npx supabase gen types typescript --project-id hsgetpednslqecfcnlyz --schema public > lib/supabase/types.ts`
- [ ] Run pgtap tests: `psql $DATABASE_URL -f supabase/tests/001_phase0_capabilities.sql`

### Auth
- [ ] Owner creates account via Supabase Auth (email = owner's hotmail)
- [ ] Owner enrolls MFA (mandatory per spec)
- [ ] Owner invites first team members via Invite UI

### App
- [ ] All placeholder pages replaced with real UI
- [ ] `npm run build` passes with zero errors
- [ ] Verify route protection: unauthenticated → redirects to `/login`
- [ ] Verify customer portal hash access: wrong hash → returns nothing

### Infrastructure
- [ ] Set all required env vars (see PROJECT_STATE.md table)
- [ ] Verify Supabase project is not paused (pg_cron keep-alive is running)
- [ ] Google Cloud service account created + Drive API enabled (Phase 1)
- [ ] VAPID keys generated + stored in Supabase Vault (Phase 7)

### Before opening to all team members
- [ ] Verify Vercel Hobby bandwidth is under 80% monthly
- [ ] Plan upgrade to Vercel Pro if commercial access imminent
- [ ] Plan upgrade to Supabase Pro when storage > 700 MB or DB > 400 MB
