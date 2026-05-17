-- Phase 1 · Seed: Standard Architectural Lifecycle preset + Drawing Register preset
-- Both presets are scoped to the single tenant (Tare Design Studio).
-- is_system = true prevents deletion via UI.
-- Run AFTER migrations 010–013.

DO $$
DECLARE
  v_tenant_id    uuid;
  v_owner_id     uuid;
  v_template_id  uuid;
  v_preset_id    uuid;
  v_col1_id      uuid; v_col2_id uuid; v_col3_id uuid;
  v_col4_id      uuid; v_col5_id uuid; v_col6_id uuid; v_col7_id uuid;
  v_sec1_id      uuid; v_sec2_id uuid; v_sec3_id uuid; v_sec4_id uuid;
BEGIN
  -- Resolve tenant and owner from Phase 0 seed
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tare-design-studio' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant tare-design-studio not found — run Phase 0 seed first';
  END IF;

  SELECT id INTO v_owner_id FROM users WHERE tenant_id = v_tenant_id AND role = 'owner' LIMIT 1;

  -- ──────────────────────────────────────────────────────────────────
  -- 1. Standard Architectural Lifecycle checkpoint template
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO checkpoint_templates (tenant_id, name, description, is_system, created_by)
  VALUES (
    v_tenant_id,
    'Standard Architectural Lifecycle',
    '7-milestone default lifecycle: Kickoff → Concept → DD Approval → Construction Docs → Permits → Construction → Handover',
    true,
    v_owner_id
  )
  RETURNING id INTO v_template_id;

  INSERT INTO checkpoint_template_items
    (template_id, tenant_id, sequence_order, name, default_offset_days, requires_approval, default_payment_pct)
  VALUES
    (v_template_id, v_tenant_id, 1, 'Project Kickoff & Initial Survey',   0,   false, 10.00),
    (v_template_id, v_tenant_id, 2, 'Concept Design Submission',           30,  true,  15.00),
    (v_template_id, v_tenant_id, 3, 'Design Development Approval',         60,  true,  15.00),
    (v_template_id, v_tenant_id, 4, 'Construction Documentation',          120, false, 15.00),
    (v_template_id, v_tenant_id, 5, 'Permit & Regulatory Approvals',       150, false,  5.00),
    (v_template_id, v_tenant_id, 6, 'Construction Phase Completion',       240, true,  30.00),
    (v_template_id, v_tenant_id, 7, 'Final Project Handover',              270, true,  10.00);

  -- ──────────────────────────────────────────────────────────────────
  -- 2. Drawing Register table preset
  -- Columns: Sl No (serial) / Drawing Description (text) / Drawn (checkbox)
  --   / Checked (checkbox) / Revision (revision_text) / Issued to Site (checkbox) / Date (date)
  -- Sections per spec: Foundation Lvl, Ground Floor Set,
  --   Structural Upto GF Slab, Working Details Upto GF Slab
  -- Starter rows from client's reference image (sections 1 and 2)
  -- ──────────────────────────────────────────────────────────────────
  INSERT INTO table_presets (
    tenant_id, name, description, table_owner_role, is_system, is_default_for_role, created_by
  ) VALUES (
    v_tenant_id,
    'Drawing Register',
    'Standard architectural drawing register with issue tracking and revision history',
    'team_member',
    true,
    true,
    v_owner_id
  ) RETURNING id INTO v_preset_id;

  -- Columns
  INSERT INTO table_preset_columns (preset_id, name, column_kind, display_order, is_required)
  VALUES
    (v_preset_id, 'Sl No.',               'serial',        1, true)
  RETURNING id INTO v_col1_id;

  INSERT INTO table_preset_columns (preset_id, name, column_kind, display_order, is_required)
  VALUES (v_preset_id, 'Drawing No.',     'text',          2, false) RETURNING id INTO v_col2_id;

  INSERT INTO table_preset_columns (preset_id, name, column_kind, display_order, is_required)
  VALUES (v_preset_id, 'Description',     'text',          3, true)  RETURNING id INTO v_col3_id;

  INSERT INTO table_preset_columns (preset_id, name, column_kind, display_order, is_required)
  VALUES (v_preset_id, 'Drawn',           'checkbox',      4, false) RETURNING id INTO v_col4_id;

  INSERT INTO table_preset_columns (preset_id, name, column_kind, display_order, is_required)
  VALUES (v_preset_id, 'Checked',         'checkbox',      5, false) RETURNING id INTO v_col5_id;

  INSERT INTO table_preset_columns (preset_id, name, column_kind, display_order, is_required)
  VALUES (v_preset_id, 'Revision',        'revision_text', 6, false) RETURNING id INTO v_col6_id;

  INSERT INTO table_preset_columns (preset_id, name, column_kind, display_order, is_required)
  VALUES (v_preset_id, 'Issued to Site',  'checkbox',      7, false) RETURNING id INTO v_col7_id;

  -- Sections
  INSERT INTO table_preset_sections (preset_id, name, display_order)
  VALUES (v_preset_id, 'Structural Details Upto Foundation Lvl',         1) RETURNING id INTO v_sec1_id;

  INSERT INTO table_preset_sections (preset_id, name, display_order)
  VALUES (v_preset_id, 'Ground Floor Set',                               2) RETURNING id INTO v_sec2_id;

  INSERT INTO table_preset_sections (preset_id, name, display_order)
  VALUES (v_preset_id, 'Structural Details Upto Ground Floor Slab',      3) RETURNING id INTO v_sec3_id;

  INSERT INTO table_preset_sections (preset_id, name, display_order)
  VALUES (v_preset_id, 'Working Details Upto Ground Floor Slab',         4) RETURNING id INTO v_sec4_id;

  -- Starter rows — Section 1 (from client reference image)
  INSERT INTO table_preset_rows (preset_id, section_id, display_order, cells) VALUES
    (v_preset_id, v_sec1_id, 1,
     jsonb_build_object(
       v_col2_id::text, '101',
       v_col3_id::text, 'Site Plan',
       v_col4_id::text, true,
       v_col5_id::text, true,
       v_col6_id::text, 'R0',
       v_col7_id::text, true
     )),
    (v_preset_id, v_sec1_id, 2,
     jsonb_build_object(
       v_col2_id::text, '102',
       v_col3_id::text, 'Foundation Layout Plan',
       v_col4_id::text, true,
       v_col5_id::text, true,
       v_col6_id::text, 'R1',
       v_col7_id::text, true
     )),
    (v_preset_id, v_sec1_id, 3,
     jsonb_build_object(
       v_col2_id::text, '103',
       v_col3_id::text, 'Column Reinforcement Details',
       v_col4_id::text, false,
       v_col5_id::text, false,
       v_col6_id::text, '',
       v_col7_id::text, false
     )),
    (v_preset_id, v_sec1_id, 4,
     jsonb_build_object(
       v_col2_id::text, '104',
       v_col3_id::text, 'Foundation Section & Details',
       v_col4_id::text, false,
       v_col5_id::text, false,
       v_col6_id::text, '',
       v_col7_id::text, false
     ));

  -- Starter rows — Section 2 (Ground Floor Set)
  INSERT INTO table_preset_rows (preset_id, section_id, display_order, cells) VALUES
    (v_preset_id, v_sec2_id, 1,
     jsonb_build_object(
       v_col2_id::text, '201',
       v_col3_id::text, 'Ground Floor Plan',
       v_col4_id::text, true,
       v_col5_id::text, true,
       v_col6_id::text, 'R2',
       v_col7_id::text, true
     )),
    (v_preset_id, v_sec2_id, 2,
     jsonb_build_object(
       v_col2_id::text, '202',
       v_col3_id::text, 'Ground Floor RCP',
       v_col4_id::text, true,
       v_col5_id::text, true,
       v_col6_id::text, 'R0',
       v_col7_id::text, true
     )),
    (v_preset_id, v_sec2_id, 3,
     jsonb_build_object(
       v_col2_id::text, '203',
       v_col3_id::text, 'Ground Floor Sections A-A, B-B',
       v_col4_id::text, false,
       v_col5_id::text, false,
       v_col6_id::text, '',
       v_col7_id::text, false
     )),
    (v_preset_id, v_sec2_id, 4,
     jsonb_build_object(
       v_col2_id::text, '204',
       v_col3_id::text, 'Door & Window Schedule',
       v_col4_id::text, false,
       v_col5_id::text, false,
       v_col6_id::text, '',
       v_col7_id::text, false
     )),
    (v_preset_id, v_sec2_id, 5,
     jsonb_build_object(
       v_col2_id::text, '205',
       v_col3_id::text, 'Ground Floor Electrical Layout',
       v_col4_id::text, false,
       v_col5_id::text, false,
       v_col6_id::text, '',
       v_col7_id::text, false
     ));

  -- Sections 3 & 4 ship with no starter rows (added by the team per project)

END $$;
