-- Phase 10 · checkpoint:progress capability
-- No capability registry table exists; capabilities are documented in
-- lib/auth/capabilities.ts and granted via user_capabilities rows.
-- This migration is a no-op placeholder documenting the new capability.
--
-- The capability 'checkpoint:progress' is added to:
--   - OWNER_CAPABILITIES (all caps)
--   - TAG_CAPABILITIES.project_manager
-- in lib/auth/capabilities.ts (application layer).
--
-- The API route (PATCH /api/projects/[id]/checkpoints/[checkpointId])
-- checks has_capability('checkpoint:progress') before allowing
-- start/complete/reset operations.

-- No SQL changes needed — capability enforcement is purely application-layer.
-- This file serves as a migration marker for Phase 10 capability additions.
SELECT 1;
