-- 119: Revoke UPDATE/DELETE/TRUNCATE on bridge_messages from `authenticated`.
--
-- Found while adding message editing (118). `authenticated` holds UPDATE,
-- DELETE and TRUNCATE on bridge_messages, which nothing in this repo grants:
-- they are Supabase's default blanket grants to the role, applied when the
-- table was created. 999_zz's `GRANT SELECT, INSERT ON bridge_messages TO
-- authenticated` reads like the complete privilege set but only ever adds.
--
-- Not currently exploitable: RLS has no UPDATE or DELETE policy, so both are
-- denied for every caller. Verified live -- a peer's UPDATE and DELETE and the
-- author's own UPDATE all affect 0 rows.
--
-- Revoked anyway, because the safety is coming from the wrong place. As it
-- stands, adding any permissive UPDATE policy later -- for a feature that wants
-- one narrow column -- silently makes every column writable, because the grant
-- is already sitting there. Editing goes through edit_chat_message() (118),
-- which is SECURITY DEFINER and needs no table grant at all, so nothing in the
-- app depends on these.
--
-- service_role keeps its full privileges: it bypasses RLS by design and the
-- server-side routes use it.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE bridge_messages FROM authenticated;

-- chat_attachments has the same inherited surplus, for the same reason, and the
-- same lack of an UPDATE/DELETE policy. Attachments are written by the upload
-- route through the service client.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE chat_attachments FROM authenticated;
