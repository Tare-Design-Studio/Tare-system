# Bridge Chat — design

(2026-08-31)

Upgrades Bridge from a per-project notepad into a chat: project threads keep working, direct
messages are added, and an unread count rides the Bridge icon in both navbars. The hard constraint
is that none of this may cost the rest of the app a request. Everything below is shaped by that.

## Decisions taken (and refused)

| Decision | Chosen | Refused, and why |
|---|---|---|
| Thread types | project threads + 1:1 DMs | ad-hoc groups — not asked for, doubles the membership model |
| DM reach | any active user in tenant | capability gate — no config surface for a feature everyone needs |
| Badge counts | unread **messages**, capped `99+` | unread threads — under-reads a busy morning |
| Notifications | in-app bell only (099 unchanged) | web push — 099's stated fear of mute-within-a-week stands |
| Receipts | typing + seen over ephemeral **broadcast**, DMs only | DB receipt rows — 2000 rows/day and a WAL event each |
| Images | own `chat_attachments`, shared pipeline | `media_assets` — `project_id` NOT NULL, and pruning eats chat history |
| Unread maths | counted in DB, cached in a provider | the existing 2000-row JS scan; a denormalised counter that drifts |

## Schema (107)

`chat_conversations` — one row per thread, project and DM alike.

- `kind` in (`project`,`dm`), with a CHECK making the two shapes mutually exclusive:
  a project row has `project_id` and no DM columns, a DM row the reverse.
- DM identity is `(dm_lo, dm_hi)` with `dm_lo < dm_hi` enforced by CHECK, plus a partial UNIQUE
  index. This is what makes "A↔B" and "B↔A" the same row at the database level, so two people
  opening each other at the same moment cannot create duplicate threads. It also keeps the RLS
  predicate to `auth.uid() IN (dm_lo, dm_hi)` — index-usable, no join.
- `last_message_at` maintained by trigger; indexed `(tenant_id, last_message_at DESC)` to sort the
  conversation list without touching the messages table.

`bridge_messages` gains `conversation_id`, `reply_to_id`, `attachment_id`. Project messages keep
their `project_id` — the material-request trigger reads it and is not being touched. `reply_to_id`
is ON DELETE SET NULL so a quoted message that vanishes degrades to an unquoted reply.

`chat_reads (user_id, conversation_id, tenant_id, last_read_at)` replaces `bridge_reads`, which
cannot key a DM. Backfilled, then dropped last in the transaction.

`chat_attachments` — chat images. Same bucket (`media-private`), same sharp/webp derivative, same
`scan_status` gate as `media_assets`, but **no Drive push and no pruning**: `prunePrivateMedia`
keeps 15 per kind per project, which would silently delete chat history, and Drive archiving a
"here's the leak" phone snap is not what the project folder is for.

### RLS

- Project conversations: existing `has_capability('bridge:read'|'bridge:write', project_id)
  OR is_assigned_to_project(...)`. No new capability invented.
- DM conversations: `auth.uid() IN (dm_lo, dm_hi) AND tenant_id = current_user_tenant_id()`.
  **Owners included** — there is no admin backdoor into a DM. If compliance access is ever wanted
  it is a deliberate separate change, not a quiet default.
- Messages inherit by `EXISTS` against their conversation. Insert additionally pins
  `author_id = auth.uid()`.
- Every new table gets both `ENABLE` and `FORCE ROW LEVEL SECURITY`, and explicit table-level
  GRANTs (the 092 lesson).

## Unread pipeline

`chat_unread_counts()` — one SECURITY INVOKER function returning
`(conversation_id, kind, project_id, peer_id, title, unread, last_message_at, preview)`. Counting
happens in Postgres against the existing `(project_id, created_at)` index; the caller receives ~20
small rows instead of the 2000 message rows `/api/bridge/reads` currently drags into Node to count
in JavaScript. That endpoint is replaced, not duplicated.

`ChatBadgeProvider` sits in the app layout and is the only consumer:

1. One RPC on mount, per session.
2. Thereafter **mutated locally** — `+1` on a realtime INSERT the user did not author, `0` on
   opening a thread. No refetch on navigation.
3. One resync on tab-refocus after >60s hidden, since realtime events that arrived while the
   socket slept are not replayed.

Per navigation: zero network. Per session: one RPC. Per message: one realtime event already on the
wire. The same payload feeds the conversation list, so list and badge share the single request.

`RealtimeRefresher` is left alone except to drop its now-redundant `/bridge` entry: the badge needs
`bridge_messages` app-wide, which is a different subscription with a different job — mutate a
counter, never `router.refresh()`, which would re-run server components on every keystroke's worth
of chat.

## UI

- Badge on the Bridge icon in `TopBar`, `MobileNav`, and `SiteEngineerChrome` — all three, since a
  site engineer never sees the first two.
- Bridge page becomes two panes: conversation list (projects + DMs, sorted by `last_message_at`,
  unread dot) and thread. Mobile shows one at a time.
- New-DM picker lists active tenant users.
- Reply-to quote strip above the composer; tap a quote to scroll to the original.
- Typing/seen only inside an open DM, over `supabase.channel().send()` broadcast — no DB writes,
  throttled to one event per 2s.

## Verification

`npm run build`; a transactional probe against the live DB (rolled back) asserting: DM uniqueness
under reversed argument order, a third party cannot select a DM they are not in, unread counts per
user, backfill row-count parity before the drop, and that project-thread behaviour is unchanged.
