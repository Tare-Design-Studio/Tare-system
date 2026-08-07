import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { localDate } from "@/lib/attendance/day";

// GET /api/attendance/board — today's presence for the whole team.
//
// Client request #4: every member sees who is at work today (green) and who has
// not checked in (red).
//
// Why the service client: attendance_logs RLS is own-row plus
// `office_attendance:view_all` (040), so an ordinary member querying directly
// gets back only themselves and the board renders empty. Presence is
// deliberately a wider disclosure than attendance detail, so this route uses
// the service client but returns a strictly narrowed projection:
//
//   * scoped to the CALLER'S OWN tenant, derived from their session — never
//     from a query parameter (the cross-tenant IDOR class from the 2026-06-19
//     audit)
//   * returns presence state and check-in time only. No GPS, no geofence flag,
//     no worked minutes, no overtime — those stay behind office_attendance:view_all
//     on /api/attendance.
export async function GET() {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;
  const today = localDate();

  const [{ data: members, error: mErr }, { data: logs, error: aErr }, { data: leave }] = await Promise.all([
    service
      .from("users")
      .select("id, full_name, role, role_label")
      .eq("tenant_id", profile.tenant_id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("full_name"),
    service
      .from("attendance_logs")
      .select("user_id, check_in_at, check_out_at, last_check_in_at, is_late, check_in_office:offices!attendance_logs_check_in_office_id_fkey(name)")
      .eq("tenant_id", profile.tenant_id)
      .eq("work_date", today),
    service
      .from("leave_requests")
      .select("user_id, kind")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
  ]);

  if (mErr || aErr) {
    return NextResponse.json({ error: mErr?.message ?? aErr?.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logByUser = new Map<string, any>((logs ?? []).map((l: any) => [l.user_id, l]));
  const onLeave = new Map<string, string>((leave ?? []).map((l: { user_id: string; kind: string }) => [l.user_id, l.kind]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (members ?? []).map((m: any) => {
    const log = logByUser.get(m.id);
    const leaveKind = onLeave.get(m.id);

    // Ordering matters: approved leave outranks a missing check-in, so someone
    // on sanctioned leave is not shown as simply absent.
    let status: "present" | "checked_out" | "on_leave" | "absent";
    if (leaveKind) status = "on_leave";
    else if (log?.last_check_in_at) status = "present";
    else if (log?.check_in_at) status = "checked_out";
    else status = "absent";

    return {
      user_id: m.id,
      full_name: m.full_name,
      role: m.role,
      role_label: m.role_label,
      status,
      leave_kind: leaveKind ?? null,
      check_in_at: log?.check_in_at ?? null,
      is_late: log?.is_late ?? null,
      // Which office they checked in at, so a Mysore member can see who is in
      // Bangalore today. Name only — never the coordinates.
      office_name: log?.check_in_office?.name ?? null,
    };
  });

  return NextResponse.json({
    date: today,
    members: rows,
    summary: {
      present: rows.filter((r: { status: string }) => r.status === "present").length,
      checked_out: rows.filter((r: { status: string }) => r.status === "checked_out").length,
      on_leave: rows.filter((r: { status: string }) => r.status === "on_leave").length,
      absent: rows.filter((r: { status: string }) => r.status === "absent").length,
    },
  });
}
