import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const CheckinSchema = z.object({
  action: z.enum(["check_in", "check_out"]).default("check_in"),
  gps_lat: z.number().min(-90).max(90),
  gps_lng: z.number().min(-180).max(180),
  notes: z.string().max(500).optional(),
  // geofence = the /site page acting on GPS by itself (126). The distance is
  // re-checked here; the client's claim that it entered or left is not trusted.
  method: z.enum(["button", "geofence"]).default("button"),
});

// After a tapped Check Out, the page must not check the engineer straight back
// in while they are still standing on site.
const MANUAL_CHECKOUT_HOLD_MS = 60 * 60 * 1000;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CheckinSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { action, gps_lat, gps_lng, notes, method } = parsed.data;
  const { data: canCheckIn } = await supabase.rpc("has_capability", {
    p_capability: "site_check_in:write",
    p_project_id: project_id,
  });
  if (!canCheckIn) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const { data: assignment } = await service
    .from("project_assignments")
    .select("id")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!assignment) return NextResponse.json({ error: "Forbidden — project is not assigned to you" }, { status: 403 });

  // Fetch project's site location for geofence check
  const { data: project, error: projErr } = await service
    .from("projects")
    .select("site_lat, site_lng, site_geofence_radius_m")
    .eq("id", project_id)
    .is("deleted_at", null)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const hasSite = Boolean(project.site_lat && project.site_lng);
  const radiusM = project.site_geofence_radius_m ?? 250;
  const distanceM = hasSite
    ? haversineM(Number(project.site_lat), Number(project.site_lng), gps_lat, gps_lng)
    : Infinity;

  // Check-out: close the open session for this user+project and record duration.
  if (action === "check_out") {
    if (method === "geofence" && (!hasSite || distanceM <= radiusM)) {
      return NextResponse.json({ error: "Still inside the site radius" }, { status: 409 });
    }

    const { data: open } = await service
      .from("site_check_ins")
      .select("id, checked_in_at")
      .eq("project_id", project_id)
      .eq("user_id", user.id)
      .is("checked_out_at", null)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!open) return NextResponse.json({ error: "No open check-in to check out from" }, { status: 400 });

    const checkedOutAt = new Date();
    const durationMinutes = Math.max(
      0,
      Math.floor((checkedOutAt.getTime() - new Date(open.checked_in_at).getTime()) / 60000)
    );

    const { data, error } = await service
      .from("site_check_ins")
      .update({ checked_out_at: checkedOutAt.toISOString(), duration_minutes: durationMinutes, checkout_method: method })
      .eq("id", open.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, checked_out: true, duration_minutes: durationMinutes }, { status: 200 });
  }

  if (!hasSite) {
    return NextResponse.json(
      { error: "Project does not have a site location configured. Ask the owner to set site coordinates." },
      { status: 422 }
    );
  }

  const within_geofence = distanceM <= radiusM;

  // An automatic check-in is only ever a verified one, never a flagged one, and
  // never a second open session or an override of a tapped Check Out.
  if (method === "geofence") {
    if (!within_geofence) {
      return NextResponse.json({ error: "Outside the site radius" }, { status: 409 });
    }
    const [{ count: openCount }, { data: lastHere }] = await Promise.all([
      service
        .from("site_check_ins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("source", "check_in")
        .is("checked_out_at", null),
      service
        .from("site_check_ins")
        .select("checked_out_at, checkout_method")
        .eq("user_id", user.id)
        .eq("project_id", project_id)
        .eq("source", "check_in")
        .order("checked_in_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if ((openCount ?? 0) > 0) {
      return NextResponse.json({ error: "Already checked in" }, { status: 409 });
    }
    if (
      lastHere?.checkout_method === "button" &&
      lastHere.checked_out_at &&
      Date.now() - new Date(lastHere.checked_out_at).getTime() < MANUAL_CHECKOUT_HOLD_MS
    ) {
      return NextResponse.json({ error: "Checked out by hand recently" }, { status: 409 });
    }
  }
  const geofence_failure_reason = within_geofence
    ? undefined
    : `${Math.round(distanceM)}m from site (limit: ${radiusM}m)`;

  const { data, error } = await service
    .from("site_check_ins")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, user_id: user.id, gps_lat, gps_lng, within_geofence, geofence_failure_reason, notes, checkin_method: method } as any)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Emit site check-in notification to Owner (fire-and-forget, non-fatal)
  supabase.rpc("emit_site_checkin_notification", {
    p_project_id: project_id,
    p_user_id: user.id,
    p_checkin_id: data.id,
    p_within_geofence: within_geofence,
  }).then();

  const status = within_geofence ? 201 : 202;
  return NextResponse.json({ data, within_geofence, distance_m: Math.round(distanceM) }, { status });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("site_check_ins")
    .select(`
      id, checked_in_at, checked_out_at, duration_minutes, gps_lat, gps_lng, within_geofence,
      checkin_method, checkout_method,
      geofence_failure_reason, approved_by, approved_at, notes, gps_retained_until,
      engineer:users!site_check_ins_user_id_fkey(id, full_name)
    `)
    .eq("project_id", project_id)
    .order("checked_in_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ check_ins: data });
}
