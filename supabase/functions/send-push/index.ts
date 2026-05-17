// Supabase Edge Function — send-push
//
// Triggered by a Supabase Database Webhook on:
//   Table: notification_recipients   Event: INSERT
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//
// Required secrets (set via Supabase dashboard → Edge Functions → send-push → Secrets):
//   VAPID_PUBLIC_KEY   — from `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY  — from `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT      — e.g. "mailto:admin@yourdomain.com"
//
// Supabase injects automatically:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: { record?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const record = body.record;
  if (!record?.id || !record?.user_id || !record?.notification_id) {
    return new Response("Missing required fields", { status: 400 });
  }

  const recipientId     = record.id as string;
  const userId          = record.user_id as string;
  const notificationId  = record.notification_id as string;

  // Fetch notification details
  const { data: notif, error: notifErr } = await supabase
    .from("notifications")
    .select("title, body, kind, severity, source_type, source_id")
    .eq("id", notificationId)
    .single();

  if (notifErr || !notif) {
    return new Response("Notification not found", { status: 404 });
  }

  // Fetch all active push subscriptions for this user
  const { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (subsErr || !subs?.length) {
    // No subscriptions — not an error, user just hasn't granted push permission
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({
    title:       notif.title,
    body:        notif.body ?? "",
    kind:        notif.kind,
    severity:    notif.severity,
    source_type: notif.source_type,
    source_id:   notif.source_id,
  });

  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        },
        payload,
        { TTL: 86400 } // deliver within 24 h or drop
      );

      await supabase
        .from("notification_recipients")
        .update({
          push_delivered:       true,
          push_last_attempt_at: new Date().toISOString(),
          push_attempts:        1,
          push_last_error:      null,
        })
        .eq("id", recipientId);

      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      await supabase
        .from("notification_recipients")
        .update({
          push_last_attempt_at: new Date().toISOString(),
          push_last_error:      msg.slice(0, 500),
        })
        .eq("id", recipientId);

      // 410 Gone / 404 — subscription expired, deactivate it
      if (msg.includes("410") || msg.includes("404")) {
        await supabase
          .from("push_subscriptions")
          .update({ is_active: false })
          .eq("id", sub.id);
      }
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
