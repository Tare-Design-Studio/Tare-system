-- 086: Block self-review on assigned tasks (KPI-inflation fix).
--
-- Fix-forward for 083 — never edit an applied migration, scripts/migrate.ts tracks
-- by filename and an edit is a silent no-op.
--
-- THE HOLE. 083 added guard_member_task_review() to stop a REVIEWER rewriting a
-- task's owner or its time log, and gated `owner_review_tasks` on
-- `assigned_by IS NOT NULL`. Neither closes self-review:
--
--   1. `member_own_tasks` (038) is FOR ALL ... USING (user_id = auth.uid()) and is
--      PERMISSIVE. Postgres OR's permissive policies, so a member's UPDATE of their
--      OWN row is authorised by that policy no matter what owner_review_tasks says.
--   2. guard_member_task_review() returns early when `auth.uid() = OLD.user_id`,
--      by design — the member owns their own clock and title.
--
-- So a member holding `tasks:assign` (project_manager / accountant / admin tags —
-- not just the owner) could PATCH their OWN assigned task with
-- review_status='clean', status='completed'. 084 feeds review_status and volume
-- straight into v_task_performance_monthly -> team_performance_monthly ->
-- v_kpi_scores, making this self-serve leaderboard inflation. This is the exact
-- threat 083's own header describes; 083 only closed the RLS half of it.
--
-- THE FIX. Extend the guard so the review VERDICT is rejected on your own row.
-- Deliberately narrow — it fires only when review_status actually changes, so a
-- member can still accept/start/submit/edit/delete their own task exactly as before.
--
-- A self-set todo (assigned_by IS NULL) never carries a verdict, so it is
-- unaffected: the check requires OLD.assigned_by IS NOT NULL.
--
-- Service-role / cron / migration context (auth.uid() IS NULL) is exempt, matching
-- 083 — recompute jobs and backfills must keep working.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT — no BEGIN/COMMIT here.

CREATE OR REPLACE FUNCTION guard_member_task_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Service-role / cron / migration context is not a reviewer.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- NEW: nobody signs off their own assigned work, whatever capability they hold.
  IF auth.uid() = OLD.user_id
     AND OLD.assigned_by IS NOT NULL
     AND NEW.review_status IS DISTINCT FROM OLD.review_status
     AND NEW.review_status IS NOT NULL THEN
    RAISE EXCEPTION 'you cannot review your own assigned task'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The member owns the rest of their own row (title, clock, accept/start/submit).
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- ---- reviewer path (unchanged from 083) ----
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'a reviewer cannot reassign a task (user_id/tenant_id immutable)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'a reviewer cannot alter task time-logging timestamps'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged (083 created trg_guard_member_task_review); only the
-- function body is replaced. Name order stays load-bearing:
-- member_task_before_update (038) < trg_guard_member_task_review.
