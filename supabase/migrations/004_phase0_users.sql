-- Phase 0 · Users, sessions, capabilities

-- Enums
CREATE TYPE app_role AS ENUM ('owner', 'team_member', 'site_engineer');
CREATE TYPE project_stage  AS ENUM ('design', 'execution');
CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE project_type   AS ENUM ('residential', 'commercial', 'institutional', 'industrial', 'interior', 'landscape', 'other');
CREATE TYPE notification_severity AS ENUM ('info', 'warning', 'critical');

-- Users (mirrors auth.users 1:1)
CREATE TABLE users (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  role                    app_role NOT NULL,
  role_label              text,                          -- human-readable override
  full_name               text NOT NULL,
  phone                   text,
  experience_years        int,
  skill_score             numeric(4,1),
  salary_inr              numeric(12,2),
  is_active               boolean NOT NULL DEFAULT true,
  mfa_enrolled_at         timestamptz,
  invitation_token_hash   text,                          -- SHA-256 of one-time invite token
  last_login_at           timestamptz,
  password_last_changed_at timestamptz,
  deleted_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role   ON users(tenant_id, role) WHERE deleted_at IS NULL AND is_active = true;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ── User sessions ──────────────────────────────────────────────────
CREATE TABLE user_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label text,
  ip_address   inet,
  user_agent   text,
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id) WHERE revoked_at IS NULL;

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- ── User capabilities (access matrix) ─────────────────────────────
CREATE TABLE user_capabilities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability       text NOT NULL,
  granted          boolean NOT NULL DEFAULT true,
  scope_project_id uuid,                                 -- NULL = all projects
  granted_by       uuid REFERENCES users(id),
  granted_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, capability, scope_project_id)
);

CREATE INDEX idx_caps_user ON user_capabilities(user_id, capability) WHERE granted = true;

ALTER TABLE user_capabilities ENABLE ROW LEVEL SECURITY;

-- Non-delegable: access_control:manage is Owner-only
CREATE OR REPLACE FUNCTION enforce_access_control_manage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_role app_role;
BEGIN
  IF NEW.capability <> 'access_control:manage' THEN RETURN NEW; END IF;
  SELECT role INTO v_role FROM users WHERE id = NEW.user_id;
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'access_control:manage cannot be granted to non-owners';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cap_access_control
  BEFORE INSERT OR UPDATE ON user_capabilities
  FOR EACH ROW EXECUTE FUNCTION enforce_access_control_manage();
