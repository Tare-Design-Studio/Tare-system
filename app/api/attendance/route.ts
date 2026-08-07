import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/attendance/day";

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
    .select("id, work_date, check_in_at, check_out_at, check_in_within_geofence, check_out_within_geofence, total_minutes, accumulated_minutes, last_check_in_at, check_in_count, overtime_minutes, is_late, check_in_office:offices!attendance_logs_check_in_office_id_fkey(name)")
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

  // Match the member against every active office (Mysore, Bangalore, …) and
  // take the nearest one whose own radius contains them. Nobody picks an office
  // from a list — picking is how you get people checking in at an office they
  // are not standing in.
  //
  // No match is not an error: it means remote or on site. The check-in is still
  // recorded, just flagged outside the geofence and with no office attached.
  let withinGeofence: boolean | null = null;
  let matchedOfficeId: string | null = null;
  let matchedOfficeName: string | null = null;

  if (lat != null && lng != null) {
    const { data: offices } = await supabase
      .from("offices")
      .select("id, name, lat, lng, geofence_radius_m")
      .eq("is_active", true);

    if (offices?.length) {
      let best: { id: string; name: string; dist: number; radius: number } | null = null;
      for (const o of offices) {
        const dist = haversineMeters(lat, lng, o.lat, o.lng);
        if (dist <= (o.geofence_radius_m ?? 200) && (!best || dist < best.dist)) {
          best = { id: o.id, name: o.name, dist, radius: o.geofence_radius_m ?? 200 };
        }
      }
      withinGeofence = best !== null;
      matchedOfficeId = best?.id ?? null;
      matchedOfficeName = best?.name ?? null;
    }
  }

  const nowDate = new Date();
  const today = localDate(nowDate);
  const now = nowDate.toISOString();

  // worked_minutes = closed cycles + the currently-open cycle (if any).
  function workedMinutes(row: { accumulated_minutes?: number | null; last_check_in_at?: string | null }): number {
    const acc = row.accumulated_minutes ?? 0;
    if (row.last_check_in_at) {
      const openMs = nowDate.getTime() - new Date(row.last_check_in_at).getTime();
      return acc + Math.max(0, Math.floor(openMs / 60000));
    }
    return acc;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function respond(row: any) {
    return NextResponse.json(
      {
        ...row,
        within_geofence: withinGeofence,
        office_name: matchedOfficeName,
        worked_minutes: workedMinutes(row),
      },
      { status: 200 }
    );
  }

  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, check_in_at, check_in_count, accumulated_minutes, last_check_in_at")
    .eq("user_id", user.id)
    .eq("work_date", today)
    .maybeSingle();

  if (action === "check_in") {
    if (!existing) {
      // First check-in of the day — open cycle one.
      const { data, error } = await supabase
        .from("attendance_logs")
        .insert({
          user_id: user.id,
          tenant_id: profile.tenant_id,
          work_date: today,
          check_in_at: now,
          last_check_in_at: now,
          accumulated_minutes: 0,
          check_in_lat: lat ?? null,
          check_in_lng: lng ?? null,
          check_in_within_geofence: withinGeofence,
          check_in_office_id: matchedOfficeId,
          check_in_count: 1,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return respond(data);
    }

    // Already in an open cycle — idempotent, return current.
    if (existing.last_check_in_at) {
      return respond(existing);
    }

    // Currently checked out — start another cycle (keep first check_in_at for display).
    const { data, error } = await supabase
      .from("attendance_logs")
      .update({
        last_check_in_at: now,
        check_out_at: null,
        check_in_lat: lat ?? null,
        check_in_lng: lng ?? null,
        check_in_within_geofence: withinGeofence,
        check_in_office_id: matchedOfficeId,
        check_in_count: (existing.check_in_count ?? 1) + 1,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return respond(data);
  } else {
    // check_out — requires an open cycle.
    if (!existing) return NextResponse.json({ error: "No check-in found for today" }, { status: 400 });
    if (!existing.last_check_in_at) return NextResponse.json({ error: "No active check-in to check out from" }, { status: 400 });

    const openMs = nowDate.getTime() - new Date(existing.last_check_in_at).getTime();
    const cycleMinutes = Math.max(0, Math.floor(openMs / 60000));

    const { data, error } = await supabase
      .from("attendance_logs")
      .update({
        check_out_at: now,
        last_check_in_at: null,
        accumulated_minutes: (existing.accumulated_minutes ?? 0) + cycleMinutes,
        check_out_lat: lat ?? null,
        check_out_lng: lng ?? null,
        check_out_within_geofence: withinGeofence,
        check_out_office_id: matchedOfficeId,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return respond(data);
  }
}
