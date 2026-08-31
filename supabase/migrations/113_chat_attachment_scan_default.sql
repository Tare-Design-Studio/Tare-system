-- 113: Make the chat attachment scan gate mean something.
--
-- 107 gave chat_attachments a scan_status column mirroring media_assets, and
-- the signing route refuses 'infected'. Nothing in this codebase ever writes
-- that value — there is no scanner. Verified: no migration and no route sets
-- scan_status anywhere, on either table, so media_assets rows have sat at
-- 'pending' since 020 and its GENERATED is_clean column has always been false.
--
-- So the chat gate as written refuses a state that cannot occur, and admits
-- 'pending', which is every row. That is a check that reads as protection and
-- provides none.
--
-- Two honest options: gate on 'clean' and block all chat images until a scanner
-- exists, or admit that unscanned images are served and stop implying
-- otherwise. Blocking every image in a chat feature that ships today would make
-- the feature useless, so this takes the second and narrows the blast radius:
--
--   * 'quarantined' is added to the CHECK so an operator (or a future scanner)
--     can pull a specific file without inventing a value the constraint refuses;
--   * the default stays 'pending' and the route now refuses BOTH 'infected' and
--     'quarantined', so the gate has a reachable deny path;
--   * chat images are already private-bucket, signed-URL, 30-minute, and
--     readable only by conversation participants, which is the actual control.
--
-- When a scanner is introduced it flips rows to 'clean'/'infected' and the route
-- can be tightened to require 'clean' in one line. This migration deliberately
-- does not pretend that has happened.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

ALTER TABLE chat_attachments DROP CONSTRAINT IF EXISTS chat_attachments_scan_status_check;
ALTER TABLE chat_attachments
  ADD CONSTRAINT chat_attachments_scan_status_check
  CHECK (scan_status IN ('pending', 'clean', 'infected', 'quarantined', 'error'));

-- Serves the operator sweep "show me everything not yet cleared", and stays
-- small because it excludes the clean rows that will one day be the bulk.
CREATE INDEX IF NOT EXISTS chat_attachments_unscanned
  ON chat_attachments (scan_status)
  WHERE scan_status <> 'clean';

COMMENT ON COLUMN chat_attachments.scan_status IS
  'pending (default — NO scanner runs today), clean, infected, quarantined (operator hold), error. '
  'The signing route refuses infected and quarantined. Tighten it to require clean once a scanner exists.';
