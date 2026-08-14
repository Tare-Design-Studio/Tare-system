-- Uncap the efficiency pillar in v_kpi_scores.
--
-- 090 computed efficiency as LEAST(100, drawings_completed * efficiency_multiplier),
-- which truncated real output: at the default multiplier of 2.00 anyone past 50
-- completed items scored identically to someone at 500. The ceiling is removed so
-- monthly points accumulate without limit.
--
-- Scope, deliberately narrow — only the efficiency ceiling moves:
--   * quality  keeps GREATEST(0, 100 - penalties): it counts DOWN from a 100
--              baseline, so it has no ceiling to remove.
--   * delivery keeps its 0-based floor and deadline_met_pct input (0-100 by a
--              CHECK constraint in 034).
--   * client   keeps LEAST(100, rating * 20): rating is 1-5, so 100 is exact
--              and the LEAST never actually truncates.
--
-- Consequence, accepted: overall_kpi_score is a weighted average that includes
-- the now-unbounded efficiency pillar, so the total can exceed 100. It is an
-- index, no longer a percentage. The kpi_settings weight-sum CHECK (weights must
-- total 100%) is untouched and still meaningful — it governs the mix of pillars,
-- not the range of the result. Any UI rendering overall_kpi_score as a progress
-- bar or percentage must clamp at display time.
--
-- No backfill: v_kpi_scores is a VIEW over the team_performance_monthly raw
-- counts, so historical months re-derive under the new formula automatically.

-- Plain DROP, never CASCADE: as of 090 no other view depends on v_kpi_scores.
-- CREATE OR REPLACE is unusable here because the efficiency_score column changes
-- precision once the LEAST(100, ...) bound is gone.
DROP VIEW IF EXISTS v_kpi_scores;

CREATE VIEW v_kpi_scores AS
WITH scored AS (
  SELECT
    tpm.*,
    -- Uncapped: raw completed volume x the tenant's per-item multiplier.
    tpm.drawings_completed * COALESCE(ks.efficiency_multiplier, 2.00)             AS eff,
    GREATEST(0, 100 - (tpm.errors    * COALESCE(ks.error_penalty,    4.00))
                    - (tpm.revisions * COALESCE(ks.revision_penalty, 2.00)))      AS qual,
    GREATEST(0, COALESCE(tpm.deadline_met_pct, 0)
                - (tpm.site_delay_days * COALESCE(ks.delay_penalty, 2.00)))       AS deliv,
    -- client_rating is 1–5; scaled to 100 and only counted when switched on.
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
)
SELECT
  s.id,
  s.tenant_id,
  s.user_id,
  u.full_name,
  s.period_month,
  s.drawings_completed,
  s.errors,
  s.revisions,
  s.deadline_met_pct,
  s.client_rating,
  s.site_delay_days,
  s.notes,
  s.recorded_by,
  ROUND(s.eff,   2) AS efficiency_score,
  ROUND(s.qual,  2) AS quality_score,
  ROUND(s.deliv, 2) AS delivery_score,
  ROUND(s.client, 2) AS client_rating_score,
  ROUND(
    CASE
      -- When the client pillar is on but this row has no rating, its weight is
      -- redistributed across the other three instead of scoring it as zero —
      -- an unrated month must not read as a bad month.
      WHEN s.w_client > 0 AND s.client IS NULL AND (s.w_eff + s.w_qual + s.w_deliv) > 0 THEN
        (s.eff * s.w_eff + s.qual * s.w_qual + s.deliv * s.w_deliv)
        / (s.w_eff + s.w_qual + s.w_deliv)
      ELSE
        s.eff * s.w_eff + s.qual * s.w_qual + s.deliv * s.w_deliv
        + COALESCE(s.client, 0) * s.w_client
    END
  , 2) AS overall_kpi_score
FROM scored s
JOIN users u ON u.id = s.user_id;

COMMENT ON VIEW v_kpi_scores IS
  'Per-user monthly KPI. Pillar weights and penalties come from kpi_settings (090); inputs remain derived from reviewed tasks (084). Efficiency is uncapped as of 102, so overall_kpi_score may exceed 100.';

GRANT SELECT ON v_kpi_scores TO authenticated;
