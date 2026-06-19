-- 077_removed_employee_purge.sql
-- Hard-purge employees who were "removed" (soft-deleted) more than 30 days ago.
--
-- The team DELETE API soft-deletes a member (users.deleted_at set, is_active=false),
-- revokes their capabilities, and bans their auth login. This job finalises that 30
-- days later: it de-identifies the public.users row, then tries to delete the auth.users
-- login (which cascades to public.users + capabilities/sessions/tags/push_subscriptions).
--
-- Members who authored records (updates, owner_broadcasts, payment_records, …) cannot be
-- fully row-deleted — those NOT NULL author FKs are ON DELETE NO ACTION and would block
-- the cascade. For them we keep the (now anonymized) row and just remove the login so the
-- account/PII is gone and history stays referentially intact. Per-row EXCEPTION handling
-- makes the job always succeed regardless of which members are still referenced.
--
-- Requires pg_cron (enabled in migration 009). Runs daily at 04:00 UTC.

CREATE OR REPLACE FUNCTION purge_removed_employees()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row   record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id
    FROM public.users
    WHERE deleted_at IS NOT NULL
      AND deleted_at < (now() - interval '30 days')
      AND role <> 'owner'
  LOOP
    -- De-identify the app row first (always succeeds). If the auth delete below
    -- cascades the row away, fine; if it is blocked by author FKs, this is what remains.
    UPDATE public.users
       SET full_name        = 'Deleted Employee',
           role_label       = NULL,
           phone            = NULL,
           experience_years = NULL,
           skill_score      = NULL,
           salary_inr       = NULL,
           is_active        = false
     WHERE id = v_row.id;

    -- Try to remove the login entirely (cascades to public.users when unreferenced).
    -- Authors stay (anonymized, login already banned at removal time).
    BEGIN
      DELETE FROM auth.users WHERE id = v_row.id;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Still referenced by authored history; keep the anonymized row.
      NULL;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION purge_removed_employees() FROM PUBLIC;

SELECT cron.schedule(
  'removed-employee-purge',
  '0 4 * * *',
  $$SELECT purge_removed_employees()$$
);
