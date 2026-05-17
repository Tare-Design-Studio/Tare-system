-- Phase 3 · Communication tables
-- updates, media_assets, bridge_messages, team_daily_tasks,
-- owner_broadcasts, owner_broadcast_recipients + triggers

-- ─────────────────────────────────────────────────────────────
-- updates
-- ─────────────────────────────────────────────────────────────

CREATE TABLE updates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id             uuid NOT NULL REFERENCES users(id),
  author_role_on_project text NOT NULL,
  update_type           text NOT NULL CHECK (
                          update_type IN (
                            'note',
                            'image',
                            'drawing',
                            'progress',
                            'remark',
                            'material',
                            'expense'
                          )
                        ),
  body                  text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_updates_project_time
  ON updates(project_id, created_at DESC);

CREATE INDEX idx_updates_author
  ON updates(author_id, created_at DESC);

ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_updates_set_tenant
  BEFORE INSERT ON updates
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_from_project();

-- ─────────────────────────────────────────────────────────────
-- media_assets
-- ─────────────────────────────────────────────────────────────

CREATE TABLE media_assets (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id),
  project_id                  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  storage_path                text NOT NULL,

  bucket                      text NOT NULL DEFAULT 'media-private'
                                CHECK (
                                  bucket IN (
                                    'media-private',
                                    'media-customer-public'
                                  )
                                ),

  kind                        text NOT NULL CHECK (
                                kind IN (
                                  'site_image',
                                  'drawing',
                                  'receipt',
                                  'document'
                                )
                              ),

  uploaded_by                 uuid NOT NULL REFERENCES users(id),

  taken_at                    timestamptz,

  visible_to_customer         boolean NOT NULL DEFAULT false,

  linked_update_id            uuid REFERENCES updates(id),

  linked_checkpoint_item_id   uuid REFERENCES checkpoint_items(id),

  scan_status                 text NOT NULL DEFAULT 'pending'
                                CHECK (
                                  scan_status IN (
                                    'pending',
                                    'clean',
                                    'infected',
                                    'error'
                                  )
                                ),

  is_clean                    boolean GENERATED ALWAYS AS (
                                scan_status = 'clean'
                              ) STORED,

  scanned_at                  timestamptz,
  scan_error                  text,

  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_project_kind
  ON media_assets(project_id, kind);

CREATE INDEX idx_media_unscanned
  ON media_assets(scan_status)
  WHERE scan_status <> 'clean';

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_media_set_tenant
  BEFORE INSERT ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_from_project();

-- ─────────────────────────────────────────────────────────────
-- bridge_messages
-- ─────────────────────────────────────────────────────────────

CREATE TABLE bridge_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id           uuid NOT NULL REFERENCES users(id),

  message_type        text NOT NULL DEFAULT 'text'
                        CHECK (
                          message_type IN (
                            'text',
                            'image',
                            'drawing_ref',
                            'material_request',
                            'clarification'
                          )
                        ),

  body                text,

  structured_payload  jsonb,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridge_project_time
  ON bridge_messages(project_id, created_at ASC);

ALTER TABLE bridge_messages ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_bridge_set_tenant
  BEFORE INSERT ON bridge_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_from_project();

-- ─────────────────────────────────────────────────────────────
-- material_request -> material_plan side effect
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION bridge_material_request_to_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.message_type = 'material_request'
     AND NEW.structured_payload IS NOT NULL
  THEN
    INSERT INTO material_plan (
      tenant_id,
      project_id,
      item_name,
      unit,
      planned_quantity,
      source_bridge_message_id
    )
    VALUES (
      NEW.tenant_id,
      NEW.project_id,
      NEW.structured_payload->>'item_name',
      COALESCE(NEW.structured_payload->>'unit', 'unit'),
      COALESCE((NEW.structured_payload->>'quantity')::numeric, 1),
      NEW.id
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_bridge_material_request
  AFTER INSERT ON bridge_messages
  FOR EACH ROW
  EXECUTE FUNCTION bridge_material_request_to_plan();

-- ─────────────────────────────────────────────────────────────
-- team_daily_tasks
-- ─────────────────────────────────────────────────────────────

CREATE TABLE team_daily_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),

  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  project_id    uuid REFERENCES projects(id),

  task_date     date NOT NULL DEFAULT current_date,

  description   text NOT NULL CHECK (
                  length(description) BETWEEN 1 AND 200
                ),

  is_done       boolean NOT NULL DEFAULT false,

  done_at       timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_tasks_user_date
  ON team_daily_tasks(user_id, task_date DESC);

CREATE INDEX idx_daily_tasks_tenant_date
  ON team_daily_tasks(tenant_id, task_date DESC);

ALTER TABLE team_daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_daily_tasks_updated_at
  BEFORE UPDATE ON team_daily_tasks
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

-- Auto-set done_at

CREATE OR REPLACE FUNCTION set_task_done_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.is_done = true AND OLD.is_done = false THEN
    NEW.done_at := now();

  ELSIF NEW.is_done = false THEN
    NEW.done_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_daily_tasks_done_at
  BEFORE UPDATE ON team_daily_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_done_at();

-- ─────────────────────────────────────────────────────────────
-- owner_broadcasts
-- ─────────────────────────────────────────────────────────────

CREATE TABLE owner_broadcasts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id        uuid NOT NULL REFERENCES tenants(id),

  author_id        uuid NOT NULL REFERENCES users(id),

  body             text NOT NULL,

  attachment_url   text,

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_broadcasts_tenant_time
  ON owner_broadcasts(tenant_id, created_at DESC);

ALTER TABLE owner_broadcasts ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- owner_broadcast_recipients
-- ─────────────────────────────────────────────────────────────

CREATE TABLE owner_broadcast_recipients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id          uuid NOT NULL REFERENCES tenants(id),

  broadcast_id       uuid NOT NULL
                        REFERENCES owner_broadcasts(id)
                        ON DELETE CASCADE,

  user_id            uuid NOT NULL
                        REFERENCES users(id)
                        ON DELETE CASCADE,

  is_acknowledged    boolean NOT NULL DEFAULT false,

  acknowledged_at    timestamptz,

  UNIQUE (broadcast_id, user_id)
);

CREATE INDEX idx_broadcast_recipients_user
  ON owner_broadcast_recipients(user_id, broadcast_id);

ALTER TABLE owner_broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- set_tenant_from_broadcast trigger function
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_tenant_from_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  SELECT ob.tenant_id
  INTO NEW.tenant_id
  FROM owner_broadcasts ob
  WHERE ob.id = NEW.broadcast_id;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid broadcast_id: %', NEW.broadcast_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_broadcast_recipients_tenant
  BEFORE INSERT ON owner_broadcast_recipients
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_from_broadcast();

-- ─────────────────────────────────────────────────────────────
-- acknowledged_at auto-set
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_broadcast_ack_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.is_acknowledged = true
     AND OLD.is_acknowledged = false
  THEN
    NEW.acknowledged_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_broadcast_ack_at
  BEFORE UPDATE ON owner_broadcast_recipients
  FOR EACH ROW
  EXECUTE FUNCTION set_broadcast_ack_at();

-- ─────────────────────────────────────────────────────────────
-- material_plan linkage
-- ─────────────────────────────────────────────────────────────

ALTER TABLE material_plan
ADD COLUMN IF NOT EXISTS source_bridge_message_id uuid
REFERENCES bridge_messages(id);