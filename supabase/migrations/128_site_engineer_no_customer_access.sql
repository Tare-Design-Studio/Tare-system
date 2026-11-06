-- 128 · Site engineers never see customer data.
--
-- Client rule: no site engineer — including one carrying the project_manager
-- tag (which confers customer:view / customer_payments:view) or a manual grant —
-- may read customer information. Enforced inside has_capability() so every RLS
-- policy, RPC and API check that asks for customer:* or customer_payments:*
-- answers false for role = 'site_engineer', whatever user_capabilities says.
-- Tag sync can keep writing rows; they are simply inert for this role.

CREATE OR REPLACE FUNCTION has_capability(p_capability text, p_project_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_is_active boolean;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RETURN false; END IF;

  SELECT tenant_id, is_active, role
    INTO v_tenant_id, v_is_active, v_role
    FROM users
   WHERE id = v_user_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT v_is_active THEN RETURN false; END IF;

  IF v_role = 'site_engineer'
     AND (p_capability LIKE 'customer:%' OR p_capability LIKE 'customer\_payments:%') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_capabilities
     WHERE user_id   = v_user_id
       AND capability = p_capability
       AND granted    = true
       AND tenant_id  = v_tenant_id
       AND (scope_project_id IS NULL OR scope_project_id = p_project_id)
  );
END;
$$;
