-- 058: Fix project_tables soft-delete
-- The UPDATE policy had only a USING clause; Postgres reused it as WITH CHECK,
-- so setting deleted_at (soft delete) failed the post-update check and the
-- DELETE route silently affected 0 rows. Add an explicit WITH CHECK that does
-- not require deleted_at IS NULL.

DROP POLICY "project_tables: update with project_table:edit" ON project_tables;

CREATE POLICY "project_tables: update with project_table:edit"
  ON project_tables FOR UPDATE
  USING (
    deleted_at IS NULL
    AND has_capability('project_table:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    has_capability('project_table:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );
