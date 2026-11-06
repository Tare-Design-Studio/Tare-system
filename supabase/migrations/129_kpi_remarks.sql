-- 129 · KPI remarks: manual point adjustments on a member's month.
--
-- Principal / admin (team:edit_user) can add a remark to a member's month that
-- adds or deducts points, tagged with a grade. The sum of a month's remark
-- points is added to overall_kpi_score in v_kpi_scores, so every reader (Team
-- page, Performance leaderboard, member profile) ranks on the adjusted score.
-- base_kpi_score keeps the formula-only number for display.
--
-- The view is CREATE OR REPLACE'd: existing columns keep name, order and type
-- (overall_kpi_score stays numeric); two columns are appended.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS kpi_remarks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month  date NOT NULL CHECK (EXTRACT(DAY FROM period_month) = 1),
  points        numeric(6,2) NOT NULL CHECK (points <> 0 AND points BETWEEN -1000 AND 1000),
  grade         text CHECK (grade IN ('A++','A+','A','B+','B','C','D')),
  note          text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 500),
  created_by    uuid REFERENCES users(id) DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_remarks_user_month
  ON kpi_remarks(user_id, period_month);
CREATE INDEX IF NOT EXISTS idx_kpi_remarks_tenant_month
  ON kpi_remarks(tenant_id, period_month);

COMMENT ON TABLE kpi_remarks IS
  'Manual +/- point adjustments with a grade tag on a member''s monthly KPI (129). Summed into v_kpi_scores.overall_kpi_score.';

ALTER TABLE kpi_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_remarks FORCE ROW LEVEL SECURITY;

-- Same read audience as team_performance_monthly (034), plus team:edit_user
-- since that is who writes them.
CREATE POLICY kpi_remarks_select ON kpi_remarks FOR SELECT
  USING (
    tenant_id = current_user_tenant_id()
    AND (
      has_capability('finance:view_dashboard')
      OR has_capability('team:edit_user')
      OR user_id = auth.uid()
    )
  );

-- No self-scoring: the writer can never adjust their own month.
CREATE POLICY kpi_remarks_insert ON kpi_remarks FOR INSERT
  WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('team:edit_user')
    AND user_id <> auth.uid()
    AND created_by = auth.uid()
  );

CREATE POLICY kpi_remarks_delete ON kpi_remarks FOR DELETE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('team:edit_user')
  );

REVOKE ALL ON TABLE kpi_remarks FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE kpi_remarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kpi_remarks TO service_role;

-- ── v_kpi_scores: fold remark points into the overall score ─────────────
CREATE OR REPLACE VIEW v_kpi_scores AS
WITH scored AS (
  SELECT
    tpm.*,
    tpm.drawings_completed * COALESCE(ks.efficiency_multiplier, 2.00)             AS eff,
    GREATEST(0, 100 - (tpm.errors    * COALESCE(ks.error_penalty,    4.00))
                    - (tpm.revisions * COALESCE(ks.revision_penalty, 2.00)))      AS qual,
    GREATEST(0, COALESCE(tpm.deadline_met_pct, 0)
                - (tpm.site_delay_days * COALESCE(ks.delay_penalty, 2.00)))       AS deliv,
    CASE
      WHEN COALESCE(ks.include_client_rating, false) AND tpm.client_rating IS NOT NULL
        THEN LEAST(100, GREATEST(0, tpm.client_rating * 20))
      ELSE NULL
    END                                                                            AS client,
    COALESCE(ks.weight_efficiency,   0.300) AS w_eff,
    COALESCE(ks.weight_quality,      0.400) AS w_qual,
    COALESCE(ks.weight_delivery,     0.300) AS w_deliv,
    CASE WHEN COALESCE(ks.include_client_rating, false)
         THEN COALESCE(ks.weight_client_rating, 0.000) ELSE 0 END AS w_client
  FROM team_performance_monthly tpm
  LEFT JOIN kpi_settings ks ON ks.tenant_id = tpm.tenant_id
),
based AS (
  SELECT
    s.*,
    ROUND(
      CASE
        WHEN s.w_client > 0 AND s.client IS NULL AND (s.w_eff + s.w_qual + s.w_deliv) > 0 THEN
          (s.eff * s.w_eff + s.qual * s.w_qual + s.deliv * s.w_deliv)
          / (s.w_eff + s.w_qual + s.w_deliv)
        ELSE
          s.eff * s.w_eff + s.qual * s.w_qual + s.deliv * s.w_deliv
          + COALESCE(s.client, 0) * s.w_client
      END
    , 2) AS base_score,
    COALESCE((
      SELECT SUM(r.points) FROM kpi_remarks r
       WHERE r.user_id = s.user_id
         AND r.tenant_id = s.tenant_id
         AND r.period_month = s.period_month
    ), 0) AS remark_pts
  FROM scored s
)
SELECT
  b.id,
  b.tenant_id,
  b.user_id,
  u.full_name,
  b.period_month,
  b.drawings_completed,
  b.errors,
  b.revisions,
  b.deadline_met_pct,
  b.client_rating,
  b.site_delay_days,
  b.notes,
  b.recorded_by,
  ROUND(b.eff,   2) AS efficiency_score,
  ROUND(b.qual,  2) AS quality_score,
  ROUND(b.deliv, 2) AS delivery_score,
  ROUND(b.client, 2) AS client_rating_score,
  ROUND(b.base_score + b.remark_pts, 2) AS overall_kpi_score,
  b.base_score      AS base_kpi_score,
  ROUND(b.remark_pts, 2) AS remark_points
FROM based b
JOIN users u ON u.id = b.user_id;

COMMENT ON VIEW v_kpi_scores IS
  'Per-user monthly KPI. Weights from kpi_settings (090), efficiency uncapped (102). overall_kpi_score = base_kpi_score + remark_points from kpi_remarks (129); may exceed 100 or go below 0.';

GRANT SELECT ON v_kpi_scores TO authenticated;
GRANT SELECT ON v_kpi_scores TO service_role;
