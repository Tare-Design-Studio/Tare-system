-- 090: Owner-editable KPI weights and penalties.
--
-- Client requests #9 and #10: judge team members on different KPIs, and be able
-- to change the KPI themselves.
--
-- Today every number in v_kpi_scores (034) is hardcoded: the 30/40/30 pillar
-- weights, the ×2 efficiency scale, the −4 per error, −2 per revision, −2 per
-- delay day. Changing any of them means a migration. This moves them into a
-- per-tenant settings row and rewrites the view to read it.
--
-- What deliberately does NOT change:
--   The INPUTS stay derived. team_performance_monthly is filled by
--   recompute_task_kpi() (084) from reviewed member_tasks, and 086/087 stop a
--   member reviewing their own work. Editable *weights* are a scoring policy
--   the owner sets once; editable *inputs* would be self-scoring. Only users
--   with `performance:configure` may write here, and that capability is
--   excluded from tags (see lib/auth/capabilities.ts) so it cannot be picked up
--   by being tagged accountant/admin.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS kpi_settings (
  tenant_id            uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Pillar weights. Constrained to sum to 1 by the trigger below.
  weight_efficiency    numeric(4,3) NOT NULL DEFAULT 0.300 CHECK (weight_efficiency BETWEEN 0 AND 1),
  weight_quality       numeric(4,3) NOT NULL DEFAULT 0.400 CHECK (weight_quality    BETWEEN 0 AND 1),
  weight_delivery      numeric(4,3) NOT NULL DEFAULT 0.300 CHECK (weight_delivery   BETWEEN 0 AND 1),

  -- Efficiency: score = LEAST(100, drawings_completed * efficiency_multiplier)
  efficiency_multiplier numeric(5,2) NOT NULL DEFAULT 2.00 CHECK (efficiency_multiplier > 0),

  -- Quality: score = 100 - errors*penalty - revisions*penalty
  error_penalty        numeric(5,2) NOT NULL DEFAULT 4.00 CHECK (error_penalty    >= 0),
  revision_penalty     numeric(5,2) NOT NULL DEFAULT 2.00 CHECK (revision_penalty >= 0),

  -- Delivery: score = deadline_met_pct - site_delay_days*penalty
  delay_penalty        numeric(5,2) NOT NULL DEFAULT 2.00 CHECK (delay_penalty    >= 0),

  -- Optional fourth pillar the client can switch on: the customer's own rating
  -- (1–5, from client_feedback in 091) scaled to 100. Off by default so
  -- existing scores do not move the moment this migration lands.
  include_client_rating boolean      NOT NULL DEFAULT false,
  weight_client_rating  numeric(4,3) NOT NULL DEFAULT 0.000 CHECK (weight_client_rating BETWEEN 0 AND 1),

  updated_by           uuid REFERENCES users(id),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE kpi_settings IS
  'Per-tenant KPI scoring policy read by v_kpi_scores. Weights only — the underlying counts stay derived from reviewed tasks.';

-- Weights must total 100%, otherwise the "score out of 100" stops meaning
-- anything. Enforced in a trigger rather than a CHECK so the error message can
-- say what is wrong. Rounded to absorb numeric(4,3) representation.
CREATE OR REPLACE FUNCTION validate_kpi_weights()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_sum numeric;
BEGIN
  v_sum := NEW.weight_efficiency + NEW.weight_quality + NEW.weight_delivery
         + CASE WHEN NEW.include_client_rating THEN NEW.weight_client_rating ELSE 0 END;

  IF ROUND(v_sum, 3) <> 1.000 THEN
    -- In plpgsql `%` is the placeholder and `%%` is a literal percent sign.
    RAISE EXCEPTION 'KPI weights must add up to 100%% (got %)', ROUND(v_sum * 100, 1);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kpi_settings_validate ON kpi_settings;
CREATE TRIGGER kpi_settings_validate
  BEFORE INSERT OR UPDATE ON kpi_settings
  FOR EACH ROW EXECUTE FUNCTION validate_kpi_weights();

ALTER TABLE kpi_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_settings FORCE ROW LEVEL SECURITY;

-- Everyone in the tenant may read the policy they are scored against —
-- an unexplained score is worse than no score.
CREATE POLICY kpi_settings_select ON kpi_settings FOR SELECT
  USING (tenant_id = current_user_tenant_id());

CREATE POLICY kpi_settings_write ON kpi_settings FOR ALL
  USING (has_capability('performance:configure') AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_capability('performance:configure') AND tenant_id = current_user_tenant_id());

REVOKE ALL ON TABLE kpi_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE kpi_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE kpi_settings TO service_role;

-- Seed defaults for every existing tenant so the view always finds a row.
INSERT INTO kpi_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- New tenants get defaults automatically.
CREATE OR REPLACE FUNCTION seed_kpi_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO kpi_settings (tenant_id) VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_seed_kpi_settings ON tenants;
CREATE TRIGGER tenants_seed_kpi_settings
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION seed_kpi_settings();

-- ── v_kpi_scores, now weight-driven ────────────────────────────────
--
-- Same column list and column order as 034 so existing readers keep working;
-- the constants are replaced by joins onto kpi_settings. LEFT JOIN + COALESCE
-- so a tenant without a settings row still scores with the 034 defaults rather
-- than returning NULL.

-- Plain DROP, never CASCADE: verified no other view depends on v_kpi_scores,
-- and CREATE OR REPLACE cannot be used because the score columns change type
-- (034 returned integer; the weighted form returns numeric).
DROP VIEW IF EXISTS v_kpi_scores;

CREATE VIEW v_kpi_scores AS
WITH scored AS (
  SELECT
    tpm.*,
    LEAST(100, tpm.drawings_completed * COALESCE(ks.efficiency_multiplier, 2.00)) AS eff,
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
  'Per-user monthly KPI. Pillar weights and penalties come from kpi_settings (090); inputs remain derived from reviewed tasks (084).';

GRANT SELECT ON v_kpi_scores TO authenticated;
