-- Phase 10 · Auto-push uploaded images to the project's Google Drive folder
--
-- New site images / drawings are uploaded to Supabase Storage as before, then
-- pushed to the project's linked Drive folder (projects.drive_folder_url).
-- Supabase keeps only the 15 newest images per kind per project; older copies
-- are pruned ONCE confirmed synced to Drive — Drive is the permanent store.
--
-- These columns track per-asset Drive sync state so the UI can show a
-- "Retry Drive sync" button on failures and the pruner can skip un-synced rows.

ALTER TABLE media_assets
  ADD COLUMN drive_file_id     text,
  ADD COLUMN drive_sync_status text NOT NULL DEFAULT 'pending'
    CHECK (drive_sync_status IN ('pending', 'synced', 'failed', 'skipped')),
  ADD COLUMN drive_sync_error  text,
  ADD COLUMN drive_synced_at   timestamptz;

-- Pruner queries the newest synced rows per (project, kind); index that path.
CREATE INDEX idx_media_drive_sync
  ON media_assets(project_id, kind, drive_sync_status, created_at DESC);
