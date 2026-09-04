-- 122: Swap Part A/B on the Ranganathan Srinivasan project, add per-part
--      milestone numbering support, and give the portal what it needs to show
--      next-expected / most-recent-received instead of billed / outstanding.
--
-- Why:
--  1. The two execution parts were filed the wrong way round on this project.
--     Part B's milestones are the Part A scope and vice versa. The names are
--     identical between parts; only the amounts differ, so the swap is a flip
--     of `part` plus a renumber (sequence_order is project-wide, and the UI
--     orders design-a, design-b, execution-a, execution-b).
--  2. Milestones were numbered off raw sequence_order, which runs 1..22 across
--     both parts. Each part now numbers from 1 — done in the read path
--     (row_number within the group) so no stored column can drift out of sync.
--  3. The portal showed Total Billed / Received / Outstanding. It now shows the
--     NEXT expected payment with its date, and the MOST RECENT payment actually
--     received with its date. Both need dates the RPC was not sending:
--     `last_paid_on` per milestone.
--  4. The portal is unauthenticated, but the studio wants to know who opened it.
--     A viewer name is collected at the door and stored next to the existing
--     IP / user-agent signals. It is self-declared and MUST NOT be treated as
--     an authenticated identity.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ── 1. Swap Part A <-> Part B on this one project ────────────────────────
-- Guarded to the single project by id. 'x' is a scratch value: `part` is
-- CHECK (part IN ('a','b')), so a two-step a->x->b->a swap would violate it.
-- Instead both flips happen in ONE statement, where CASE evaluates against the
-- pre-update row and no intermediate state is ever stored.
--
-- Safe on this data: the project has zero payment_records, so no receipt is
-- re-attributed to a different milestone by the move. Re-running is a no-op
-- only in the sense that it swaps back — this migration is one-shot, tracked
-- in _migrations by the runner.
UPDATE payment_schedule
   SET part = CASE part WHEN 'a' THEN 'b' ELSE 'a' END
 WHERE project_id = '7e565650-3064-4ac5-9c9d-b6c5d22b6412'
   AND deleted_at IS NULL;

-- Renumber so sequence_order again matches display order (design a, design b,
-- execution a, execution b — then by the order already held within each part).
-- The UNIQUE (project_id, sequence_order) constraint from 027 is DEFERRABLE
-- INITIALLY DEFERRED, so the transient collisions inside this single statement
-- are tolerated and only the end state is checked.
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE wing WHEN 'design' THEN 0 ELSE 1 END,
        CASE part WHEN 'a' THEN 0 ELSE 1 END,
        sequence_order
    ) AS new_order
  FROM payment_schedule
  WHERE project_id = '7e565650-3064-4ac5-9c9d-b6c5d22b6412'
    AND deleted_at IS NULL
)
UPDATE payment_schedule ps
   SET sequence_order = o.new_order
  FROM ordered o
 WHERE ps.id = o.id
   AND ps.sequence_order IS DISTINCT FROM o.new_order;

-- ── 2. last_paid_on on v_payment_status ──────────────────────────────────
-- The portal's "Received" card names the date of the most recent payment. That
-- date lives in payment_records.paid_on; the view already aggregates that table
-- for amount_received, so MAX(paid_on) costs nothing extra.
DROP VIEW IF EXISTS v_payment_status;
CREATE VIEW v_payment_status AS
SELECT
  ps.id              AS schedule_id,
  ps.tenant_id,
  ps.project_id,
  ps.milestone_name,
  ps.amount_due,
  ps.due_date,
  ps.sequence_order,
  ps.wing,
  ps.part,
  ps.notes,
  ps.is_paid,
  ps.triggered_at,
  ps.deleted_at,
  ps.created_at,
  ps.updated_at,
  COALESCE(SUM(pr.amount_paid), 0)                 AS amount_received,
  COALESCE(SUM(pr.amount_paid), 0) - ps.amount_due AS variance,
  MAX(pr.paid_on)                                  AS last_paid_on
FROM payment_schedule ps
LEFT JOIN payment_records pr ON pr.payment_schedule_id = ps.id
WHERE ps.deleted_at IS NULL
GROUP BY ps.id;

-- DROP discarded the grants — restored, matching 114.
GRANT SELECT ON v_payment_status TO authenticated;
GRANT SELECT ON v_payment_status TO service_role;

-- ── 3. Self-declared viewer name on portal opens ─────────────────────────
-- Nullable: opens recorded before this migration have no name, and the RPC
-- still answers without one so a client that skips the gate is not locked out.
ALTER TABLE customer_portal_views
  ADD COLUMN IF NOT EXISTS viewer_name text;

COMMENT ON COLUMN customer_portal_views.viewer_name IS
  'Self-declared, typed into the portal door screen. NOT an authenticated identity and never to be used as one — it is an unverified string from an anonymous visitor. Trimmed and length-capped by the RPC.';

-- ── 4. Portal RPC: viewer name in, payment dates out ─────────────────────
-- Re-declared in full (CREATE OR REPLACE cannot add a parameter). The old
-- 4-argument signature is dropped so the overload set stays unambiguous — a
-- stale 4-arg version would silently keep serving callers that omit the name.
DROP FUNCTION IF EXISTS get_customer_portal_summary(text, inet, text, text);

CREATE OR REPLACE FUNCTION get_customer_portal_summary(
  p_hash        text,
  p_ip          inet    DEFAULT NULL,
  p_user_agent  text    DEFAULT NULL,
  p_request_id  text    DEFAULT NULL,
  p_viewer_name text    DEFAULT NULL
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

  -- Successful view. Logged AFTER the hash resolves, so this table holds only
  -- real opens by someone holding a live link — failures stay in
  -- public_abuse_log and never inflate a customer's view count.
  -- Self-declared name, normalised here rather than trusted from the client:
  -- trimmed, emptied-to-NULL, and capped so the column cannot be used as free
  -- storage by anyone holding the link. Still unverified — see the column
  -- comment in 122.
  INSERT INTO customer_portal_views (tenant_id, customer_id, ip, user_agent, request_id, viewer_name)
    VALUES (v_customer.tenant_id, v_customer.id, p_ip, p_user_agent, p_request_id,
            NULLIF(left(btrim(COALESCE(p_viewer_name, '')), 80), ''));

  SELECT jsonb_build_object(
    'customer_name', v_customer.name,

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
        -- Reads v_payment_status, the same view the studio-side card reads, so
        -- the two surfaces cannot drift again. wing/part come along because the
        -- schedule is grouped by wing in the UI (114).
        'payments', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'milestone_name',  vps.milestone_name,
            'amount_due',      vps.amount_due,
            'amount_received', vps.amount_received,
            'due_date',        vps.due_date,
            'is_paid',         vps.is_paid,
            'wing',            vps.wing,
            'part',            vps.part,
            'last_paid_on',    vps.last_paid_on
          ) ORDER BY vps.sequence_order), '[]'::jsonb)
          FROM v_payment_status vps
          WHERE vps.project_id = p.id
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

REVOKE ALL   ON FUNCTION get_customer_portal_summary(text, inet, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_portal_summary(text, inet, text, text, text) TO anon;
