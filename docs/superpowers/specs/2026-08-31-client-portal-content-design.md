# Client Portal Content — Design

**Date:** 2026-08-31
**Status:** Approved, pending implementation

## Problem

The customer portal (`/c/customer/[hash]`) shows milestones and payments only. Clients
cannot see what the studio has told them, what the site looks like, or who has visited.
Owners and admins have no surface to curate any of that.

Separately, `/c/customer/[hash]` and `/c/[hash]` both carry a "Powered by ascension"
footer that must be removed from client-facing pages.

## What exists today (verified against the live DB, 2026-08-31)

- `media_assets.visible_to_customer` exists but **no UI toggles it** — every row is `false`.
- The per-project portal `/c/[hash]` already renders images through `get_customer_portal`.
  The customer portal `/c/customer/[hash]` does not.
- `site_check_ins` already has `checked_out_at` + `duration_minutes`, and
  `POST /api/projects/[id]/checkin` already handles `check_in` / `check_out`, gated on
  `site_check_in:write` plus a `project_assignments` row. **No new check-in flow is needed.**
- Migrations 067, 068 and 070 **are applied** in the live DB. `SCHEMA.md` says
  "NOT YET APPLIED" — stale, corrected as part of this work.
- Capability `images:select_for_customer` already exists, is in the owner and admin
  capability sets, and already backs the `media_assets` UPDATE RLS policy (migration 056).
  **No new capability is introduced.**
- `sharp` 0.35.3 is present transitively via Next; it becomes an explicit dependency.

## Decisions

| Question | Decision |
|---|---|
| Updates source | New `customer_updates` table, written for clients. Internal `updates` stay internal. |
| Visit source | Both real team check-ins and owner-logged manual visits, in one table. |
| Visit detail shown to client | **Name + date only.** No duration, no GPS. |
| Image scope | One flat gallery across all the customer's projects, newest first. |
| Compression | webp generated at upload time, stored alongside the original. |
| Permission | Existing `images:select_for_customer`. |

## Data model — migration `106_customer_portal_content.sql`

### New table `customer_updates`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, `gen_random_uuid()` |
| tenant_id | uuid | NOT NULL → tenants |
| customer_id | uuid | NOT NULL → customers ON DELETE CASCADE |
| project_id | uuid | NULL → projects ON DELETE SET NULL (optional tag) |
| author_id | uuid | NOT NULL → users |
| body | text | NOT NULL, CHECK length 1–2000 |
| is_visible | boolean | NOT NULL DEFAULT true — hide without deleting |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| edited_at | timestamptz | NULL |
| deleted_at | timestamptz | NULL — soft delete |

Index: `(customer_id, created_at DESC) WHERE deleted_at IS NULL`.

`ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY` (project invariant).

RLS:
- SELECT — same tenant and `deleted_at IS NULL`.
- INSERT / UPDATE / DELETE — `has_capability('images:select_for_customer')` and same tenant.

The portal reads it through a `SECURITY DEFINER` RPC, so anon never touches the table.

### `media_assets` — added columns

- `webp_path text NULL` — compressed derivative key in `media-private`.
- `customer_caption text NULL` — optional client-facing label.
- `customer_sort int NULL` — display order; NULL sorts last, then by `taken_at DESC`.

### `site_check_ins` — added columns

- `visible_to_customer boolean NOT NULL DEFAULT false` — owner opts each visit in.
- `customer_note text NULL` — owner-editable label shown to the client.
- `source text NOT NULL DEFAULT 'check_in' CHECK (source IN ('check_in','manual'))`.

Manual owner-logged visits are rows in this same table with `source='manual'`,
`within_geofence=false`, `checked_in_at` set to the visit date, and `user_id` set to the
staff member the owner names. One table means the portal has one query path, not a union.

RLS addition: holders of `images:select_for_customer` may UPDATE the two visibility
columns and INSERT `source='manual'` rows. Existing check-in policies are untouched.

## Portal RPC — `get_customer_portal_summary` (replace, same signature)

Keeps its arguments, rate limiting, and abuse logging exactly as they are. Adds three
top-level keys:

- `updates` — visible, non-deleted `customer_updates` for the customer, newest first:
  `{ id, body, project_name, created_at }`.
- `images` — flat across the customer's projects, where
  `visible_to_customer AND is_clean AND kind IN ('site_image','drawing')`:
  `{ id, storage_path, webp_path, bucket, kind, caption, taken_at }`,
  ordered `customer_sort NULLS LAST, taken_at DESC`.
- `visits` — `site_check_ins` where `visible_to_customer = true`, joined to `users`:
  `{ id, visitor_name, visited_on, note }`. **Name and date only** — no duration,
  no GPS, no check-out time.

The page component signs the storage keys (bucket is private), preferring `webp_path`
and falling back to `storage_path`, matching how `/c/[hash]` already signs its images.

## Upload path — webp

In `app/api/projects/[id]/updates/images/route.ts`, after the existing original upload:

```
sharp(bytes).rotate().resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 78 })
```

uploaded to `${project_id}/webp/${uuid}.webp`, recorded in `webp_path`.

The original still goes to Drive as the archive. **A webp failure is non-fatal** — it is
swallowed, `webp_path` stays NULL, and the portal falls back to the original. This
mirrors how the existing Drive sync already degrades. `sharp` becomes an explicit
dependency rather than a transitive one.

`prunePrivateMedia` must delete the webp alongside the original so pruning leaves no
orphaned derivative.

## Admin surface — customer detail page

A "Client Portal Content" card on `app/(app)/customers/[id]/CustomerDetail.tsx`, rendered
only for holders of `images:select_for_customer`, with three tabs:

- **Updates** — compose, edit, soft-delete client updates; toggle `is_visible`.
- **Images** — grid of the customer's project images, each with a visibility toggle and
  a caption field.
- **Visits** — check-ins with a per-row visibility toggle and editable note, plus a
  "Log a visit" form (staff member, date, note) writing `source='manual'`.

New routes, each re-checking the capability server-side:

| Route | Methods |
|---|---|
| `/api/customers/[id]/updates` | GET, POST |
| `/api/customers/[id]/updates/[updateId]` | PATCH, DELETE |
| `/api/customers/[id]/portal-images` | GET, PATCH |
| `/api/customers/[id]/visits` | GET, POST, PATCH |

## Portal rendering

`app/(portal)/c/customer/[hash]/page.tsx` gains three sections in the page's existing
visual language (serif headings, `CARD` style, the established palette):

1. **Updates from Tare** — the separate box the client reads first, above the projects.
2. **Site Photos & Drawings** — responsive flat grid, lazy-loaded, captions under each.
3. **Site Visits** — name + date rows.

Each section renders nothing at all when empty — no empty-state boxes cluttering a portal
for a client whose owner has not curated anything yet.

## Footer removal

"Powered by ascension" is removed from **both** client-facing portals:
`app/(portal)/c/customer/[hash]/page.tsx:173` and `app/(portal)/c/[hash]/page.tsx:502`.
The `/c/` hash line stays. Staff-facing login and accept pages are left alone — the
request was about the client portal.

## Security notes

1. The portal is unauthenticated; the hashed URL is the only gate. Client-visible images
   become readable by anyone holding the link. This is already true of the existing
   project portal, so the exposure model is unchanged — but this work widens what sits
   behind that link, so it is stated explicitly.
2. Every new visibility column defaults to **false** and `customer_updates` starts empty,
   so no existing client sees anything new on deploy. Content appears only after someone
   with `images:select_for_customer` opts it in.
3. GPS coordinates and check-out times are never exposed to the portal — the RPC selects
   name and date only.

## Verification

- `npm run build` passes (the deploy gate in `DEPLOYMENT.md`).
- Migration applied via `DATABASE_URL=... npx tsx scripts/migrate.ts` — never by hand.
- Portal with no curated content renders exactly as it does today.
- An image toggled off disappears from the portal; a disabled hash still 404s.
- A webp conversion failure still yields a working upload and a visible image.
- `SCHEMA.md` updated in the same task, including correcting the stale
  "067/068/070 NOT YET APPLIED" status.
- `PROJECT_STATE.md` updated after the phase.

## Out of scope

- No changes to the internal `updates` feed or the team check-in flow.
- No re-encoding of images already uploaded; `webp_path` stays NULL for them and they
  serve from the original.
- No client-side upload or commenting in the portal — it stays read-only.
