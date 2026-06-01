-- 069_demo_seed.sql  —  DEMO DATA (reversible via supabase/demo_teardown.sql)
--
-- Populates Tare Design Studio with a realistic, full-coverage data set for
-- demonstrations: team members + site engineers (with real logins), customers,
-- enquiries, projects (design-only + execution, active/on_hold/completed),
-- checkpoints, payments, materials, expenses, updates, attendance, tasks,
-- broadcasts, performance and reminders.
--
-- EVERY demo row uses a fixed UUID under the `dec0de00-…` namespace so the
-- teardown can delete exactly these rows and nothing else.
--
-- Demo logins (password for ALL: demo1234):
--   priya@demo.tare    — team member (project_manager tag)
--   arjun@demo.tare    — team member (accountant tag)
--   meera@demo.tare    — team member
--   rohan@demo.tare    — team member
--   vikram@demo.tare   — site engineer
--   sneha@demo.tare    — site engineer
--
-- NOTE: the migrate runner wraps each file in its own transaction — do NOT add BEGIN/COMMIT here.

-- ─────────────────────────────────────────────────────────────
-- 0. Anchors (existing tenant + owner)
-- ─────────────────────────────────────────────────────────────
-- tenant : d4784db6-9a2d-4075-97b5-14daaa9026ab  (Tare Design Studio)
-- owner  : fdcf8ca6-a98d-4ebd-9765-f2869f60b504  (Nayan Kumar)

-- Set office GPS so demo attendance is "within geofence" (Bengaluru centre).
UPDATE tenants
   SET office_lat = 12.971599,
       office_lng = 77.594566,
       office_geofence_radius_m = COALESCE(office_geofence_radius_m, 200)
 WHERE id = 'd4784db6-9a2d-4075-97b5-14daaa9026ab';

-- ─────────────────────────────────────────────────────────────
-- 1. Auth users  (so demo accounts can actually log in)
-- ─────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000','dec0de00-0000-0000-0000-000000000001','authenticated','authenticated','priya@demo.tare',  crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','dec0de00-0000-0000-0000-000000000002','authenticated','authenticated','arjun@demo.tare',  crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','dec0de00-0000-0000-0000-000000000003','authenticated','authenticated','meera@demo.tare',  crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','dec0de00-0000-0000-0000-000000000004','authenticated','authenticated','rohan@demo.tare',  crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','dec0de00-0000-0000-0000-000000000005','authenticated','authenticated','vikram@demo.tare', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000','dec0de00-0000-0000-0000-000000000006','authenticated','authenticated','sneha@demo.tare',  crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{}', now(), now());

-- GoTrue scans these token columns into non-nullable Go strings; a NULL there
-- makes login fail with "Database error querying schema". Set them to ''.
UPDATE auth.users
   SET confirmation_token     = '',
       recovery_token         = '',
       email_change           = '',
       email_change_token_new = ''
 WHERE email LIKE '%@demo.tare';

-- Email identities (required by GoTrue for email/password sign-in)
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
VALUES
  ('dec0de00-0000-0000-0000-0000000000a1','dec0de00-0000-0000-0000-000000000001','dec0de00-0000-0000-0000-000000000001','email','{"sub":"dec0de00-0000-0000-0000-000000000001","email":"priya@demo.tare"}',  now(), now(), now()),
  ('dec0de00-0000-0000-0000-0000000000a2','dec0de00-0000-0000-0000-000000000002','dec0de00-0000-0000-0000-000000000002','email','{"sub":"dec0de00-0000-0000-0000-000000000002","email":"arjun@demo.tare"}',  now(), now(), now()),
  ('dec0de00-0000-0000-0000-0000000000a3','dec0de00-0000-0000-0000-000000000003','dec0de00-0000-0000-0000-000000000003','email','{"sub":"dec0de00-0000-0000-0000-000000000003","email":"meera@demo.tare"}',  now(), now(), now()),
  ('dec0de00-0000-0000-0000-0000000000a4','dec0de00-0000-0000-0000-000000000004','dec0de00-0000-0000-0000-000000000004','email','{"sub":"dec0de00-0000-0000-0000-000000000004","email":"rohan@demo.tare"}',  now(), now(), now()),
  ('dec0de00-0000-0000-0000-0000000000a5','dec0de00-0000-0000-0000-000000000005','dec0de00-0000-0000-0000-000000000005','email','{"sub":"dec0de00-0000-0000-0000-000000000005","email":"vikram@demo.tare"}', now(), now(), now()),
  ('dec0de00-0000-0000-0000-0000000000a6','dec0de00-0000-0000-0000-000000000006','dec0de00-0000-0000-0000-000000000006','email','{"sub":"dec0de00-0000-0000-0000-000000000006","email":"sneha@demo.tare"}',  now(), now(), now());

-- ─────────────────────────────────────────────────────────────
-- 2. App users
-- ─────────────────────────────────────────────────────────────
INSERT INTO users (id, tenant_id, role, role_label, full_name, phone, experience_years, skill_score, salary_inr, is_active)
VALUES
  ('dec0de00-0000-0000-0000-000000000001','d4784db6-9a2d-4075-97b5-14daaa9026ab','team_member','Project Manager','Priya Nair',  '+919800000001', 8, 8.5, 95000,  true),
  ('dec0de00-0000-0000-0000-000000000002','d4784db6-9a2d-4075-97b5-14daaa9026ab','team_member','Accountant',     'Arjun Rao',   '+919800000002', 6, 7.5, 78000,  true),
  ('dec0de00-0000-0000-0000-000000000003','d4784db6-9a2d-4075-97b5-14daaa9026ab','team_member','Architect',      'Meera Iyer',  '+919800000003', 4, 8.0, 65000,  true),
  ('dec0de00-0000-0000-0000-000000000004','d4784db6-9a2d-4075-97b5-14daaa9026ab','team_member','Draftsman',      'Rohan Gupta', '+919800000004', 3, 6.5, 48000,  true),
  ('dec0de00-0000-0000-0000-000000000005','d4784db6-9a2d-4075-97b5-14daaa9026ab','site_engineer','Site Engineer','Vikram Singh','+919800000005', 7, 7.8, 72000,  true),
  ('dec0de00-0000-0000-0000-000000000006','d4784db6-9a2d-4075-97b5-14daaa9026ab','site_engineer','Site Engineer','Sneha Pillai','+919800000006', 5, 7.2, 60000,  true);

-- Base capabilities per role (mirror lib/auth/capabilities.ts default sets).
-- team members
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, source)
SELECT 'd4784db6-9a2d-4075-97b5-14daaa9026ab', u.id, c.cap, true, 'manual'
FROM (VALUES
  ('dec0de00-0000-0000-0000-000000000001'::uuid),
  ('dec0de00-0000-0000-0000-000000000002'::uuid),
  ('dec0de00-0000-0000-0000-000000000003'::uuid),
  ('dec0de00-0000-0000-0000-000000000004'::uuid)
) AS u(id)
CROSS JOIN (VALUES
  ('project:view_assigned'),('progress:view'),('bridge:read'),('bridge:write'),
  ('images:upload'),('images:view'),('calendar:view_own'),('daily_tasks:write_own'),
  ('daily_tasks:export_own'),('broadcast:receive'),('project_table:view'),
  ('project_table:edit'),('office_attendance:write_own'),('member_tasks:write_own'),
  ('personal_reminders:write_own')
) AS c(cap);

-- site engineers
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, source)
SELECT 'd4784db6-9a2d-4075-97b5-14daaa9026ab', u.id, c.cap, true, 'manual'
FROM (VALUES
  ('dec0de00-0000-0000-0000-000000000005'::uuid),
  ('dec0de00-0000-0000-0000-000000000006'::uuid)
) AS u(id)
CROSS JOIN (VALUES
  ('project:view_assigned'),('materials:consume'),('materials:view'),('progress:update'),
  ('progress:view'),('checklist:edit'),('expenses:create'),('expenses:view'),
  ('images:upload'),('images:view'),('site_check_in:write'),('office_attendance:write_own'),
  ('calendar:view_own'),('broadcast:receive'),('project_table:view'),('project_table:edit')
) AS c(cap);

-- Tags (the 065 triggers add the source='tag' capability rows automatically).
INSERT INTO team_member_tags (id, tenant_id, user_id, tag, granted_by)
VALUES
  ('dec0de00-0000-0000-0000-0000000000b1','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000001','project_manager','fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-0000000000b2','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000002','accountant',     'fdcf8ca6-a98d-4ebd-9765-f2869f60b504');

-- ─────────────────────────────────────────────────────────────
-- 3. Customers
-- ─────────────────────────────────────────────────────────────
INSERT INTO customers (id, tenant_id, name, phone, email, address)
VALUES
  ('dec0de00-0000-0000-0000-000000000c01','d4784db6-9a2d-4075-97b5-14daaa9026ab','Sharma Family',     '+919811100001','sharma@example.com',  'Indiranagar, Bengaluru'),
  ('dec0de00-0000-0000-0000-000000000c02','d4784db6-9a2d-4075-97b5-14daaa9026ab','Kapoor Residency',  '+919811100002','kapoor@example.com',  'Whitefield, Bengaluru'),
  ('dec0de00-0000-0000-0000-000000000c03','d4784db6-9a2d-4075-97b5-14daaa9026ab','Mehta Enterprises', '+919811100003','mehta@example.com',   'MG Road, Bengaluru'),
  ('dec0de00-0000-0000-0000-000000000c04','d4784db6-9a2d-4075-97b5-14daaa9026ab','Desai Villa',       '+919811100004','desai@example.com',   'Koramangala, Bengaluru'),
  ('dec0de00-0000-0000-0000-000000000c05','d4784db6-9a2d-4075-97b5-14daaa9026ab','Reddy Constructions','+919811100005','reddy@example.com',  'HSR Layout, Bengaluru'),
  ('dec0de00-0000-0000-0000-000000000c06','d4784db6-9a2d-4075-97b5-14daaa9026ab','Fernandes Home',    '+919811100006','fernandes@example.com','Frazer Town, Bengaluru');

-- ─────────────────────────────────────────────────────────────
-- 4. Enquiries  (spread across the pipeline)
-- ─────────────────────────────────────────────────────────────
INSERT INTO enquiries (id, tenant_id, name, phone, phone_normalized, email, source, status, message, created_via, created_by, created_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000e01','d4784db6-9a2d-4075-97b5-14daaa9026ab','Anil Joshi',    '+919822200001','+919822200001','anil@example.com',    'referral','new',                  'Looking for a 3BHK interior design.',          'manual',     'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '2 days'),
  ('dec0de00-0000-0000-0000-000000000e02','d4784db6-9a2d-4075-97b5-14daaa9026ab','Kavya Menon',   '+919822200002','+919822200002','kavya@example.com',   'instagram','quotation_sent',       'Villa elevation redesign — quotation needed.', 'public_form','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '6 days'),
  ('dec0de00-0000-0000-0000-000000000e03','d4784db6-9a2d-4075-97b5-14daaa9026ab','Suresh Babu',   '+919822200003','+919822200003','suresh@example.com',  'website','awaiting_approval',     'Commercial office fitout, 4000 sqft.',         'public_form','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '11 days'),
  ('dec0de00-0000-0000-0000-000000000e04','d4784db6-9a2d-4075-97b5-14daaa9026ab','Divya Nambiar', '+919822200004','+919822200004','divya@example.com',   'whatsapp','closed_for_discussion','Wants to revisit budget next quarter.',        'manual',     'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '20 days'),
  ('dec0de00-0000-0000-0000-000000000e05','d4784db6-9a2d-4075-97b5-14daaa9026ab','Sharma Family', '+919811100001','+919811100001','sharma@example.com',  'referral','converted',            'Converted to project.',                        'manual',     'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '60 days'),
  ('dec0de00-0000-0000-0000-000000000e06','d4784db6-9a2d-4075-97b5-14daaa9026ab','Ramesh Kumar',  '+919822200006','+919822200006','ramesh@example.com',  'youtube','lost',                   'Went with another firm.',                      'public_form','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '45 days'),
  ('dec0de00-0000-0000-0000-000000000e07','d4784db6-9a2d-4075-97b5-14daaa9026ab','Latha Krishnan','+919822200007','+919822200007','latha@example.com',   'walk_in','new',                    'Renovation of ancestral home.',                'manual',     'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '1 day'),
  ('dec0de00-0000-0000-0000-000000000e08','d4784db6-9a2d-4075-97b5-14daaa9026ab','Mehta Enterprises','+919811100003','+919811100003','mehta@example.com','referral','converted',            'Converted to commercial project.',             'manual',     'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '90 days');

-- Link the converted enquiries to their customers.
UPDATE enquiries SET converted_to_customer_id = 'dec0de00-0000-0000-0000-000000000c01' WHERE id = 'dec0de00-0000-0000-0000-000000000e05';
UPDATE enquiries SET converted_to_customer_id = 'dec0de00-0000-0000-0000-000000000c03' WHERE id = 'dec0de00-0000-0000-0000-000000000e08';
UPDATE customers SET created_from_enquiry_id = 'dec0de00-0000-0000-0000-000000000e05' WHERE id = 'dec0de00-0000-0000-0000-000000000c01';
UPDATE customers SET created_from_enquiry_id = 'dec0de00-0000-0000-0000-000000000e08' WHERE id = 'dec0de00-0000-0000-0000-000000000c03';

-- Enquiry remarks
INSERT INTO enquiry_remarks (id, tenant_id, enquiry_id, remark, created_by, created_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000f01','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000e02','Sent quotation v1, awaiting feedback.','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '5 days'),
  ('dec0de00-0000-0000-0000-000000000f02','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000e03','Client reviewing internally; follow up Friday.','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '3 days');

-- Enquiry / customer reminders
INSERT INTO enquiry_reminders (id, tenant_id, enquiry_id, customer_id, user_id, remind_at, message, category, priority)
VALUES
  ('dec0de00-0000-0000-0000-000000000fa1','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000e02',NULL,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() + interval '1 day',  'Call Kavya re: quotation', 'call',       'high'),
  ('dec0de00-0000-0000-0000-000000000fa2','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000e03',NULL,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() + interval '3 days', 'Follow up on office fitout', 'follow_up','normal'),
  ('dec0de00-0000-0000-0000-000000000fa3','d4784db6-9a2d-4075-97b5-14daaa9026ab',NULL,'dec0de00-0000-0000-0000-000000000c01','dec0de00-0000-0000-0000-000000000005', now() + interval '2 days', 'Site visit — Sharma Villa', 'site_visit','high');

-- ─────────────────────────────────────────────────────────────
-- 5. Projects
--   p1 Sharma Villa     — execution, active   (customer c01)
--   p2 Kapoor Residency — design_only, active  (customer c02)
--   p3 Mehta Office     — execution, active   (customer c03)
--   p4 Desai Villa      — execution, completed (customer c04)
--   p5 Reddy Towers     — execution, on_hold  (customer c05)
-- ─────────────────────────────────────────────────────────────
INSERT INTO projects (
  id, tenant_id, name, slug, customer_id, project_type, scope, current_stage,
  site_location, site_lat, site_lng, status, on_hold_reason,
  budget_total, estimated_work_hours, estimated_duration_days,
  start_date, expected_end_date, actual_start_date, actual_end_date,
  created_by
)
VALUES
  ('dec0de00-0000-0000-0000-000000000101','d4784db6-9a2d-4075-97b5-14daaa9026ab','Sharma Villa','demo-sharma-villa','dec0de00-0000-0000-0000-000000000c01','residential','design_and_execution','execution','Indiranagar, Bengaluru',12.971599,77.594566,'active',NULL,8500000,1200,210, current_date - 60, current_date + 150, current_date - 55, NULL,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000102','d4784db6-9a2d-4075-97b5-14daaa9026ab','Kapoor Residency','demo-kapoor-residency','dec0de00-0000-0000-0000-000000000c02','residential','design_only','design','Whitefield, Bengaluru',12.969800,77.749800,'active',NULL,1800000,300,90, current_date - 30, current_date + 60, current_date - 28, NULL,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000103','d4784db6-9a2d-4075-97b5-14daaa9026ab','Mehta Office Fitout','demo-mehta-office','dec0de00-0000-0000-0000-000000000c03','commercial','design_and_execution','execution','MG Road, Bengaluru',12.975700,77.606100,'active',NULL,12000000,1600,240, current_date - 90, current_date + 150, current_date - 85, NULL,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000104','d4784db6-9a2d-4075-97b5-14daaa9026ab','Desai Villa','demo-desai-villa','dec0de00-0000-0000-0000-000000000c04','residential','design_and_execution','execution','Koramangala, Bengaluru',12.935200,77.624500,'completed',NULL,6200000,1000,180, current_date - 240, current_date - 30, current_date - 235, current_date - 28,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000105','d4784db6-9a2d-4075-97b5-14daaa9026ab','Reddy Towers','demo-reddy-towers','dec0de00-0000-0000-0000-000000000c05','commercial','design_and_execution','execution','HSR Layout, Bengaluru',12.911700,77.641100,'on_hold','Awaiting revised municipal approval.',22000000,2400,365, current_date - 120, current_date + 245, current_date - 110, NULL,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504');

-- Assignments
INSERT INTO project_assignments (id, tenant_id, project_id, user_id, role_on_project, contribution_pct, assigned_by)
VALUES
  -- Sharma Villa
  ('dec0de00-0000-0000-0000-000000000201','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000001','pm',           40,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000202','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000003','lead_architect',35,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000203','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000005','site_engineer',25,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  -- Kapoor Residency (design only)
  ('dec0de00-0000-0000-0000-000000000204','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000102','dec0de00-0000-0000-0000-000000000003','lead_architect',60,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000205','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000102','dec0de00-0000-0000-0000-000000000004','drafting',     40,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  -- Mehta Office
  ('dec0de00-0000-0000-0000-000000000206','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000103','dec0de00-0000-0000-0000-000000000001','pm',           30,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000207','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000103','dec0de00-0000-0000-0000-000000000006','site_engineer',35,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000208','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000103','dec0de00-0000-0000-0000-000000000004','drafting',     35,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  -- Desai Villa (completed)
  ('dec0de00-0000-0000-0000-000000000209','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000104','dec0de00-0000-0000-0000-000000000003','lead_architect',50,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-00000000020a','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000104','dec0de00-0000-0000-0000-000000000005','site_engineer',50,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  -- Reddy Towers (on hold)
  ('dec0de00-0000-0000-0000-00000000020b','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000105','dec0de00-0000-0000-0000-000000000001','pm',           50,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-00000000020c','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000105','dec0de00-0000-0000-0000-000000000006','site_engineer',50,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504');

-- ─────────────────────────────────────────────────────────────
-- 6. Checkpoints
-- ─────────────────────────────────────────────────────────────
INSERT INTO project_checkpoints (id, tenant_id, project_id, name, sequence_order, due_date, completed_at, requires_approval, approved_at, approved_by, started_at)
VALUES
  -- Sharma Villa
  ('dec0de00-0000-0000-0000-000000000301','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000101','Concept Design',     1, current_date - 40, now() - interval '38 days', true,  now() - interval '37 days','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '52 days'),
  ('dec0de00-0000-0000-0000-000000000302','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000101','Working Drawings',   2, current_date - 10, now() - interval '8 days',  true,  now() - interval '7 days', 'fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '36 days'),
  ('dec0de00-0000-0000-0000-000000000303','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000101','Structure',          3, current_date + 30, NULL, true, NULL, NULL, now() - interval '6 days'),
  ('dec0de00-0000-0000-0000-000000000304','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000101','Finishing',          4, current_date + 120,NULL, true, NULL, NULL, NULL),
  -- Kapoor Residency (design only)
  ('dec0de00-0000-0000-0000-000000000305','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000102','Concept Design',     1, current_date - 5,  now() - interval '4 days', true, now() - interval '3 days','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '25 days'),
  ('dec0de00-0000-0000-0000-000000000306','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000102','Design Development', 2, current_date + 25, NULL, true, NULL, NULL, now() - interval '2 days'),
  -- Mehta Office
  ('dec0de00-0000-0000-0000-000000000307','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000103','Design Sign-off',    1, current_date - 60, now() - interval '58 days', true, now() - interval '57 days','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '84 days'),
  ('dec0de00-0000-0000-0000-000000000308','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000103','Civil Works',        2, current_date - 5,  NULL, true, NULL, NULL, now() - interval '50 days'),
  -- Desai Villa (completed — all done)
  ('dec0de00-0000-0000-0000-000000000309','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000104','Design',             1, current_date - 200,now() - interval '205 days', true, now() - interval '204 days','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '230 days'),
  ('dec0de00-0000-0000-0000-00000000030a','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000104','Construction',       2, current_date - 60, now() - interval '40 days',  true, now() - interval '38 days','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '200 days'),
  ('dec0de00-0000-0000-0000-00000000030b','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000104','Handover',           3, current_date - 30, now() - interval '28 days',  true, now() - interval '28 days','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '45 days'),
  -- Reddy Towers (on hold)
  ('dec0de00-0000-0000-0000-00000000030c','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000105','Concept Design',     1, current_date - 80, now() - interval '78 days', true, now() - interval '77 days','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '108 days'),
  ('dec0de00-0000-0000-0000-00000000030d','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000105','Approvals',          2, current_date - 20, NULL, true, NULL, NULL, now() - interval '70 days');

-- Checkpoint items (sub-tasks) for the active Structure checkpoint on Sharma Villa
INSERT INTO checkpoint_items (id, tenant_id, checkpoint_id, description, is_complete, completed_by, completed_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000311','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000303','Foundation excavation', true,  'dec0de00-0000-0000-0000-000000000005', now() - interval '5 days'),
  ('dec0de00-0000-0000-0000-000000000312','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000303','Footing concrete pour', true,  'dec0de00-0000-0000-0000-000000000005', now() - interval '2 days'),
  ('dec0de00-0000-0000-0000-000000000313','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000303','Column casting',        false, NULL, NULL),
  ('dec0de00-0000-0000-0000-000000000314','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000303','Slab reinforcement',    false, NULL, NULL);

-- ─────────────────────────────────────────────────────────────
-- 7. Payment schedule + records
-- ─────────────────────────────────────────────────────────────
INSERT INTO payment_schedule (id, project_id, milestone_name, amount_due, due_date, sequence_order, notes)
VALUES
  -- Sharma Villa (8.5M)
  ('dec0de00-0000-0000-0000-000000000401','dec0de00-0000-0000-0000-000000000101','Booking advance',  1700000, current_date - 55, 1, 'On signing'),
  ('dec0de00-0000-0000-0000-000000000402','dec0de00-0000-0000-0000-000000000101','On working drawings',2550000, current_date - 8, 2, NULL),
  ('dec0de00-0000-0000-0000-000000000403','dec0de00-0000-0000-0000-000000000101','On structure',     2550000, current_date + 30, 3, NULL),
  ('dec0de00-0000-0000-0000-000000000404','dec0de00-0000-0000-0000-000000000101','On handover',      1700000, current_date + 145,4, NULL),
  -- Mehta Office (12M)
  ('dec0de00-0000-0000-0000-000000000405','dec0de00-0000-0000-0000-000000000103','Design sign-off',  3600000, current_date - 80, 1, NULL),
  ('dec0de00-0000-0000-0000-000000000406','dec0de00-0000-0000-0000-000000000103','Civil works',      4800000, current_date - 5,  2, NULL),
  ('dec0de00-0000-0000-0000-000000000407','dec0de00-0000-0000-0000-000000000103','Final',            3600000, current_date + 140,3, NULL),
  -- Desai Villa (6.2M, fully paid)
  ('dec0de00-0000-0000-0000-000000000408','dec0de00-0000-0000-0000-000000000104','Advance',          3100000, current_date - 235,1, NULL),
  ('dec0de00-0000-0000-0000-000000000409','dec0de00-0000-0000-0000-000000000104','Final',            3100000, current_date - 30, 2, NULL),
  -- Kapoor Residency (design only, 1.8M)
  ('dec0de00-0000-0000-0000-00000000040a','dec0de00-0000-0000-0000-000000000102','Design fee 1',     900000,  current_date - 25, 1, NULL),
  ('dec0de00-0000-0000-0000-00000000040b','dec0de00-0000-0000-0000-000000000102','Design fee 2',     900000,  current_date + 35, 2, NULL);

-- Records (recorded_by passed explicitly so trigger does not need auth.uid()).
INSERT INTO payment_records (id, payment_schedule_id, project_id, amount_paid, paid_on, method, reference, recorded_by)
VALUES
  ('dec0de00-0000-0000-0000-000000000501','dec0de00-0000-0000-0000-000000000401','dec0de00-0000-0000-0000-000000000101',1700000, current_date - 54, 'bank','SHV-ADV','fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000502','dec0de00-0000-0000-0000-000000000402','dec0de00-0000-0000-0000-000000000101',1500000, current_date - 6,  'upi', 'SHV-WD1','fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000503','dec0de00-0000-0000-0000-000000000405','dec0de00-0000-0000-0000-000000000103',3600000, current_date - 79, 'bank','MEH-DS','fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000504','dec0de00-0000-0000-0000-000000000406','dec0de00-0000-0000-0000-000000000103',2400000, current_date - 4,  'cheque','MEH-CW1','fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000505','dec0de00-0000-0000-0000-000000000408','dec0de00-0000-0000-0000-000000000104',3100000, current_date - 234,'bank','DES-ADV','fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000506','dec0de00-0000-0000-0000-000000000409','dec0de00-0000-0000-0000-000000000104',3100000, current_date - 29, 'bank','DES-FIN','fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000507','dec0de00-0000-0000-0000-00000000040a','dec0de00-0000-0000-0000-000000000102',900000,  current_date - 24, 'upi', 'KAP-DF1','fdcf8ca6-a98d-4ebd-9765-f2869f60b504');

-- ─────────────────────────────────────────────────────────────
-- 8. Material plan + consumption  (execution projects)
-- ─────────────────────────────────────────────────────────────
INSERT INTO material_plan (id, project_id, material_name, unit, planned_quantity, planned_for_date, created_by)
VALUES
  ('dec0de00-0000-0000-0000-000000000601','dec0de00-0000-0000-0000-000000000101','Cement (OPC 53)','bags',  800, current_date - 20,'dec0de00-0000-0000-0000-000000000001'),
  ('dec0de00-0000-0000-0000-000000000602','dec0de00-0000-0000-0000-000000000101','TMT Steel',      'tonnes', 18, current_date - 15,'dec0de00-0000-0000-0000-000000000001'),
  ('dec0de00-0000-0000-0000-000000000603','dec0de00-0000-0000-0000-000000000101','M-Sand',         'cu.m',   120,current_date - 10,'dec0de00-0000-0000-0000-000000000001'),
  ('dec0de00-0000-0000-0000-000000000604','dec0de00-0000-0000-0000-000000000103','Vitrified Tiles','sq.ft',  4000,current_date - 30,'dec0de00-0000-0000-0000-000000000001'),
  ('dec0de00-0000-0000-0000-000000000605','dec0de00-0000-0000-0000-000000000103','Gypsum Board',   'sheets', 250, current_date - 12,'dec0de00-0000-0000-0000-000000000001');

INSERT INTO material_consumption (id, project_id, material_plan_id, material_name, unit, quantity_used, consumed_on, recorded_by)
VALUES
  ('dec0de00-0000-0000-0000-000000000611','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000601','Cement (OPC 53)','bags', 320, current_date - 12,'dec0de00-0000-0000-0000-000000000005'),
  ('dec0de00-0000-0000-0000-000000000612','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000602','TMT Steel',      'tonnes',7,  current_date - 9, 'dec0de00-0000-0000-0000-000000000005'),
  -- intentional over-consumption (>15% over plan) → flag_material_excess trigger sets is_excess
  ('dec0de00-0000-0000-0000-000000000613','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000603','M-Sand',         'cu.m',  150, current_date - 5, 'dec0de00-0000-0000-0000-000000000005'),
  ('dec0de00-0000-0000-0000-000000000614','dec0de00-0000-0000-0000-000000000103','dec0de00-0000-0000-0000-000000000604','Vitrified Tiles','sq.ft', 1500,current_date - 8, 'dec0de00-0000-0000-0000-000000000006');

-- ─────────────────────────────────────────────────────────────
-- 9. Expenses  (mix of pending / approved)
--   approved_by/approved_at set directly on INSERT (the approval trigger is BEFORE UPDATE only).
-- ─────────────────────────────────────────────────────────────
INSERT INTO expenses (id, project_id, amount, category, description, spent_on, recorded_by, approval_status, approved_by, approved_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000701','dec0de00-0000-0000-0000-000000000101', 96000,'materials','Cement supply',          current_date - 12,'dec0de00-0000-0000-0000-000000000005','approved','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '11 days'),
  ('dec0de00-0000-0000-0000-000000000702','dec0de00-0000-0000-0000-000000000101', 42000,'labour',   'Masonry crew week 6',    current_date - 7, 'dec0de00-0000-0000-0000-000000000005','approved','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '6 days'),
  ('dec0de00-0000-0000-0000-000000000703','dec0de00-0000-0000-0000-000000000101', 8500, 'transport','Material transport',     current_date - 5, 'dec0de00-0000-0000-0000-000000000005','pending', NULL, NULL),
  ('dec0de00-0000-0000-0000-000000000704','dec0de00-0000-0000-0000-000000000103',180000,'materials','Tile procurement',       current_date - 8, 'dec0de00-0000-0000-0000-000000000006','approved','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '7 days'),
  ('dec0de00-0000-0000-0000-000000000705','dec0de00-0000-0000-0000-000000000103', 15000,'misc',     'Site office supplies',   current_date - 3, 'dec0de00-0000-0000-0000-000000000006','pending', NULL, NULL),
  ('dec0de00-0000-0000-0000-000000000706','dec0de00-0000-0000-0000-000000000104',220000,'labour',   'Final finishing crew',   current_date - 50,'dec0de00-0000-0000-0000-000000000005','approved','fdcf8ca6-a98d-4ebd-9765-f2869f60b504', now() - interval '49 days');

-- ─────────────────────────────────────────────────────────────
-- 10. Site check-ins
-- ─────────────────────────────────────────────────────────────
INSERT INTO site_check_ins (id, user_id, project_id, checked_in_at, gps_lat, gps_lng, within_geofence)
VALUES
  ('dec0de00-0000-0000-0000-000000000801','dec0de00-0000-0000-0000-000000000005','dec0de00-0000-0000-0000-000000000101', now() - interval '1 day'  + interval '9 hours', 12.971590,77.594570, true),
  ('dec0de00-0000-0000-0000-000000000802','dec0de00-0000-0000-0000-000000000005','dec0de00-0000-0000-0000-000000000101', now() - interval '2 days' + interval '9 hours', 12.971610,77.594540, true),
  ('dec0de00-0000-0000-0000-000000000803','dec0de00-0000-0000-0000-000000000006','dec0de00-0000-0000-0000-000000000103', now() - interval '1 day'  + interval '10 hours',12.975710,77.606080, true),
  ('dec0de00-0000-0000-0000-000000000804','dec0de00-0000-0000-0000-000000000006','dec0de00-0000-0000-0000-000000000103', now() - interval '3 days' + interval '10 hours',12.980000,77.610000, false);

-- ─────────────────────────────────────────────────────────────
-- 11. Updates (activity feed)
-- ─────────────────────────────────────────────────────────────
INSERT INTO updates (id, project_id, author_id, author_role_on_project, update_type, body, created_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000901','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000005','site_engineer','progress','Footing concrete poured for grid A–C.',          now() - interval '2 days'),
  ('dec0de00-0000-0000-0000-000000000902','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000003','lead_architect','note',   'Revised staircase detail uploaded to drawings.', now() - interval '4 days'),
  ('dec0de00-0000-0000-0000-000000000903','dec0de00-0000-0000-0000-000000000103','dec0de00-0000-0000-0000-000000000006','site_engineer','material','Tiles delivered to site, stored in basement.',   now() - interval '8 days'),
  ('dec0de00-0000-0000-0000-000000000904','dec0de00-0000-0000-0000-000000000102','dec0de00-0000-0000-0000-000000000003','lead_architect','progress','Concept design approved by client.',             now() - interval '3 days');

-- ─────────────────────────────────────────────────────────────
-- 12. Bridge messages
-- ─────────────────────────────────────────────────────────────
INSERT INTO bridge_messages (id, project_id, author_id, message_type, body, created_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000a01','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000005','text','Need clarification on column C4 reinforcement.', now() - interval '3 days'),
  ('dec0de00-0000-0000-0000-000000000a02','dec0de00-0000-0000-0000-000000000101','dec0de00-0000-0000-0000-000000000003','clarification','C4 follows the typical detail on sheet S-04.', now() - interval '2 days');

-- ─────────────────────────────────────────────────────────────
-- 13. Member tasks + daily tasks + personal reminders
-- ─────────────────────────────────────────────────────────────
INSERT INTO member_tasks (id, tenant_id, user_id, title, completed, completed_at, created_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000b01','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000003','Finalise Sharma Villa staircase detail', false, NULL, now() - interval '3 days'),
  ('dec0de00-0000-0000-0000-000000000b02','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000003','Prepare Kapoor concept presentation',    true,  now() - interval '1 day', now() - interval '5 days'),
  ('dec0de00-0000-0000-0000-000000000b03','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000004','Update Drawing Register for Mehta',       false, NULL, now() - interval '2 days');

INSERT INTO team_daily_tasks (id, tenant_id, user_id, project_id, task_date, description, is_done)
VALUES
  ('dec0de00-0000-0000-0000-000000000b11','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000003','dec0de00-0000-0000-0000-000000000101', current_date,     'Coordinate with site on slab reinforcement', false),
  ('dec0de00-0000-0000-0000-000000000b12','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000004','dec0de00-0000-0000-0000-000000000103', current_date - 1, 'Issue GFC drawings set 3', true);

INSERT INTO personal_reminders (id, tenant_id, user_id, title, reminder_at, type)
VALUES
  ('dec0de00-0000-0000-0000-000000000b21','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000003','Client meeting — Kapoor', now() + interval '1 day', 'meeting'),
  ('dec0de00-0000-0000-0000-000000000b22','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000001','Submit municipal docs',   now() + interval '2 days','deadline');

-- ─────────────────────────────────────────────────────────────
-- 14. Attendance logs  (last 5 working days for team members + site engineers)
-- ─────────────────────────────────────────────────────────────
INSERT INTO attendance_logs (id, tenant_id, user_id, work_date, check_in_at, check_in_lat, check_in_lng, check_in_within_geofence, check_out_at, check_out_lat, check_out_lng, check_out_within_geofence, accumulated_minutes, check_in_count)
SELECT
  ('dec0de00-0000-0000-0000-' || lpad((100000 + r * 10 + u.idx)::text, 12, '0'))::uuid,
  'd4784db6-9a2d-4075-97b5-14daaa9026ab',
  u.uid,
  (current_date - r),
  (current_date - r) + time '09:15',
  12.971599, 77.594566, true,
  (current_date - r) + time '18:05',
  12.971599, 77.594566, true,
  525, 1
FROM generate_series(1, 5) AS r
CROSS JOIN (VALUES
  (1,'dec0de00-0000-0000-0000-000000000001'::uuid),
  (2,'dec0de00-0000-0000-0000-000000000002'::uuid),
  (3,'dec0de00-0000-0000-0000-000000000003'::uuid),
  (4,'dec0de00-0000-0000-0000-000000000004'::uuid),
  (5,'dec0de00-0000-0000-0000-000000000005'::uuid),
  (6,'dec0de00-0000-0000-0000-000000000006'::uuid)
) AS u(idx, uid);

-- ─────────────────────────────────────────────────────────────
-- 15. Broadcasts + recipients
-- ─────────────────────────────────────────────────────────────
INSERT INTO owner_broadcasts (id, tenant_id, author_id, body, created_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000c11','d4784db6-9a2d-4075-97b5-14daaa9026ab','fdcf8ca6-a98d-4ebd-9765-f2869f60b504','Team meeting Friday 10 AM — bring project status updates.', now() - interval '2 days'),
  ('dec0de00-0000-0000-0000-000000000c12','d4784db6-9a2d-4075-97b5-14daaa9026ab','fdcf8ca6-a98d-4ebd-9765-f2869f60b504','New material vendor onboarded — see shared sheet.',         now() - interval '6 days');

INSERT INTO owner_broadcast_recipients (id, broadcast_id, user_id, is_acknowledged, acknowledged_at)
VALUES
  ('dec0de00-0000-0000-0000-000000000c21','dec0de00-0000-0000-0000-000000000c11','dec0de00-0000-0000-0000-000000000001', true,  now() - interval '1 day'),
  ('dec0de00-0000-0000-0000-000000000c22','dec0de00-0000-0000-0000-000000000c11','dec0de00-0000-0000-0000-000000000003', false, NULL),
  ('dec0de00-0000-0000-0000-000000000c23','dec0de00-0000-0000-0000-000000000c11','dec0de00-0000-0000-0000-000000000005', true,  now() - interval '1 day'),
  ('dec0de00-0000-0000-0000-000000000c24','dec0de00-0000-0000-0000-000000000c12','dec0de00-0000-0000-0000-000000000002', false, NULL),
  ('dec0de00-0000-0000-0000-000000000c25','dec0de00-0000-0000-0000-000000000c12','dec0de00-0000-0000-0000-000000000004', false, NULL);

-- ─────────────────────────────────────────────────────────────
-- 16. Team performance (last 2 completed months)
-- ─────────────────────────────────────────────────────────────
INSERT INTO team_performance_monthly (id, tenant_id, user_id, period_month, drawings_completed, errors, revisions, deadline_met_pct, client_rating, site_delay_days, recorded_by)
VALUES
  ('dec0de00-0000-0000-0000-000000000d01','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000003', date_trunc('month', current_date - interval '1 month')::date, 22, 2, 5, 92, 8.5, 0,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000d02','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000004', date_trunc('month', current_date - interval '1 month')::date, 18, 4, 8, 85, 7.5, 0,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000d03','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000005', date_trunc('month', current_date - interval '1 month')::date, 0,  1, 0, 95, 8.0, 2,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504'),
  ('dec0de00-0000-0000-0000-000000000d04','d4784db6-9a2d-4075-97b5-14daaa9026ab','dec0de00-0000-0000-0000-000000000003', date_trunc('month', current_date - interval '2 months')::date, 20, 3, 6, 88, 8.2, 0,'fdcf8ca6-a98d-4ebd-9765-f2869f60b504');
