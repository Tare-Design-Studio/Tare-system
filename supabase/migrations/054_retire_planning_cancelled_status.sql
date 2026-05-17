-- Product decision: project status is reduced to active / on_hold / completed.
-- The 'planning' and 'cancelled' values are retired from the UI and API.
-- Postgres enum values cannot be dropped without recreating the type, so the
-- enum keeps them for historical safety; this migration only re-homes the
-- live rows that still carry the retired values.
--
-- 'planning' projects become 'active' (work has been set up).
-- 'cancelled' projects, if any, become 'on_hold' (closest non-terminal state).

UPDATE projects SET status = 'active'
  WHERE status = 'planning' AND deleted_at IS NULL;

UPDATE projects SET status = 'on_hold'
  WHERE status = 'cancelled' AND deleted_at IS NULL;
