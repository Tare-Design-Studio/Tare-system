-- Phase 10 · Fix media_assets RLS — references to non-existent capabilities
--
-- 021_phase3_rls.sql wired two capability strings that were never declared in
-- lib/auth/capabilities.ts, so has_capability() always returned false for them:
--   media_select  → 'images:view_all'   (real capability: 'images:view')
--   media_update  → 'images:manage'     (real capability: 'images:select_for_customer')
--
-- Effect of the bug: an unassigned tenant admin / PM could not read project
-- images at all (the tenant-wide grant branch was dead); only assigned users
-- worked via is_assigned_to_project(). This corrects both policies.

DROP POLICY IF EXISTS media_select ON media_assets;
DROP POLICY IF EXISTS media_update ON media_assets;

-- SELECT: assigned to the project, OR holds the tenant-wide image-view grant.
CREATE POLICY media_select ON media_assets FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    is_assigned_to_project(project_id)
    OR has_capability('images:view')
  )
);

-- UPDATE: holders of images:select_for_customer (toggle visible_to_customer /
-- scan_status), or the uploader on a project they are assigned to.
CREATE POLICY media_update ON media_assets FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND (
    has_capability('images:select_for_customer')
    OR (uploaded_by = auth.uid() AND is_assigned_to_project(project_id))
  )
);
