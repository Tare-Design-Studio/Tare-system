-- Phase 0 · RLS policies for users, sessions, capabilities
-- Domain-table RLS lives in each phase's own migration.

-- ── users ──────────────────────────────────────────────────────────
CREATE POLICY "users read own profile"
  ON users FOR SELECT
  USING (id = auth.uid() OR (
    tenant_id = (SELECT tenant_id FROM users u2 WHERE u2.id = auth.uid() AND u2.deleted_at IS NULL)
    AND has_capability('team:view')     -- owners and team leads can list teammates
  ));

-- Re-apply simpler read policy — owners see all users in tenant
DROP POLICY IF EXISTS "users read own profile" ON users;

CREATE POLICY "users read own tenant members"
  ON users FOR SELECT
  USING (
    id = auth.uid()
    OR tenant_id = (
      SELECT tenant_id FROM users u2
       WHERE u2.id = auth.uid() AND u2.deleted_at IS NULL AND u2.is_active = true
    )
  );

CREATE POLICY "owner insert users"
  ON users FOR INSERT
  WITH CHECK (has_capability('team:create_user'));

CREATE POLICY "owner update users"
  ON users FOR UPDATE
  USING (
    id = auth.uid()                     -- own profile
    OR has_capability('team:edit_user') -- owner managing others
  );

-- ── user_sessions ──────────────────────────────────────────────────
CREATE POLICY "users read own sessions"
  ON user_sessions FOR SELECT
  USING (user_id = auth.uid() OR has_capability('team:edit_user'));

CREATE POLICY "users insert own sessions"
  ON user_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner revoke sessions"
  ON user_sessions FOR UPDATE
  USING (has_capability('team:edit_user') OR user_id = auth.uid());

-- ── user_capabilities ──────────────────────────────────────────────
CREATE POLICY "users read own capabilities"
  ON user_capabilities FOR SELECT
  USING (
    user_id = auth.uid()
    OR has_capability('access_control:manage')
  );

CREATE POLICY "owner manage capabilities"
  ON user_capabilities FOR ALL
  USING (has_capability('access_control:manage'))
  WITH CHECK (has_capability('access_control:manage'));

-- ── Privilege hardening ────────────────────────────────────────────
-- Revoke default public access added by Supabase; grant only what's needed.
REVOKE ALL ON TABLE tenants                FROM anon, authenticated;
REVOKE ALL ON TABLE users                  FROM anon;
REVOKE ALL ON TABLE user_sessions          FROM anon;
REVOKE ALL ON TABLE user_capabilities      FROM anon;
REVOKE ALL ON TABLE notifications          FROM anon;
REVOKE ALL ON TABLE notification_recipients FROM anon;
REVOKE ALL ON TABLE push_subscriptions     FROM anon;
REVOKE ALL ON TABLE audit_log              FROM anon;
REVOKE ALL ON TABLE audit_export_log       FROM anon;

-- authenticated can use RLS-gated tables
GRANT SELECT, INSERT, UPDATE ON TABLE users                   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE user_sessions           TO authenticated;
GRANT SELECT                  ON TABLE user_capabilities      TO authenticated;
GRANT SELECT, UPDATE          ON TABLE notification_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE push_subscriptions TO authenticated;
GRANT SELECT                  ON TABLE notifications          TO authenticated;
GRANT SELECT                  ON TABLE audit_log              TO authenticated;
GRANT SELECT                  ON TABLE audit_export_log       TO authenticated;
