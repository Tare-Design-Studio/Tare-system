-- Phase 6 · Customer Portal public function
-- All prerequisites already exist:
--   public_abuse_log       (025_phase4_public.sql)
--   public_rate_limit_hit  (025_phase4_public.sql)
--   v_checkpoint_progress  (011_phase1_checkpoints.sql)
--   v_project_checkpoint_status (011_phase1_checkpoints.sql)
--   media_assets           (020_phase3_comms.sql)
--   payment_schedule       (027_phase5_payments.sql)
--   projects.customer_portal_hash / customer_portal_enabled (010_phase1_projects.sql)
--   projects.drive_folder_url / share_drive_with_customer   (010_phase1_projects.sql)

-- ── get_customer_portal() ─────────────────────────────────────────────
-- SECURITY DEFINER. Anon-callable. Returns curated JSONB payload.
-- The route handler signs URLs from the returned storage_path values —
-- raw paths are NEVER returned to the browser.
-- Includes F1 enhancement: per-checkpoint total_items / completed_items / progress_pct.

CREATE OR REPLACE FUNCTION get_customer_portal(
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
  v_project  projects%ROWTYPE;
  v_result   jsonb;
BEGIN
  -- Length sanity check
  IF p_hash IS NULL OR length(p_hash) <> 16 THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('portal_bad_hash',
              jsonb_build_object('len', COALESCE(length(p_hash), 0)),
              p_ip, p_user_agent, p_request_id);
    RETURN NULL;
  END IF;

  -- Per-IP rate limit: 60 lookups per minute
  IF p_ip IS NOT NULL THEN
    IF public_rate_limit_hit(NULL, 'portal_hash_ip', p_ip::text, 60) > 60 THEN
      INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
        VALUES ('portal_rate_limited_ip', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
      RETURN NULL;
    END IF;
  END IF;

  SELECT * INTO v_project
    FROM projects
   WHERE customer_portal_hash    = p_hash
     AND customer_portal_enabled = true
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('portal_unknown_hash', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'project_name',     v_project.name,
    'project_type',     v_project.project_type,
    'location',         v_project.location,
    'current_stage',    v_project.current_stage,
    'start_date',       v_project.start_date,
    'expected_end_date',v_project.expected_end_date,

    -- Checkpoints with F1 progress data
    'checkpoints', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',              cp.checkpoint_id,
        'name',            cp.name,
        'sequence_order',  cp.sequence_order,
        'due_date',        cp.due_date,
        'completed_at',    cp.completed_at,
        'total_items',     cp.total_items,
        'completed_items', cp.completed_items,
        'progress_pct',    cp.progress_pct,
        'status', CASE
          WHEN cp.completed_at IS NOT NULL THEN 'complete'
          WHEN cp.due_date < CURRENT_DATE  THEN 'overdue'
          ELSE 'pending'
        END
      ) ORDER BY cp.sequence_order), '[]'::jsonb)
      FROM v_checkpoint_progress cp
      WHERE cp.project_id = v_project.id
    ),

    -- Payment schedule (read-only view for customer)
    'payments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'milestone_name', ps.milestone_name,
        'amount_due',     ps.amount_due,
        'due_date',       ps.due_date,
        'is_paid',        ps.is_paid,
        'triggered_at',   ps.triggered_at
      ) ORDER BY ps.due_date NULLS LAST, ps.created_at), '[]'::jsonb)
      FROM payment_schedule ps
      WHERE ps.project_id = v_project.id
        AND ps.deleted_at IS NULL
    ),

    -- Storage references only — route handler converts to signed / public URLs.
    -- Only scan-clean, customer-visible assets are included.
    'images', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           ma.id,
        'storage_path', ma.storage_path,
        'bucket',       ma.bucket,
        'kind',         ma.kind,
        'taken_at',     ma.taken_at
      ) ORDER BY ma.taken_at DESC NULLS LAST), '[]'::jsonb)
      FROM media_assets ma
      WHERE ma.project_id      = v_project.id
        AND ma.visible_to_customer = true
        AND ma.kind            IN ('site_image', 'drawing')
        AND ma.is_clean        = true
    ),

    -- Drive folder (only when owner explicitly enabled sharing)
    'drive_folder_url', CASE
      WHEN v_project.share_drive_with_customer THEN v_project.drive_folder_url
      ELSE NULL
    END,

    -- Project tables visible on portal (team_member tables = drawings/design)
    'project_tables', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',          pt.id,
        'name',        pt.name,
        'table_owner_role', pt.table_owner_role,
        'columns', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', c.id, 'name', c.name,
            'column_kind', c.column_kind,
            'display_order', c.display_order
          ) ORDER BY c.display_order), '[]'::jsonb)
          FROM project_table_columns c WHERE c.project_table_id = pt.id
        ),
        'sections', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', s.id, 'name', s.name, 'display_order', s.display_order
          ) ORDER BY s.display_order), '[]'::jsonb)
          FROM project_table_sections s WHERE s.project_table_id = pt.id
        ),
        'rows', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', r.id, 'section_id', r.section_id,
            'display_order', r.display_order, 'cells', r.cells
          ) ORDER BY r.display_order), '[]'::jsonb)
          FROM project_table_rows r
          WHERE r.project_table_id = pt.id AND r.deleted_at IS NULL
        )
      ) ORDER BY pt.display_order), '[]'::jsonb)
      FROM project_tables pt
      WHERE pt.project_id = v_project.id AND pt.deleted_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

-- Anon can call; service_role bypasses RLS anyway.
REVOKE ALL ON FUNCTION get_customer_portal(text, inet, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_portal(text, inet, text, text) TO anon;
