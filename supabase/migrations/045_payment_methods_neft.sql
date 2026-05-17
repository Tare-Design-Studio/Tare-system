-- Phase 10 · Add NEFT to payment methods
-- Pure additive CHECK change — existing rows continue to validate.

ALTER TABLE payment_records DROP CONSTRAINT payment_records_method_check;
ALTER TABLE payment_records ADD CONSTRAINT payment_records_method_check
  CHECK (method IN ('bank','neft','upi','cheque','cash'));
