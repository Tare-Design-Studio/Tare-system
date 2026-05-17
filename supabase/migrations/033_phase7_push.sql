-- Phase 7 · pg_cron — daily sweep for time-based notifications
-- Runs every day at midnight UTC
-- Requires pg_cron extension enabled in Supabase

GRANT notification_writer TO postgres;

-- Safely remove existing cron job if it already exists
DO $cleanup$
BEGIN
  PERFORM cron.unschedule('daily-time-based-notifications');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$cleanup$;

-- Create cron job
SELECT cron.schedule(
  'daily-time-based-notifications',
  '0 0 * * *',
  $cron$

  DO $job$
  DECLARE
    r record;
    v_label text;
  BEGIN

    -------------------------------------------------------------------
    -- Payment due notifications
    -------------------------------------------------------------------
    FOR r IN
      SELECT
        ps.id,
        ps.milestone_name,
        ps.amount_due,
        ps.due_date,
        ps.tenant_id,
        p.name AS project_name
      FROM payment_schedule ps
      JOIN projects p
        ON p.id = ps.project_id
      WHERE ps.due_date <= current_date
        AND ps.is_paid = false
        AND ps.deleted_at IS NULL
        AND p.deleted_at IS NULL
    LOOP

      PERFORM emit_notification(
        p_tenant_id   => r.tenant_id,
        p_kind        => 'payment_due',
        p_severity    => 'warning',
        p_source_type => 'payment_schedule',
        p_source_id   => r.id,
        p_title       => 'Payment due: ' || r.milestone_name,
        p_body        => r.project_name
                          || ' — ₹'
                          || to_char(r.amount_due, 'FM99,99,99,999'),
        p_dedupe_key  => 'payment_due:'
                          || r.id::text
                          || ':'
                          || current_date::text
      );

    END LOOP;

    -------------------------------------------------------------------
    -- Checkpoint overdue notifications
    -------------------------------------------------------------------
    FOR r IN
      SELECT
        pc.id,
        pc.name AS checkpoint_name,
        pc.due_date,
        p.tenant_id,
        p.name AS project_name
      FROM project_checkpoints pc
      JOIN projects p
        ON p.id = pc.project_id
      WHERE pc.due_date < current_date
        AND pc.completed_at IS NULL
        AND pc.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.status NOT IN ('completed', 'cancelled')
    LOOP

      PERFORM emit_notification(
        p_tenant_id   => r.tenant_id,
        p_kind        => 'checkpoint_overdue',
        p_severity    => 'warning',
        p_source_type => 'checkpoint',
        p_source_id   => r.id,
        p_title       => 'Checkpoint overdue: ' || r.checkpoint_name,
        p_body        => r.project_name
                          || ' — was due '
                          || to_char(r.due_date, 'DD Mon YYYY'),
        p_dedupe_key  => 'checkpoint_overdue:'
                          || r.id::text
                          || ':'
                          || current_date::text
      );

    END LOOP;

    -------------------------------------------------------------------
    -- Reminder due notifications
    -------------------------------------------------------------------
    FOR r IN
      SELECT
        er.id,
        er.tenant_id,
        er.category,
        er.due_at,
        er.assigned_to,
        COALESCE(e.name, c.name, 'Contact') AS contact_name
      FROM enquiry_reminders er
      LEFT JOIN enquiries e
        ON e.id = er.enquiry_id
      LEFT JOIN customers c
        ON c.id = er.customer_id
      WHERE er.due_at <= now()
        AND er.is_done = false
    LOOP

      v_label := CASE r.category
        WHEN 'meeting'    THEN 'Meeting'
        WHEN 'quotation'  THEN 'Quotation'
        WHEN 'drawing'    THEN 'Drawing'
        WHEN 'call'       THEN 'Call'
        WHEN 'follow_up'  THEN 'Follow-up'
        WHEN 'site_visit' THEN 'Site visit'
        ELSE 'Reminder'
      END;

      PERFORM emit_notification(
        p_tenant_id   => r.tenant_id,
        p_kind        => 'reminder_due',
        p_severity    => 'info',
        p_source_type => 'enquiry_reminder',
        p_source_id   => r.id,
        p_title       => v_label || ' reminder — ' || r.contact_name,
        p_body        => 'Due: '
                          || to_char(r.due_at, 'DD Mon YYYY HH24:MI'),
        p_dedupe_key  => 'reminder_due:'
                          || r.id::text
                          || ':'
                          || current_date::text,
        p_user_ids    => CASE
                            WHEN r.assigned_to IS NOT NULL
                            THEN ARRAY[r.assigned_to]
                            ELSE NULL
                          END
      );

    END LOOP;

  END;
  $job$ LANGUAGE plpgsql;

  $cron$
);