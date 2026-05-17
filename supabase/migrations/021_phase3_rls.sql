-- Phase 3 · RLS policies + privilege grants

-- ── updates ──────────────────────────────────────────────────
ALTER TABLE updates FORCE ROW LEVEL SECURITY;

CREATE POLICY updates_select ON updates FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    has_capability('progress:view', project_id)
    OR is_assigned_to_project(project_id)
  )
);

CREATE POLICY updates_insert ON updates FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND author_id = auth.uid()
  AND (
    has_capability('progress:update', project_id)
    OR is_assigned_to_project(project_id)
  )
);

-- No UPDATE/DELETE — updates are append-only

-- ── media_assets ──────────────────────────────────────────────
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;

CREATE POLICY media_select ON media_assets FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    is_assigned_to_project(project_id)
    OR has_capability('images:view_all')
  )
);

CREATE POLICY media_insert ON media_assets FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND uploaded_by = auth.uid()
  AND has_capability('images:upload', project_id)
  AND is_assigned_to_project(project_id)
);

-- Owner can toggle visible_to_customer and update scan_status
CREATE POLICY media_update ON media_assets FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND (
    has_capability('images:manage')
    OR (uploaded_by = auth.uid() AND is_assigned_to_project(project_id))
  )
);

-- ── bridge_messages ───────────────────────────────────────────
ALTER TABLE bridge_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY bridge_select ON bridge_messages FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    has_capability('bridge:read', project_id)
    OR is_assigned_to_project(project_id)
  )
);

CREATE POLICY bridge_insert ON bridge_messages FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND author_id = auth.uid()
  AND (
    has_capability('bridge:write', project_id)
    OR is_assigned_to_project(project_id)
  )
);

-- No UPDATE/DELETE — bridge messages are immutable

-- ── team_daily_tasks ──────────────────────────────────────────
ALTER TABLE team_daily_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY daily_tasks_select ON team_daily_tasks FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    user_id = auth.uid()
    OR has_capability('daily_tasks:view_all')
  )
);

CREATE POLICY daily_tasks_insert ON team_daily_tasks FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND user_id = auth.uid()
);

CREATE POLICY daily_tasks_update ON team_daily_tasks FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND user_id = auth.uid()
) WITH CHECK (
  user_id = auth.uid()
);

-- ── owner_broadcasts ──────────────────────────────────────────
ALTER TABLE owner_broadcasts FORCE ROW LEVEL SECURITY;

-- Recipient can read broadcasts sent to them; author can read own
CREATE POLICY broadcasts_select ON owner_broadcasts FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    has_capability('broadcast:create')
    OR EXISTS (
      SELECT 1 FROM owner_broadcast_recipients r
      WHERE r.broadcast_id = id
        AND r.user_id = auth.uid()
    )
  )
);

CREATE POLICY broadcasts_insert ON owner_broadcasts FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND author_id = auth.uid()
  AND has_capability('broadcast:create')
);

-- ── owner_broadcast_recipients ────────────────────────────────
ALTER TABLE owner_broadcast_recipients FORCE ROW LEVEL SECURITY;

CREATE POLICY broadcast_recipients_select ON owner_broadcast_recipients FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    user_id = auth.uid()
    OR has_capability('broadcast:create')
  )
);

CREATE POLICY broadcast_recipients_insert ON owner_broadcast_recipients FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND has_capability('broadcast:create')
);

-- Recipient acknowledges their own row only
CREATE POLICY broadcast_recipients_ack ON owner_broadcast_recipients FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND user_id = auth.uid()
) WITH CHECK (
  user_id = auth.uid()
  AND is_acknowledged = true
);

-- ── Privilege grants ──────────────────────────────────────────
GRANT SELECT, INSERT           ON updates                      TO authenticated;
GRANT SELECT, INSERT, UPDATE   ON media_assets                 TO authenticated;
GRANT SELECT, INSERT           ON bridge_messages              TO authenticated;
GRANT SELECT, INSERT, UPDATE   ON team_daily_tasks             TO authenticated;
GRANT SELECT, INSERT           ON owner_broadcasts             TO authenticated;
GRANT SELECT, INSERT, UPDATE   ON owner_broadcast_recipients   TO authenticated;
