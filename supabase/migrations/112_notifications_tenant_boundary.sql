-- 112: Give the notification tables a tenant boundary.
--
-- Found while reviewing the chat work (111), and left out of it deliberately
-- because it touches every notification path in the app rather than just chat.
--
-- 032 replaced 006's owner-only policy with a recipients join so that every
-- role could read its own notifications:
--
--   CREATE POLICY notifications_select ON notifications FOR SELECT USING (
--     EXISTS (SELECT 1 FROM notification_recipients nr
--             WHERE nr.notification_id = notifications.id AND nr.user_id = auth.uid()));
--
-- That is correct about *who* may read a row and silent about *which tenant* it
-- belongs to. 006's policy on notification_recipients is `user_id = auth.uid()`
-- alone, equally tenant-blind. So the only thing keeping notifications inside a
-- tenant is that every writer happens to pick recipients from the right one —
-- a property of the callers, not of the schema. 111 is precisely what happens
-- when one writer stops having it: a client-influenced peer id reached
-- notification_recipients and the row would have been readable by a user in
-- another tenant.
--
-- The fix asserts the boundary in the policies themselves, so a future writer
-- that gets recipients wrong produces an unreadable row instead of a leak.
--
-- notification_recipients has no tenant_id of its own; rather than denormalise
-- one onto a table with no other tenant-scoped column, both policies join to
-- notifications.tenant_id, which is NOT NULL and already indexed.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. A non-recursive way to read a notification's tenant
-- ---------------------------------------------------------------------------

-- The obvious pair of policies — notifications joining to recipients, and
-- recipients joining back to notifications — is mutually recursive, and
-- Postgres refuses it at query time with "infinite recursion detected in policy
-- for relation notifications". (Verified: the first draft of this migration hit
-- exactly that.)
--
-- This helper reads notifications.tenant_id as owner, so the recipients policy
-- can check the tenant without re-entering the notifications policy. It exposes
-- one uuid for one notification id and takes no user id, so it grants a caller
-- nothing they could not already infer from a row they hold.
CREATE OR REPLACE FUNCTION notification_tenant(p_notification_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tenant_id FROM notifications WHERE id = p_notification_id;
$$;

REVOKE EXECUTE ON FUNCTION notification_tenant(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION notification_tenant(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. notifications
-- ---------------------------------------------------------------------------

-- Safe to keep the EXISTS here: notification_recipients' own policy no longer
-- refers back to notifications, so the cycle is broken on that side.
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (
    tenant_id = current_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM notification_recipients nr
      WHERE nr.notification_id = notifications.id
        AND nr.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. notification_recipients
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users read own notification_recipients" ON notification_recipients;
CREATE POLICY "users read own notification_recipients"
  ON notification_recipients FOR SELECT
  USING (
    user_id = auth.uid()
    AND notification_tenant(notification_id) = current_user_tenant_id()
  );

-- Both sides of the UPDATE. Without the tenant clause a recipient row that
-- crossed a boundary could still be marked read by its holder — harmless
-- alone, but it would keep the row alive in a bell that should never have
-- shown it.
DROP POLICY IF EXISTS "users update own notification_recipients" ON notification_recipients;
CREATE POLICY "users update own notification_recipients"
  ON notification_recipients FOR UPDATE
  USING (
    user_id = auth.uid()
    AND notification_tenant(notification_id) = current_user_tenant_id()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND notification_tenant(notification_id) = current_user_tenant_id()
  );

-- ---------------------------------------------------------------------------
-- 4. Index
-- ---------------------------------------------------------------------------

-- notifications_select probes recipients by notification_id on every row.
-- 006 indexed (user_id, is_read) only, so this direction had no index.
CREATE INDEX IF NOT EXISTS idx_notif_recipients_notification
  ON notification_recipients (notification_id);

-- FORCE is deliberately NOT set here: 081/097 already set it on both tables,
-- and every writer (emit_notification, the two chat notifiers, the two clear_*
-- functions, compact_old_notifications) is SECURITY DEFINER owned by a role
-- with rolbypassrls, which is what lets them insert with no INSERT policy
-- present. Restating FORCE would change nothing; noting why is worth more.
