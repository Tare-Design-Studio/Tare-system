import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM
  const userId = searchParams.get("user_id"); // owner can request others

  // Check if caller can view other users' attendance
  let targetUserId = user.id;
  if (userId && userId !== user.id) {
    const { data: can } = await supabase.rpc("has_capability", {
      p_capability: "office_attendance:view_all",
    });
    if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    targetUserId = userId;
  }

  let query = supabase
    .from("attendance_logs")
    .select("id, work_date, check_in_at, check_out_at, check_in_within_geofence, check_out_within_geofence, total_minutes, check_in_count")
    .eq("user_id", targetUserId)
    .order("work_date", { ascending: false });

  if (month) {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month
    query = query.gte("work_date", start).lte("work_date", end);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const body = await req.json();
  const { action, lat, lng } = body as { action: "check_in" | "check_out"; lat?: number; lng?: number };

  if (action !== "check_in" && action !== "check_out") {
    return NextResponse.json({ error: "action must be check_in or check_out" }, { status: 400 });
  }

  // Fetch office coords + radius from tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("office_lat, office_lng, office_geofence_radius_m")
    .eq("id", profile.tenant_id)
    .single();

  let withinGeofence: boolean | null = null;
  if (tenant?.office_lat && tenant?.office_lng && lat != null && lng != null) {
    const dist = haversineMeters(lat, lng, tenant.office_lat, tenant.office_lng);
    withinGeofence = dist <= (tenant.office_geofence_radius_m ?? 200);
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  if (action === "check_in") {
    // One row per day: keep the FIRST check-in, just bump the count on re-check-in.
    const { data: existing } = await supabase
      .from("attendance_logs")
      .select("id, check_in_at, check_in_count")
      .eq("user_id", user.id)
      .eq("work_date", today)
      .maybeSingle();

    if (!existing) {
      const { data, error } = await supabase
        .from("attendance_logs")
        .insert({
          user_id: user.id,
          tenant_id: profile.tenant_id,
          work_date: today,
          check_in_at: now,
          check_in_lat: lat ?? null,
          check_in_lng: lng ?? null,
          check_in_within_geofence: withinGeofence,
          check_in_count: 1,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ...data, within_geofence: withinGeofence }, { status: 200 });
    }

    // Re-check-in: keep first check-in time/coords, only increment the count.
    const { data, error } = await supabase
      .from("attendance_logs")
      .update({ check_in_count: (existing.check_in_count ?? 1) + 1 })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ...data, within_geofence: withinGeofence }, { status: 200 });
  } else {
    // Update today's row with check_out
    const { data, error } = await supabase
      .from("attendance_logs")
      .update({
        check_out_at: now,
        check_out_lat: lat ?? null,
        check_out_lng: lng ?? null,
        check_out_within_geofence: withinGeofence,
      })
      .eq("user_id", user.id)
      .eq("work_date", today)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No check-in found for today" }, { status: 400 });
    return NextResponse.json({ ...data, within_geofence: withinGeofence }, { status: 200 });
  }
}
