-- 059: Edit/delete for updates and broadcasts
-- Updates: in-place edit + soft delete by the authoring user.
-- Broadcasts: in-place edit by the authoring owner.

-- ── Schema ────────────────────────────────────────────────────
ALTER TABLE updates
  ADD COLUMN edited_at  timestamptz,
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE owner_broadcasts
  ADD COLUMN edited_at timestamptz;

-- ── updates RLS ───────────────────────────────────────────────
-- Hide soft-deleted rows.
DROP POLICY updates_select ON updates;
CREATE POLICY updates_select ON updates FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND deleted_at IS NULL
  AND (
    has_capability('progress:view', project_id)
    OR is_assigned_to_project(project_id)
  )
);

-- Author can edit / soft-delete their own update (soft delete is an UPDATE).
CREATE POLICY updates_update ON updates FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND author_id = auth.uid()
) WITH CHECK (
  author_id = auth.uid()
);

-- ── owner_broadcasts RLS ──────────────────────────────────────
-- Author (owner) can edit their own broadcast.
CREATE POLICY broadcasts_update ON owner_broadcasts FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND author_id = auth.uid()
  AND has_capability('broadcast:create')
) WITH CHECK (
  author_id = auth.uid()
  AND has_capability('broadcast:create')
);

-- ── Privilege grants ──────────────────────────────────────────
GRANT UPDATE ON updates         TO authenticated;
GRANT UPDATE ON owner_broadcasts TO authenticated;
