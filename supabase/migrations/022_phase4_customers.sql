-- Phase 4 · Customers table + deferred FK wiring
-- Wires projects.customer_id FK now that customers table exists.

-- ─────────────────────────────────────────────────────────────
-- customers
-- ─────────────────────────────────────────────────────────────

CREATE TABLE customers (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES tenants(id),
  name                      text        NOT NULL,
  phone                     text,
  email                     text,
  address                   text,
  created_from_enquiry_id   uuid,       -- FK added below after enquiries table is created
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- Deferred FK: projects.customer_id → customers(id)
-- Column was created nullable in Phase 1 (010_phase1_projects.sql)
-- without a FK constraint because customers didn't exist yet.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE projects
  ADD CONSTRAINT projects_customer_id_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id);
