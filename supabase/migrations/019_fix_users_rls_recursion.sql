-- Fix infinite recursion in users SELECT policy.
--
-- The original policy's subquery on the users table itself caused PostgreSQL
-- to recurse infinitely when evaluating the policy. current_user_tenant_id()
-- (defined in 018) is SECURITY DEFINER and reads users bypassing RLS.

DROP POLICY IF EXISTS "users read own tenant members" ON users;
DROP POLICY IF EXISTS "users read own profile"        ON users;

CREATE POLICY "users read own tenant members"
  ON users FOR SELECT
  USING (
    id = auth.uid()
    OR tenant_id = current_user_tenant_id()
  );
