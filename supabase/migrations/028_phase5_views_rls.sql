-- Phase 5 · v_payment_status view + RLS policies

-- ── v_payment_status ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_payment_status AS
SELECT
  ps.id              AS schedule_id,
  ps.tenant_id,
  ps.project_id,
  ps.milestone_name,
  ps.amount_due,
  ps.due_date,
  ps.sequence_order,
  ps.notes,
  ps.is_paid,
  ps.triggered_at,
  ps.deleted_at,
  ps.created_at,
  ps.updated_at,
  COALESCE(SUM(pr.amount_paid), 0)              AS amount_received,
  COALESCE(SUM(pr.amount_paid), 0) - ps.amount_due AS variance
FROM payment_schedule ps
LEFT JOIN payment_records pr ON pr.payment_schedule_id = ps.id
WHERE ps.deleted_at IS NULL
GROUP BY ps.id;

GRANT SELECT ON v_payment_status TO authenticated;

-- ── RLS: payment_schedule ─────────────────────────────────────────────────
-- SELECT
CREATE POLICY "payment_schedule_select"
  ON payment_schedule FOR SELECT
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer_payments:view')
  );

-- INSERT
CREATE POLICY "payment_schedule_insert"
  ON payment_schedule FOR INSERT
  WITH CHECK (
    has_capability('customer_payments:edit')
  );

-- UPDATE — only unpaid, non-deleted rows
CREATE POLICY "payment_schedule_update"
  ON payment_schedule FOR UPDATE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer_payments:edit')
    AND is_paid = false
    AND deleted_at IS NULL
  )
  WITH CHECK (
    has_capability('customer_payments:edit')
  );

-- DELETE blocked — soft delete via UPDATE only

-- ── RLS: payment_records ──────────────────────────────────────────────────
-- SELECT
CREATE POLICY "payment_records_select"
  ON payment_records FOR SELECT
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer_payments:view')
  );

-- INSERT
CREATE POLICY "payment_records_insert"
  ON payment_records FOR INSERT
  WITH CHECK (
    has_capability('customer_payments:edit')
  );

-- UPDATE + DELETE blocked — payment records are immutable
