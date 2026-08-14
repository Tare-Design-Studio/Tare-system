-- Comp-off credits: a member who worked a weekend/holiday claims +1 leave day.
--
-- Client request: "plus and minus thing" — taking leave spends the balance (-1,
-- already handled by v_leave_balance's used_days), and working a non-working day
-- earns it back (+1, added here).
--
-- Why a new table rather than a leave_requests row with kind='comp_off':
-- leave_requests models CONSUMPTION — every row subtracts via used_days, and its
-- date range means "I am away". A credit is the opposite sign and a single worked
-- date. Overloading the same table would make the row's meaning depend on its
-- kind, and the existing overlap check in POST /api/leave would then reject a
-- credit for a Saturday that sits inside an approved holiday. Separate table,
-- same approval discipline.
--
-- Self-approval is blocked exactly as 086 does for task review and 088 for leave
-- decisions: a member files a pending claim, an approver with leave:approve
-- decides it, and only an APPROVED credit moves the balance.

CREATE TABLE IF NOT EXISTS comp_off_credits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date     date NOT NULL,
  -- Fixed at 1 day per claim; half-day comp-off is not a thing the client asked
  -- for and a free-form number here would be self-service entitlement.
  days          numeric(3,1) NOT NULL DEFAULT 1 CHECK (days = 1),
  reason        text NOT NULL CHECK (btrim(reason) <> ''),
  status        leave_status NOT NULL DEFAULT 'pending',
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- One claim per worked date, so the same Saturday cannot be banked twice.
  -- Covers cancelled/rejected rows too: re-claiming a refused date should go
  -- through the approver, not through a fresh insert.
  CONSTRAINT comp_off_one_per_date UNIQUE (user_id, work_date),
  CONSTRAINT comp_off_decision_complete CHECK (
    (status IN ('pending', 'cancelled')) OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comp_off_user_date   ON comp_off_credits(user_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_comp_off_tenant_stat ON comp_off_credits(tenant_id, status, work_date DESC);

CREATE OR REPLACE FUNCTION touch_comp_off_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comp_off_touch_updated ON comp_off_credits;
CREATE TRIGGER comp_off_touch_updated
  BEFORE UPDATE ON comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION touch_comp_off_updated_at();

-- tenant_id is derived from the row's user, never taken from the client.
CREATE OR REPLACE FUNCTION set_comp_off_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comp_off_set_tenant ON comp_off_credits;
CREATE TRIGGER comp_off_set_tenant
  BEFORE INSERT ON comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION set_comp_off_tenant();

-- Mirrors guard_leave_decision (088): you cannot approve your own credit, and a
-- decided credit is final. Without this, RLS alone would let a member holding
-- leave:approve bank unlimited days for themselves.
CREATE OR REPLACE FUNCTION guard_comp_off_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'pending' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'A decided comp-off claim can no longer be edited';
  END IF;

  -- The claimant may only ever withdraw their own pending claim.
  IF auth.uid() = OLD.user_id THEN
    IF NEW.status NOT IN ('pending', 'cancelled') THEN
      RAISE EXCEPTION 'You cannot decide your own comp-off claim';
    END IF;
    IF NEW.decided_by IS DISTINCT FROM OLD.decided_by
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
      RAISE EXCEPTION 'You cannot write decision fields on your own comp-off claim';
    END IF;
  END IF;

  -- work_date and days are immutable after filing: editing them post-approval
  -- would silently re-point an already-granted credit.
  IF NEW.work_date IS DISTINCT FROM OLD.work_date OR NEW.days IS DISTINCT FROM OLD.days THEN
    RAISE EXCEPTION 'work_date and days cannot be changed after filing';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_comp_off_decision ON comp_off_credits;
CREATE TRIGGER trg_guard_comp_off_decision
  BEFORE UPDATE ON comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION guard_comp_off_decision();

ALTER TABLE comp_off_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp_off_credits FORCE ROW LEVEL SECURITY;

CREATE POLICY comp_off_select_own ON comp_off_credits FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY comp_off_select_all ON comp_off_credits FOR SELECT
  USING (has_capability('leave:view_all') AND tenant_id = current_user_tenant_id());

-- Filing reuses leave:request — someone entitled to ask for leave is entitled to
-- claim the comp-off that funds it. Status is forced to 'pending' here, so a
-- member cannot insert a pre-approved credit.
CREATE POLICY comp_off_insert_own ON comp_off_credits FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = current_user_tenant_id()
    AND has_capability('leave:request')
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
  );

CREATE POLICY comp_off_update_own ON comp_off_credits FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY comp_off_update_approver ON comp_off_credits FOR UPDATE
  USING (has_capability('leave:approve') AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_capability('leave:approve') AND tenant_id = current_user_tenant_id());

CREATE POLICY comp_off_delete_admin ON comp_off_credits FOR DELETE
  USING (has_capability('leave:approve') AND tenant_id = current_user_tenant_id());

REVOKE ALL ON TABLE comp_off_credits FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE comp_off_credits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp_off_credits TO service_role;

-- ── v_leave_balance, now credit-aware ──────────────────────────────
--
-- Same column list and order as 088 so existing readers keep working, plus two
-- new trailing columns (earned_days, pending_earned_days). Entitlement becomes
-- annual_leave_days + approved comp-off credits for the current year.
--
-- The credit aggregate is computed in a subquery rather than another LEFT JOIN:
-- joining two independent one-to-many tables would multiply rows and inflate
-- both SUMs.
--
-- Plain DROP, never CASCADE: entitled_days widens from numeric(5,1) to
-- numeric(6,1) once credits are added in, which CREATE OR REPLACE VIEW cannot
-- do. Verified no other view depends on v_leave_balance — it is read by
-- app/api/leave/route.ts only.
DROP VIEW IF EXISTS v_leave_balance;

CREATE VIEW v_leave_balance AS
WITH credits AS (
  SELECT
    user_id,
    COALESCE(SUM(days) FILTER (
      WHERE status = 'approved'
        AND date_part('year', work_date) = date_part('year', CURRENT_DATE)
    ), 0)::numeric(6,1) AS earned_days,
    COALESCE(SUM(days) FILTER (WHERE status = 'pending'), 0)::numeric(6,1) AS pending_earned_days
  FROM comp_off_credits
  GROUP BY user_id
)
SELECT
  u.id                AS user_id,
  u.tenant_id,
  (t.annual_leave_days + COALESCE(c.earned_days, 0))::numeric(6,1) AS entitled_days,
  COALESCE(SUM(l.days) FILTER (
    WHERE l.status = 'approved'
      AND l.kind <> 'unpaid'
      AND date_part('year', l.start_date) = date_part('year', CURRENT_DATE)
  ), 0)::numeric(6,1) AS used_days,
  COALESCE(SUM(l.days) FILTER (WHERE l.status = 'pending'), 0)::numeric(6,1) AS pending_days,
  COUNT(*) FILTER (WHERE l.status = 'pending')::int AS pending_count,
  GREATEST(
    t.annual_leave_days + COALESCE(c.earned_days, 0) - COALESCE(SUM(l.days) FILTER (
      WHERE l.status = 'approved'
        AND l.kind <> 'unpaid'
        AND date_part('year', l.start_date) = date_part('year', CURRENT_DATE)
    ), 0),
    0
  )::numeric(6,1) AS remaining_days,
  COALESCE(c.earned_days, 0)::numeric(6,1)         AS earned_days,
  COALESCE(c.pending_earned_days, 0)::numeric(6,1) AS pending_earned_days
FROM users u
JOIN tenants t ON t.id = u.tenant_id
LEFT JOIN leave_requests l ON l.user_id = u.id
LEFT JOIN credits c        ON c.user_id = u.id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.tenant_id, t.annual_leave_days, c.earned_days, c.pending_earned_days;

COMMENT ON VIEW v_leave_balance IS
  'Per-user leave position for the current year. Unpaid leave does not consume entitlement. Entitlement = tenants.annual_leave_days + approved comp_off_credits (103).';

COMMENT ON TABLE comp_off_credits IS
  'Approved weekend/holiday work that adds +1 to a member''s annual leave entitlement. Pending until an approver with leave:approve decides it.';

GRANT SELECT ON v_leave_balance TO authenticated;
