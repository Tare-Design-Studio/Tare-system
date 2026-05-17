-- Phase 8 · Team Performance — monthly KPI inputs and derived scores

-- ============================================================
-- TABLE: team_performance_monthly
-- ============================================================

CREATE TABLE team_performance_monthly (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month      date NOT NULL,            -- first of the month, e.g. '2026-01-01'
  drawings_completed int NOT NULL DEFAULT 0,
  errors            int NOT NULL DEFAULT 0,
  revisions         int NOT NULL DEFAULT 0,
  deadline_met_pct  numeric(5,2),             -- 0–100
  client_rating     numeric(3,1),             -- 1–10
  site_delay_days   int NOT NULL DEFAULT 0,
  notes             text,
  recorded_by       uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_month),
  CHECK (deadline_met_pct IS NULL OR (deadline_met_pct >= 0 AND deadline_met_pct <= 100)),
  CHECK (client_rating IS NULL OR (client_rating >= 1 AND client_rating <= 10))
);

CREATE INDEX idx_team_perf_tenant_month
  ON team_performance_monthly(tenant_id, period_month DESC);

CREATE INDEX idx_team_perf_user_month
  ON team_performance_monthly(user_id, period_month DESC);

CREATE TRIGGER team_performance_monthly_updated_at
  BEFORE UPDATE ON team_performance_monthly
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- VIEW: v_kpi_scores
-- Derived scores matching the KPI_Scoring sheet shape.
-- Weights: Efficiency 30%, Quality 40%, Delivery 30%.
-- ============================================================

CREATE OR REPLACE VIEW v_kpi_scores AS
SELECT
  tpm.id,
  tpm.tenant_id,
  tpm.user_id,
  u.full_name,
  tpm.period_month,
  tpm.drawings_completed,
  tpm.errors,
  tpm.revisions,
  tpm.deadline_met_pct,
  tpm.client_rating,
  tpm.site_delay_days,
  tpm.notes,
  tpm.recorded_by,
  -- Efficiency: drawings_completed normalised (owner can rescale via notes)
  LEAST(100, tpm.drawings_completed * 2) AS efficiency_score,
  -- Quality: penalise errors and revisions
  GREATEST(0, 100 - (tpm.errors * 4) - (tpm.revisions * 2)) AS quality_score,
  -- Delivery: deadline_met_pct adjusted for site delays
  GREATEST(0, COALESCE(tpm.deadline_met_pct, 0) - (tpm.site_delay_days * 2)) AS delivery_score,
  -- Overall weighted average
  ROUND(
    (LEAST(100, tpm.drawings_completed * 2)) * 0.30
    + (GREATEST(0, 100 - (tpm.errors * 4) - (tpm.revisions * 2))) * 0.40
    + (GREATEST(0, COALESCE(tpm.deadline_met_pct, 0) - (tpm.site_delay_days * 2))) * 0.30
  , 2) AS overall_kpi_score
FROM team_performance_monthly tpm
JOIN users u ON u.id = tpm.user_id;

-- ============================================================
-- VIEW: v_employee_revenue_contribution
-- Growth Dashboard equivalent: revenue contribution per employee,
-- derived from project budget × contribution_pct on each project.
-- ============================================================

CREATE OR REPLACE VIEW v_employee_revenue_contribution AS
SELECT
  pa.user_id,
  u.full_name,
  DATE_TRUNC('month', CURRENT_DATE)::date AS period_month,
  SUM(p.budget_total * pa.contribution_pct / 100.0) AS revenue_contribution,
  COUNT(DISTINCT pa.project_id) AS active_project_count
FROM project_assignments pa
JOIN projects p ON p.id = pa.project_id
JOIN users u ON u.id = pa.user_id
WHERE p.deleted_at IS NULL
  AND p.status IN ('active', 'completed')
GROUP BY pa.user_id, u.full_name;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE team_performance_monthly ENABLE ROW LEVEL SECURITY;

-- Owner with finance:view_dashboard can read all. Team members can read own row.
CREATE POLICY "team_perf_select" ON team_performance_monthly
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
    AND (
      has_capability('finance:view_dashboard')
      OR user_id = auth.uid()
    )
  );

-- Only users with team:edit_user (Owner) can INSERT
CREATE POLICY "team_perf_insert" ON team_performance_monthly
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
    AND has_capability('team:edit_user')
  );

-- Only users with team:edit_user can UPDATE
CREATE POLICY "team_perf_update" ON team_performance_monthly
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
    AND has_capability('team:edit_user')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
    AND has_capability('team:edit_user')
  );
