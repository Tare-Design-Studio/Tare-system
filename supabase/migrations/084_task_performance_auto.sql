-- 084_task_performance_auto.sql
-- Auto-derives team_performance_monthly inputs from completed member_tasks so the
-- existing v_kpi_scores (efficiency/quality/delivery/overall) + the Performance
-- page keep working — filled automatically instead of typed by hand.
--
-- Owner can still override any month via POST /api/performance: that sets
-- is_manual_override=true and recompute then leaves the row alone.
--
-- Mapping into v_kpi_scores inputs (migration 034):
--   drawings_completed  ← tag-weighted volume of completed tasks
--                         (drawing=3, review=2, site=2, admin=1, other=1)
--   errors              ← # completed tasks the owner reviewed as 'error'
--   revisions           ← # completed tasks the owner reviewed as 'revision'
--   deadline_met_pct    ← on-time % (completed-by-due ÷ tasks-with-a-due-date)
--   site_delay_days     ← total overdue days across late completed tasks (capped 30)
--
-- ── PORTED FROM THE SIBLING MULTI-TENANT REPO, WITH ITS FIXES FOLDED IN ──────
-- Upstream shipped this as two migrations: 087 (feature) and 089 (fixes found in
-- review AFTER 087 was already applied there — so it could not be edited in
-- place). This deployment has applied NEITHER, so the CORRECTED form is written
-- directly here and the broken intermediate state never exists in this database:
--
--   * upstream 087's single trigger fired WHEN (NEW.status = 'completed') only,
--     though its comment claimed to cover un-completion — impossible, since
--     NEW.status is then 'open'. Undone work kept counting toward the leaderboard
--     until the nightly backstop (up to 24h of a wrong score). This file uses
--     089's SPLIT triggers (AFTER INSERT + AFTER UPDATE OF, the latter gated on
--     `NEW.status = 'completed' OR OLD.status = 'completed'`) and 089's fuller
--     trg_recompute_task_kpi() body, which also recomputes the OLD month and
--     handles a completed task reassigned between members.
--
-- The 083 half of the upstream port (member_tasks lifecycle columns, RLS, review
-- guard) already landed here as 083_task_assignment_lifecycle.sql; this file only
-- adds the performance derivation on top of it.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF
-- EXISTS / guarded cron.unschedule). Backfills at the end.

BEGIN;

-- ============================================================
-- 1. Manual-override flag on the monthly table
-- ============================================================

ALTER TABLE team_performance_monthly
  ADD COLUMN IF NOT EXISTS is_manual_override boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Derivation view — one row per (user, month) from completed tasks
-- ============================================================
-- Column names and CHECK values match 083: tag IN
-- ('drawing','review','site','admin','other'), status IN
-- ('open','accepted','in_progress','pending_review','completed'),
-- review_status IN ('clean','revision','error').

CREATE OR REPLACE VIEW v_task_performance_monthly AS
SELECT
  mt.tenant_id,
  mt.user_id,
  date_trunc('month', mt.completed_at)::date AS period_month,
  -- tag-weighted volume → efficiency input
  SUM(
    CASE mt.tag
      WHEN 'drawing' THEN 3
      WHEN 'review'  THEN 2
      WHEN 'site'    THEN 2
      WHEN 'admin'   THEN 1
      ELSE 1
    END
  )::int AS weighted_volume,
  COUNT(*) FILTER (WHERE mt.review_status = 'error')::int    AS error_count,
  COUNT(*) FILTER (WHERE mt.review_status = 'revision')::int AS revision_count,
  -- on-time %: only over tasks that had a due date
  COUNT(*) FILTER (WHERE mt.due_date IS NOT NULL)::int       AS due_count,
  COUNT(*) FILTER (
    WHERE mt.due_date IS NOT NULL
      AND mt.completed_at::date <= mt.due_date
  )::int AS on_time_count,
  -- total overdue days (only late, due-dated tasks)
  COALESCE(SUM(
    GREATEST(0, (mt.completed_at::date - mt.due_date))
  ) FILTER (WHERE mt.due_date IS NOT NULL), 0)::int AS overdue_days
FROM member_tasks mt
WHERE mt.status = 'completed'
  AND mt.completed_at IS NOT NULL
GROUP BY mt.tenant_id, mt.user_id, date_trunc('month', mt.completed_at)::date;

-- ============================================================
-- 3. recompute_task_kpi(user, month) — upsert derived inputs
--    unless the row is a manual override.
-- ============================================================

CREATE OR REPLACE FUNCTION recompute_task_kpi(p_user uuid, p_month date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_row      v_task_performance_monthly%ROWTYPE;
  v_tenant   uuid;
  v_deadline numeric(5,2);
  v_override boolean;
BEGIN
  -- Skip if the owner has hand-edited this month.
  SELECT is_manual_override INTO v_override
    FROM team_performance_monthly
   WHERE user_id = p_user AND period_month = p_month;
  IF v_override THEN RETURN; END IF;

  SELECT * INTO v_row
    FROM v_task_performance_monthly
   WHERE user_id = p_user AND period_month = p_month;

  IF NOT FOUND THEN
    -- No completed tasks this month → ensure a zeroed derived row exists so the
    -- perf page shows the member without the owner having to add one.
    SELECT tenant_id INTO v_tenant FROM users WHERE id = p_user;
    IF v_tenant IS NULL THEN RETURN; END IF;
    INSERT INTO team_performance_monthly
      (tenant_id, user_id, period_month, drawings_completed, errors, revisions,
       deadline_met_pct, site_delay_days, is_manual_override)
    VALUES (v_tenant, p_user, p_month, 0, 0, 0, NULL, 0, false)
    ON CONFLICT (user_id, period_month) DO UPDATE SET
      drawings_completed = 0, errors = 0, revisions = 0,
      deadline_met_pct = NULL, site_delay_days = 0, updated_at = now()
    WHERE team_performance_monthly.is_manual_override = false;
    RETURN;
  END IF;

  v_deadline := CASE WHEN v_row.due_count > 0
    THEN ROUND((v_row.on_time_count::numeric / v_row.due_count) * 100, 2)
    ELSE NULL END;

  INSERT INTO team_performance_monthly
    (tenant_id, user_id, period_month, drawings_completed, errors, revisions,
     deadline_met_pct, site_delay_days, is_manual_override)
  VALUES
    (v_row.tenant_id, p_user, p_month,
     LEAST(v_row.weighted_volume, 200), v_row.error_count, v_row.revision_count,
     v_deadline, LEAST(v_row.overdue_days, 30), false)
  ON CONFLICT (user_id, period_month) DO UPDATE SET
    drawings_completed = EXCLUDED.drawings_completed,
    errors             = EXCLUDED.errors,
    revisions          = EXCLUDED.revisions,
    deadline_met_pct   = EXCLUDED.deadline_met_pct,
    site_delay_days    = EXCLUDED.site_delay_days,
    updated_at         = now()
  WHERE team_performance_monthly.is_manual_override = false;
END;
$$;

REVOKE ALL ON FUNCTION recompute_task_kpi(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION recompute_task_kpi(uuid, date) TO authenticated;

-- recompute_task_kpi() looks up team_performance_monthly by (user_id, period_month)
-- with NO tenant predicate. It is SECURITY DEFINER. This is safe ONLY because 034
-- declares UNIQUE (user_id, period_month) — that pair identifies one row globally,
-- and a user belongs to exactly one tenant. If that constraint is ever widened to
-- include tenant_id, this function's lookup AND its ON CONFLICT targets become
-- cross-tenant. Recorded here and in SCHEMA.md; no code change.
COMMENT ON FUNCTION recompute_task_kpi(uuid, date) IS
  'Derives team_performance_monthly from completed member_tasks. No tenant predicate: safe only while 034''s UNIQUE (user_id, period_month) holds. See 084.';

-- ============================================================
-- 4. Triggers — recompute when a task lands in OR leaves 'completed'
-- ============================================================

CREATE OR REPLACE FUNCTION trg_recompute_task_kpi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_new_month date;
  v_old_month date;
BEGIN
  -- Where the row counts now (completed_at is NULL after un-complete → now()).
  v_new_month := date_trunc('month', COALESCE(NEW.completed_at, now()))::date;
  PERFORM recompute_task_kpi(NEW.user_id, v_new_month);

  IF TG_OP = 'UPDATE' THEN
    -- The ORIGINAL month still holds the stale contribution when a task is
    -- un-completed or its completed_at moves across a month boundary.
    v_old_month := date_trunc('month', COALESCE(OLD.completed_at, now()))::date;
    IF v_old_month IS DISTINCT FROM v_new_month THEN
      PERFORM recompute_task_kpi(NEW.user_id, v_old_month);
    END IF;
    -- A completed task reassigned to another member must drop off the old member.
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM recompute_task_kpi(OLD.user_id, v_old_month);
      PERFORM recompute_task_kpi(OLD.user_id, v_new_month);
    END IF;
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

-- Split INSERT from UPDATE: OLD is NULL on INSERT, so `OLD.status = 'completed'`
-- cannot appear in a shared WHEN clause.
DROP TRIGGER IF EXISTS member_task_kpi_recompute ON member_tasks;
CREATE TRIGGER member_task_kpi_recompute
  AFTER INSERT ON member_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trg_recompute_task_kpi();

DROP TRIGGER IF EXISTS member_task_kpi_recompute_upd ON member_tasks;
CREATE TRIGGER member_task_kpi_recompute_upd
  AFTER UPDATE OF status, review_status, completed ON member_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed' OR OLD.status = 'completed')
  EXECUTE FUNCTION trg_recompute_task_kpi();

-- ============================================================
-- 5. Nightly backstop — recompute current + previous month for everyone
--    (catches manual DB edits, late reviews across a month boundary).
-- ============================================================

CREATE OR REPLACE FUNCTION recompute_all_task_kpi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id, period_month
      FROM v_task_performance_monthly
     WHERE period_month >= date_trunc('month', now() - interval '1 month')::date
  LOOP
    PERFORM recompute_task_kpi(r.user_id, r.period_month);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION recompute_all_task_kpi() FROM PUBLIC;

-- Unschedule only if the job exists (migration stays re-runnable; the whole file
-- is one transaction, so a bare cron.schedule on a second pass would abort it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'task-kpi-recompute') THEN
    PERFORM cron.unschedule('task-kpi-recompute');
  END IF;
END $$;

SELECT cron.schedule(
  'task-kpi-recompute',
  '20 2 * * *',
  $$SELECT recompute_all_task_kpi()$$
);

-- ============================================================
-- 6. Backfill — populate derived KPI from tasks completed to date
-- ============================================================
SELECT recompute_all_task_kpi();

COMMIT;
