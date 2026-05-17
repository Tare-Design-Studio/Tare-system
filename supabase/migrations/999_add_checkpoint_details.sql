ALTER TABLE project_checkpoints
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS completion_percentage numeric(5,2) DEFAULT 0;
