-- Phase 6 · Project table row revision trigger
-- Appends a project_table_row_revisions row on every UPDATE to project_table_rows.
-- revision_number auto-increments per row.

CREATE OR REPLACE FUNCTION record_table_row_revision()
RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_next_rev int;
  v_user_id  uuid;
BEGIN
  -- Only record when cells actually changed
  IF OLD.cells = NEW.cells THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1
    INTO v_next_rev
    FROM project_table_row_revisions
   WHERE row_id = NEW.id;

  -- updated_by was set by the caller before the UPDATE
  v_user_id := NEW.updated_by;

  INSERT INTO project_table_row_revisions
    (tenant_id, row_id, revision_number, cells_before, cells_after, changed_by, changed_at)
  VALUES
    (NEW.tenant_id, NEW.id, v_next_rev, OLD.cells, NEW.cells, v_user_id, now());

  RETURN NEW;
END $$;

CREATE TRIGGER trg_table_row_revision
  AFTER UPDATE ON project_table_rows
  FOR EACH ROW EXECUTE FUNCTION record_table_row_revision();

-- ── Storage bucket grants ──────────────────────────────────────────────
-- media-private and media-customer-public buckets are created via the
-- Supabase dashboard or Storage API. These policies restrict row-level
-- access inside the bucket (Supabase Storage RLS on objects table).

-- Note: Supabase Storage RLS lives in the storage schema. We document
-- the required policies here for the migration runbook; actual bucket
-- creation is done via dashboard or the Supabase Management API.
--
-- Policy for media-private:
--   SELECT: authenticated users with media:view capability on the owning project
--   INSERT: authenticated users with media:upload capability
--
-- Policy for media-customer-public:
--   SELECT: public (anon) — objects in this bucket are always public
--   INSERT: authenticated users with media:upload capability
--
-- Since Supabase Storage RLS is managed separately from Postgres table RLS,
-- no SQL statements are needed here beyond this comment block.

COMMENT ON FUNCTION record_table_row_revision() IS
  'Appends a revision row whenever project_table_rows.cells changes. '
  'Revision number increments per row, not globally.';
