-- 106_customer_portal_content.sql
-- Give the customer portal three things it has never had: messages from the
-- studio, photos, and a record of who visited the site.
--
-- Problem: /c/customer/[hash] shows milestones and payments only. Everything a
-- client actually asks about between milestones — "what did you do this week",
-- "can I see it", "has anyone been to the site" — lives in the app and never
-- reaches them. Meanwhile media_assets.visible_to_customer has existed since
-- Phase 3 with no UI ever setting it, so every row is false.
--
-- Three decisions worth recording, because each had a cheaper alternative that
-- is wrong:
--
-- 1. Client updates get their OWN table rather than a visible_to_customer flag
--    on `updates`. The internal feed is written by team members for team
--    members — shorthand, blame, cost notes. Flagging one of those rows for a
--    client publishes prose that was never written for a client to read. A
--    separate table means the author is composing FOR the client, deliberately.
--
-- 2. Owner-logged visits live in site_check_ins alongside real ones, tagged by
--    `source`, rather than in a second table. The portal then has one query and
--    one ordering instead of a union, and a visit is a visit regardless of who
--    recorded it. The tag keeps a typed-in date honestly distinguishable from a
--    GPS-stamped arrival.
--
-- 3. No new capability. images:select_for_customer already exists, is already
--    held by owner and admin, and already backs the media_assets UPDATE policy
--    (056). Inventing customer_portal:manage would mean a second thing to grant
--    that means the same thing, and existing admins would silently lose access
--    until someone remembered to grant it.
--
-- Everything defaults to hidden: visible_to_customer starts false and
-- customer_updates starts empty, so no client sees anything new until a
-- capability holder opts it in. Deploying this changes no existing portal.
--
-- Rollback:
--   DROP TABLE customer_updates;
--   ALTER TABLE media_assets   DROP COLUMN webp_path, DROP COLUMN customer_caption,
--                              DROP COLUMN customer_sort;
--   ALTER TABLE site_check_ins DROP COLUMN visible_to_customer,
--                              DROP COLUMN customer_note, DROP COLUMN source;
--   DROP POLICY customer_visit_curate ON site_check_ins;
--   (and re-run 061 to restore the previous get_customer_portal_summary)

-- ── customer_updates ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  author_id    uuid NOT NULL REFERENCES users(id),
  body         text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  is_visible   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  edited_at    timestamptz,
  deleted_at   timestamptz
);

COMMENT ON TABLE customer_updates IS
  'Messages written by the studio FOR a client, shown in the customer portal updates box. Deliberately separate from `updates`, which is the internal feed and must never be published verbatim to a client.';

COMMENT ON COLUMN customer_updates.is_visible IS
  'Unpublish without destroying. Distinct from deleted_at: is_visible=false is a reversible editorial decision, deleted_at is removal.';

CREATE INDEX IF NOT EXISTS idx_customer_updates_customer
  ON customer_updates (customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Both are required. ENABLE alone leaves the table readable by the table owner
-- and any SECURITY DEFINER function that does not reset role; FORCE is what
-- makes the policies apply universally.
ALTER TABLE customer_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_updates FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_updates_select ON customer_updates;
CREATE POLICY customer_updates_select ON customer_updates FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND deleted_at IS NULL
);

DROP POLICY IF EXISTS customer_updates_insert ON customer_updates;
CREATE POLICY customer_updates_insert ON customer_updates FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND author_id = auth.uid()
  AND has_capability('images:select_for_customer')
);

-- Soft delete is an UPDATE that sets deleted_at, and Postgres also checks the
-- SELECT policy against the post-update row. Without a WITH CHECK that permits
-- deleted_at IS NOT NULL, that update fails RLS — the exact trap migrations 058
-- and 064 hit on project_tables.
DROP POLICY IF EXISTS customer_updates_update ON customer_updates;
CREATE POLICY customer_updates_update ON customer_updates FOR UPDATE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('images:select_for_customer')
  )
  WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('images:select_for_customer')
  );

-- The existing set_tenant_from_user() reads NEW.user_id, which this table does
-- not have (the author column is author_id), and the customer is the correct
-- parent for tenancy regardless. Hence a dedicated trigger.
CREATE OR REPLACE FUNCTION set_tenant_from_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM customers WHERE id = NEW.customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer % not found', NEW.customer_id;
  END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'tenant_id mismatch: supplied % but customer belongs to %', NEW.tenant_id, v_tenant_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_updates_set_tenant ON customer_updates;
CREATE TRIGGER customer_updates_set_tenant
  BEFORE INSERT ON customer_updates
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_customer();

-- Supabase no longer auto-exposes new public tables to the Data API (see
-- 999_zz). Grant authenticated explicitly — RLS above is what actually gates
-- the rows — and leave anon with nothing: the portal reads through the
-- SECURITY DEFINER RPC at the bottom of this file, never the table.
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_updates TO authenticated;
GRANT ALL    ON customer_updates TO service_role;
REVOKE ALL   ON customer_updates FROM anon;

-- ── media_assets: webp derivative + client-facing presentation ───────────────

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS webp_path        text,
  ADD COLUMN IF NOT EXISTS customer_caption text,
  ADD COLUMN IF NOT EXISTS customer_sort    int;

COMMENT ON COLUMN media_assets.webp_path IS
  'Storage key of the compressed webp derivative in the same bucket. NULL means conversion was not attempted or failed — the portal falls back to storage_path, so a NULL here is degraded quality, never a missing image.';

COMMENT ON COLUMN media_assets.customer_caption IS
  'Optional client-facing label. The internal filename is never shown to a client.';

COMMENT ON COLUMN media_assets.customer_sort IS
  'Manual gallery order. NULL sorts last, then by taken_at DESC.';

-- ── site_check_ins: client-visible visits ───────────────────────────────────

ALTER TABLE site_check_ins
  ADD COLUMN IF NOT EXISTS visible_to_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_note       text,
  ADD COLUMN IF NOT EXISTS source              text NOT NULL DEFAULT 'check_in';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_check_ins_source_check'
  ) THEN
    ALTER TABLE site_check_ins
      ADD CONSTRAINT site_check_ins_source_check
      CHECK (source IN ('check_in', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN site_check_ins.visible_to_customer IS
  'Opt-in per visit. Defaults false so no historical check-in becomes client-visible when this migration lands.';

COMMENT ON COLUMN site_check_ins.source IS
  'check_in = the member stamped it on site (GPS, geofence checked). manual = an owner or admin recorded a visit after the fact. Keeps a typed-in date distinguishable from a measured one. A manual row MUST be written with checked_out_at set: idx_site_checkin_open_session is UNIQUE (user_id, project_id) WHERE checked_out_at IS NULL, so an open manual row would collide with that person''s live check-in on the same project.';

-- A capability holder curates what the client sees, and may record a visit that
-- was never stamped on site. Deliberately separate from site_checkin_update_override
-- (101/geofence approval), which stays untouched.
DROP POLICY IF EXISTS customer_visit_curate ON site_check_ins;
CREATE POLICY customer_visit_curate ON site_check_ins FOR UPDATE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('images:select_for_customer')
  )
  WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('images:select_for_customer')
  );

DROP POLICY IF EXISTS customer_visit_manual_insert ON site_check_ins;
CREATE POLICY customer_visit_manual_insert ON site_check_ins FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND has_capability('images:select_for_customer')
  AND source = 'manual'
);

-- A member must not be able to publish their own visit to a client, nor retitle
-- it. Only the API's service client (which re-checks the capability) writes these.
REVOKE UPDATE (visible_to_customer, customer_note, source)
  ON site_check_ins FROM authenticated;

-- ── Portal RPC ───────────────────────────────────────────────────────────────
-- Replaces 061. Same signature, same rate limiting and abuse logging; adds
-- updates, images and visits.
--
-- What is deliberately NOT selected for visits: duration, check-out time, GPS,
-- geofence status. The client is told who came and on what day. Minutes on site
-- is payroll data and none of a client's business.

CREATE OR REPLACE FUNCTION get_customer_portal_summary(
  p_hash        text,
  p_ip          inet    DEFAULT NULL,
  p_user_agent  text    DEFAULT NULL,
  p_request_id  text    DEFAULT NULL
)
RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer  customers%ROWTYPE;
  v_result    jsonb;
BEGIN
  IF p_hash IS NULL OR length(p_hash) <> 16 THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('customer_portal_bad_hash',
              jsonb_build_object('len', COALESCE(length(p_hash), 0)),
              p_ip, p_user_agent, p_request_id);
    RETURN NULL;
  END IF;

  IF p_ip IS NOT NULL THEN
    IF public_rate_limit_hit(NULL, 'customer_portal_ip', p_ip::text, 60) > 60 THEN
      INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
        VALUES ('customer_portal_rate_limited', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
      RETURN NULL;
    END IF;
  END IF;

  SELECT * INTO v_customer
    FROM customers
   WHERE customer_portal_hash    = p_hash
     AND customer_portal_enabled = true;

  IF NOT FOUND THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('customer_portal_unknown_hash', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'customer_name', v_customer.name,

    -- Studio-authored messages, newest first.
    'updates', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           cu.id,
        'body',         cu.body,
        'project_name', pr.name,
        'created_at',   cu.created_at
      ) ORDER BY cu.created_at DESC), '[]'::jsonb)
      FROM customer_updates cu
      LEFT JOIN projects pr ON pr.id = cu.project_id AND pr.deleted_at IS NULL
      WHERE cu.customer_id = v_customer.id
        AND cu.is_visible  = true
        AND cu.deleted_at  IS NULL
    ),

    -- One flat gallery across every project this customer owns. Storage keys
    -- only; the route handler signs them.
    'images', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           ma.id,
        'storage_path', ma.storage_path,
        'webp_path',    ma.webp_path,
        'bucket',       ma.bucket,
        'kind',         ma.kind,
        'caption',      ma.customer_caption,
        'taken_at',     ma.taken_at
      ) ORDER BY ma.customer_sort ASC NULLS LAST, ma.taken_at DESC NULLS LAST), '[]'::jsonb)
      FROM media_assets ma
      JOIN projects p2 ON p2.id = ma.project_id AND p2.deleted_at IS NULL
      WHERE p2.customer_id         = v_customer.id
        AND ma.visible_to_customer = true
        AND ma.is_clean            = true
        AND ma.kind IN ('site_image', 'drawing')
    ),

    -- Name and date only. See the note above.
    'visits', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           sc.id,
        'visitor_name', u.full_name,
        'project_name', p3.name,
        'visited_on',   sc.checked_in_at,
        'note',         sc.customer_note
      ) ORDER BY sc.checked_in_at DESC), '[]'::jsonb)
      FROM site_check_ins sc
      JOIN projects p3 ON p3.id = sc.project_id AND p3.deleted_at IS NULL
      JOIN users    u  ON u.id  = sc.user_id
      WHERE p3.customer_id          = v_customer.id
        AND sc.visible_to_customer  = true
    ),

    'projects', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',               p.id,
        'name',             p.name,
        'project_type',     p.project_type,
        'current_stage',    p.current_stage,
        'status',           p.status,
        'start_date',       p.start_date,
        'expected_end_date',p.expected_end_date,
        'checkpoints', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id',            cp.checkpoint_id,
            'name',          cp.name,
            'sequence_order',cp.sequence_order,
            'due_date',      cp.due_date,
            'started_at',    cp.started_at,
            'completed_at',  cp.completed_at,
            'total_items',     cp.total_items,
            'completed_items', cp.completed_items,
            'progress_pct',    cp.progress_pct,
            'status', CASE
              WHEN cp.approved_at IS NOT NULL THEN 'complete'
              WHEN cp.started_at IS NOT NULL  THEN 'in_progress'
              WHEN cp.due_date < CURRENT_DATE THEN 'overdue'
              ELSE 'pending'
            END
          ) ORDER BY cp.sequence_order), '[]'::jsonb)
          FROM v_checkpoint_progress cp
          WHERE cp.project_id = p.id
        ),
        'payments', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'milestone_name', ps.milestone_name,
            'amount_due',     ps.amount_due,
            'due_date',       ps.due_date,
            'is_paid',        ps.is_paid
          ) ORDER BY ps.sequence_order), '[]'::jsonb)
          FROM payment_schedule ps
          WHERE ps.project_id = p.id AND ps.deleted_at IS NULL
        )
      ) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM projects p
      WHERE p.customer_id = v_customer.id
        AND p.deleted_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_customer_portal_summary(text, inet, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_portal_summary(text, inet, text, text) TO anon;
