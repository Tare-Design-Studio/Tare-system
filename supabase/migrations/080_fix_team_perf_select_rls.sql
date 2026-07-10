-- Fix RLS policy on team_performance_monthly so admins (team:edit_user) can also read the data.

DROP POLICY IF EXISTS "team_perf_select" ON team_performance_monthly;

CREATE POLICY "team_perf_select" ON team_performance_monthly
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
    AND (
      has_capability('finance:view_dashboard')
      OR has_capability('team:edit_user')
      OR user_id = auth.uid()
    )
  );
