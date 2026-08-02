-- 091: Client feedback per milestone, voice broadcasts, and drawing work roles.
--
-- Three client requests that each need a small amount of schema:
--   #8   the customer leaves feedback after each stage of work (e.g. slab
--        completion), not only at the end
--   #6   broadcasts can be voice notes, kept short so they stay on point
--   #11  a team member records WHICH part of a drawing they did — design,
--        detailing, technical, or checking/signing
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ── #8: Client feedback on a checkpoint ────────────────────────────
--
-- Written from the customer portal, which is UNAUTHENTICATED (access is by the
-- 16-char hash on customers.customer_portal_hash, per 048). So this table gets
-- no anon INSERT policy: the portal submits through a SECURITY DEFINER function
-- that re-derives the customer from the hash. A direct anon INSERT would let
-- anyone post feedback as any customer.

CREATE TABLE IF NOT EXISTS client_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checkpoint_id  uuid REFERENCES project_checkpoints(id) ON DELETE SET NULL,
  customer_id    uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rating         int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text CHECK (comment IS NULL OR length(comment) <= 2000),
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  -- One feedback per customer per checkpoint; re-submitting updates in place.
  UNIQUE (customer_id, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_project ON client_feedback(project_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant  ON client_feedback(tenant_id, submitted_at DESC);

COMMENT ON TABLE client_feedback IS
  'Customer rating + comment per project stage. Written only via submit_client_feedback() from the portal; never by anon directly.';

ALTER TABLE client_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_feedback FORCE ROW LEVEL SECURITY;

-- Staff read only. No INSERT/UPDATE policy at all: the portal path is the
-- SECURITY DEFINER function below, staff never author feedback.
CREATE POLICY client_feedback_select ON client_feedback FOR SELECT
  USING (
    tenant_id = current_user_tenant_id()
    AND (
      has_capability('project:view_all')
      OR (has_capability('project:view_assigned') AND is_assigned_to_project(project_id))
    )
  );

REVOKE ALL ON TABLE client_feedback FROM anon;
GRANT SELECT ON TABLE client_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_feedback TO service_role;

-- Portal submission. Takes the portal hash (never a customer_id from the
-- caller) and verifies the checkpoint belongs to a project of that customer,
-- so a valid hash cannot be used to rate someone else's job.
CREATE OR REPLACE FUNCTION submit_client_feedback(
  p_portal_hash   text,
  p_checkpoint_id uuid,
  p_rating        int,
  p_comment       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_id uuid;
  v_tenant_id   uuid;
  v_project_id  uuid;
  v_id          uuid;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  SELECT id, tenant_id INTO v_customer_id, v_tenant_id
    FROM customers
   WHERE customer_portal_hash = p_portal_hash
     AND customer_portal_enabled = true;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or disabled portal link';
  END IF;

  -- The checkpoint must sit on a project belonging to this customer.
  SELECT p.id INTO v_project_id
    FROM project_checkpoints pc
    JOIN projects p ON p.id = pc.project_id
   WHERE pc.id = p_checkpoint_id
     AND p.customer_id = v_customer_id
     AND p.deleted_at IS NULL;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'That stage does not belong to your project';
  END IF;

  INSERT INTO client_feedback (tenant_id, project_id, checkpoint_id, customer_id, rating, comment)
  VALUES (v_tenant_id, v_project_id, p_checkpoint_id, v_customer_id, p_rating, NULLIF(btrim(p_comment), ''))
  ON CONFLICT (customer_id, checkpoint_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        submitted_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION submit_client_feedback(text, uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_client_feedback(text, uuid, int, text) TO anon, authenticated;

-- ── #6: Voice broadcasts ───────────────────────────────────────────
--
-- Audio lives in the existing media-private bucket; only the path and duration
-- are recorded here. duration_seconds is capped at 60 in the DB as well as the
-- browser — the client-side MediaRecorder limit is a UX affordance, not a
-- guarantee, and this is the request's "don't let them talk beyond the
-- required information" made enforceable.

ALTER TABLE owner_broadcasts
  ADD COLUMN IF NOT EXISTS voice_path       text,
  ADD COLUMN IF NOT EXISTS voice_duration_s int
    CHECK (voice_duration_s IS NULL OR (voice_duration_s > 0 AND voice_duration_s <= 60));

-- body is NOT NULL on this table; a voice-only broadcast would otherwise need a
-- placeholder string. Allow empty body when audio is attached.
ALTER TABLE owner_broadcasts
  DROP CONSTRAINT IF EXISTS owner_broadcasts_has_content;
ALTER TABLE owner_broadcasts
  ADD CONSTRAINT owner_broadcasts_has_content CHECK (
    length(btrim(body)) > 0 OR voice_path IS NOT NULL
  );

COMMENT ON COLUMN owner_broadcasts.voice_path IS
  'Storage path in media-private for a voice note. Max 60s, enforced by voice_duration_s.';

-- ── #11: Which part of the drawing was worked on ───────────────────
--
-- Added to member_tasks (where drawing work is already tracked and already
-- feeds the KPI via 084) rather than a new table.

DO $$ BEGIN
  CREATE TYPE drawing_role AS ENUM ('design', 'detailing', 'technical', 'checked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE member_tasks
  ADD COLUMN IF NOT EXISTS drawing_role drawing_role;

COMMENT ON COLUMN member_tasks.drawing_role IS
  'For drawing-tagged work: which part the member did — design, detailing, technical, or checked/signed off.';

CREATE INDEX IF NOT EXISTS idx_member_tasks_drawing_role
  ON member_tasks(user_id, drawing_role) WHERE drawing_role IS NOT NULL;

-- Per-user monthly split of drawing work by role, for the profile and reports.
CREATE OR REPLACE VIEW v_drawing_role_monthly AS
SELECT
  user_id,
  tenant_id,
  date_trunc('month', COALESCE(completed_at, created_at))::date AS period_month,
  COUNT(*) FILTER (WHERE drawing_role = 'design')::int    AS design_count,
  COUNT(*) FILTER (WHERE drawing_role = 'detailing')::int  AS detailing_count,
  COUNT(*) FILTER (WHERE drawing_role = 'technical')::int  AS technical_count,
  COUNT(*) FILTER (WHERE drawing_role = 'checked')::int    AS checked_count,
  COUNT(*)::int                                            AS total_count
FROM member_tasks
WHERE drawing_role IS NOT NULL
  AND status = 'completed'
GROUP BY user_id, tenant_id, date_trunc('month', COALESCE(completed_at, created_at));

COMMENT ON VIEW v_drawing_role_monthly IS
  'Completed drawing work per user per month, split by the part of the drawing they handled (091).';

GRANT SELECT ON v_drawing_role_monthly TO authenticated;
