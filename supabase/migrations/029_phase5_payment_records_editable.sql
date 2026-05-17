-- Phase 5.1 · Make payment_records editable by customer_payments:edit holders
-- Previously immutable (no UPDATE/DELETE policies). This migration adds both.
-- Records remain audited via the existing audit_trigger on the table.

-- UPDATE: only own-tenant rows, requires edit capability
CREATE POLICY "payment_records_update"
  ON payment_records FOR UPDATE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer_payments:edit')
  )
  WITH CHECK (
    has_capability('customer_payments:edit')
  );

-- DELETE: only own-tenant rows, requires edit capability
-- Hard delete is intentional here — records are not audit-chained like expenses.
CREATE POLICY "payment_records_delete"
  ON payment_records FOR DELETE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer_payments:edit')
  );
