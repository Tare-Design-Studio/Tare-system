import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const CheckinSchema = z.object({
  gps_lat: z.number().min(-90).max(90),
  gps_lng: z.number().min(-180).max(180),
  notes: z.string().max(500).optional(),
});

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

  const { gps_lat, gps_lng, notes } = parsed.data;
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

  if (!project.site_lat || !project.site_lng) {
    return NextResponse.json(
      { error: "Project does not have a site location configured. Ask the owner to set site coordinates." },
      { status: 422 }
    );
  }

  const radiusM = project.site_geofence_radius_m ?? 250;
  const distanceM = haversineM(
    Number(project.site_lat),
    Number(project.site_lng),
    gps_lat,
    gps_lng
  );
  const within_geofence = distanceM <= radiusM;
  const geofence_failure_reason = within_geofence
    ? undefined
    : `${Math.round(distanceM)}m from site (limit: ${radiusM}m)`;

  const { data, error } = await service
    .from("site_check_ins")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ project_id, user_id: user.id, gps_lat, gps_lng, within_geofence, geofence_failure_reason, notes } as any)
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
      id, checked_in_at, gps_lat, gps_lng, within_geofence,
      geofence_failure_reason, approved_by, approved_at, notes, gps_retained_until,
      engineer:users!site_check_ins_user_id_fkey(id, full_name)
    `)
    .eq("project_id", project_id)
    .order("checked_in_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ check_ins: data });
}
