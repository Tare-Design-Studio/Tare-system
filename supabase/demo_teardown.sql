-- demo_teardown.sql  —  removes everything 069_demo_seed.sql created.
--
-- Kept OUT of supabase/migrations/ on purpose: the migrate runner applies every
-- *.sql in migrations/, so a teardown placed there auto-runs right after the seed
-- and wipes it. Run this manually, only when the demo is over:
--   psql "$DATABASE_URL" -f supabase/demo_teardown.sql
--
-- Deletes strictly by the demo `dec0de00-…` UUID namespace and the demo user ids,
-- so real Tare data is never touched. Ordered to respect FK dependencies.
--
-- Safe to wrap in its own transaction when run via psql (no BEGIN/COMMIT here so
-- it can also be pasted into the SQL editor as-is).

-- Demo user ids (reused below)
-- 01 Priya, 02 Arjun, 03 Meera, 04 Rohan, 05 Vikram, 06 Sneha

-- 16. performance
DELETE FROM team_performance_monthly WHERE id::text LIKE 'dec0de00-%';

-- 15. broadcasts
DELETE FROM owner_broadcast_recipients WHERE id::text LIKE 'dec0de00-%';
DELETE FROM owner_broadcasts           WHERE id::text LIKE 'dec0de00-%';

-- 14. attendance
DELETE FROM attendance_logs WHERE tenant_id = 'd4784db6-9a2d-4075-97b5-14daaa9026ab'
  AND user_id IN (
    'dec0de00-0000-0000-0000-000000000001','dec0de00-0000-0000-0000-000000000002',
    'dec0de00-0000-0000-0000-000000000003','dec0de00-0000-0000-0000-000000000004',
    'dec0de00-0000-0000-0000-000000000005','dec0de00-0000-0000-0000-000000000006'
  );

-- 13. tasks + reminders
DELETE FROM personal_reminders WHERE id::text LIKE 'dec0de00-%';
DELETE FROM team_daily_tasks   WHERE id::text LIKE 'dec0de00-%';
DELETE FROM member_tasks       WHERE id::text LIKE 'dec0de00-%';

-- 12. bridge
DELETE FROM bridge_messages WHERE id::text LIKE 'dec0de00-%';

-- 11. updates
DELETE FROM updates WHERE id::text LIKE 'dec0de00-%';

-- 10. site check-ins
DELETE FROM site_check_ins WHERE id::text LIKE 'dec0de00-%';

-- 9. expenses
DELETE FROM expenses WHERE id::text LIKE 'dec0de00-%';

-- 8. materials (consumption before plan)
DELETE FROM material_consumption WHERE id::text LIKE 'dec0de00-%';
DELETE FROM material_plan        WHERE id::text LIKE 'dec0de00-%';

-- 7. payments (records before schedule)
DELETE FROM payment_records  WHERE id::text LIKE 'dec0de00-%';
DELETE FROM payment_schedule WHERE id::text LIKE 'dec0de00-%';

-- 6. checkpoints (items before checkpoints)
DELETE FROM checkpoint_items     WHERE id::text LIKE 'dec0de00-%';
DELETE FROM project_checkpoints  WHERE id::text LIKE 'dec0de00-%';

-- 5. projects (assignments before projects)
DELETE FROM project_assignments WHERE id::text LIKE 'dec0de00-%';
DELETE FROM projects            WHERE id::text LIKE 'dec0de00-%';

-- 4. enquiries (reminders + remarks first; clear customer cross-links)
DELETE FROM enquiry_reminders WHERE id::text LIKE 'dec0de00-%';
DELETE FROM enquiry_remarks   WHERE id::text LIKE 'dec0de00-%';
UPDATE customers SET created_from_enquiry_id = NULL WHERE id::text LIKE 'dec0de00-%';
DELETE FROM enquiries WHERE id::text LIKE 'dec0de00-%';

-- 3. customers
DELETE FROM customers WHERE id::text LIKE 'dec0de00-%';

-- 2. tags + capabilities + app users
--    tag rows: deleting them fires the 065 revoke trigger which removes the
--    source='tag' capability rows automatically.
DELETE FROM team_member_tags WHERE id::text LIKE 'dec0de00-%';
--    any remaining capability rows for demo users (manual + leftover tag)
DELETE FROM user_capabilities WHERE user_id IN (
  'dec0de00-0000-0000-0000-000000000001','dec0de00-0000-0000-0000-000000000002',
  'dec0de00-0000-0000-0000-000000000003','dec0de00-0000-0000-0000-000000000004',
  'dec0de00-0000-0000-0000-000000000005','dec0de00-0000-0000-0000-000000000006'
);
DELETE FROM users WHERE id::text LIKE 'dec0de00-%';

-- 1. auth (identities before users)
DELETE FROM auth.identities WHERE id::text LIKE 'dec0de00-%';
DELETE FROM auth.users      WHERE id::text LIKE 'dec0de00-%';

-- 0. revert the office GPS we set for the demo geofence
UPDATE tenants
   SET office_lat = NULL, office_lng = NULL
 WHERE id = 'd4784db6-9a2d-4075-97b5-14daaa9026ab';
