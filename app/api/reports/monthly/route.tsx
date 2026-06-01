import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { MonthlyReport, type ReportData, type TeamMemberReport } from "@/lib/reports/MonthlyReport";
import { isMonthAvailable, monthStartDate, monthEndDate, monthKeyLabel } from "@/lib/reports/monthMeta";

export const runtime = "nodejs";

const IST = "Asia/Kolkata";

// Read the Tare wordmark from /public once per request as a data URI for the
// PDF cover (@react-pdf needs an embeddable src, not a public URL).
async function loadLogo(): Promise<string | null> {
  try {
    const file = path.join(process.cwd(), "public", "tare-logo.png");
    const buf = await readFile(file);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: IST });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: IST });
}

function avg(nums: number[]): number | null {
  const vals = nums.filter((n) => n != null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "office_attendance:view_all" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const monthKey = new URL(req.url).searchParams.get("month") ?? "";
  if (!isMonthAvailable(monthKey)) {
    return NextResponse.json({ error: "Report not yet available for that month" }, { status: 400 });
  }

  const start = monthStartDate(monthKey); // YYYY-MM-01
  const end = monthEndDate(monthKey);     // YYYY-MM-last
  const startTs = `${start}T00:00:00.000Z`;
  const endTs = `${end}T23:59:59.999Z`;

  const logoSrc = await loadLogo();

  // Studio name
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  let studioName = "Tare Design Studio";
  if (profile?.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .single();
    if (tenant?.name) studioName = tenant.name;
  }

  // Members (exclude owner + deleted)
  const { data: memberRows } = await supabase
    .from("users")
    .select("id, full_name, role, role_label, phone, experience_years")
    .is("deleted_at", null)
    .neq("role", "owner")
    .order("role")
    .order("full_name");

  const members = (memberRows ?? []) as {
    id: string; full_name: string; role: string; role_label: string | null;
    phone: string | null; experience_years: number | null;
  }[];
  const ids = members.map((m) => m.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Bulk-fetch all sections scoped to this calendar month.
  const [tagsRes, attRes, dailyRes, persistRes, perfRes, bcastRes, checkinRes] = await Promise.all([
    db.from("team_member_tags").select("user_id, tag").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),

    db.from("attendance_logs")
      .select("user_id, work_date, check_in_at, check_out_at, total_minutes, accumulated_minutes, check_in_count, check_in_within_geofence, check_out_within_geofence")
      .in("user_id", ids.length ? ids : ["x"])
      .gte("work_date", start).lte("work_date", end)
      .order("work_date", { ascending: true }),

    db.from("team_daily_tasks")
      .select("user_id, description, task_date, is_done, done_at")
      .in("user_id", ids.length ? ids : ["x"])
      .gte("task_date", start).lte("task_date", end)
      .order("task_date", { ascending: true }),

    db.from("member_tasks")
      .select("user_id, title, completed, completed_at, created_at")
      .in("user_id", ids.length ? ids : ["x"])
      .or(`and(completed_at.gte.${startTs},completed_at.lte.${endTs}),and(created_at.gte.${startTs},created_at.lte.${endTs})`)
      .order("created_at", { ascending: true }),

    db.from("team_performance_monthly")
      .select("user_id, period_month, drawings_completed, errors, revisions, deadline_met_pct, client_rating")
      .in("user_id", ids.length ? ids : ["x"])
      .gte("period_month", start).lte("period_month", end),

    db.from("owner_broadcast_recipients")
      .select("user_id, is_acknowledged, owner_broadcasts:broadcast_id(created_at)")
      .in("user_id", ids.length ? ids : ["x"]),

    db.from("site_check_ins")
      .select("user_id, checked_in_at, within_geofence, project_id, projects:project_id(name)")
      .in("user_id", ids.length ? ids : ["x"])
      .gte("checked_in_at", startTs).lte("checked_in_at", endTs)
      .order("checked_in_at", { ascending: true }),
  ]);

  // Index by user. Rows are PostgREST `any` payloads; per-field shapes are
  // asserted at each read site below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byUser = (rows: any[] | null): Map<string, any[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, any[]>();
    for (const r of rows ?? []) {
      const list = map.get(r.user_id) ?? [];
      list.push(r);
      map.set(r.user_id, list);
    }
    return map;
  };

  const tags = byUser(tagsRes.data);
  const att = byUser(attRes.data);
  const daily = byUser(dailyRes.data);
  const persist = byUser(persistRes.data);
  const perf = byUser(perfRes.data);
  const bcast = byUser(bcastRes.data);
  const checkins = byUser(checkinRes.data);

  const report: TeamMemberReport[] = members.map((m) => {
    const attRows = att.get(m.id) ?? [];
    const dailyRows = daily.get(m.id) ?? [];
    const persistRows = persist.get(m.id) ?? [];
    const perfRows = perf.get(m.id) ?? [];
    const bcastRows = bcast.get(m.id) ?? [];
    const ciRows = checkins.get(m.id) ?? [];

    const totalMinutes = attRows.reduce((sx: number, r: { accumulated_minutes: number | null; total_minutes: number | null }) =>
      sx + (r.accumulated_minutes ?? r.total_minutes ?? 0), 0);
    const daysPresent = attRows.length;

    // Broadcasts received this month only.
    const monthBcasts = bcastRows.filter((b: { owner_broadcasts: { created_at: string } | null }) => {
      const c = b.owner_broadcasts?.created_at;
      return c && c >= startTs && c <= endTs;
    });

    return {
      id: m.id,
      fullName: m.full_name,
      role: m.role === "site_engineer" ? "site_engineer" : "team_member",
      roleLabel: m.role_label,
      tags: (tags.get(m.id) ?? []).map((t: { tag: string }) => t.tag),
      phone: m.phone,
      experienceYears: m.experience_years,

      daysPresent,
      totalMinutes,
      avgMinutes: daysPresent > 0 ? Math.round(totalMinutes / daysPresent) : 0,
      checkInCount: attRows.reduce((sx: number, r: { check_in_count: number | null }) => sx + (r.check_in_count ?? 1), 0),
      geofenceFlags: attRows.filter((r: { check_in_within_geofence: boolean | null; check_out_within_geofence: boolean | null }) =>
        r.check_in_within_geofence === false || r.check_out_within_geofence === false).length,

      dailyTotal: dailyRows.length,
      dailyDone: dailyRows.filter((t: { is_done: boolean }) => t.is_done).length,
      persistentTotal: persistRows.length,
      persistentDone: persistRows.filter((t: { completed: boolean }) => t.completed).length,

      drawings: perfRows.reduce((sx: number, r: { drawings_completed: number }) => sx + (r.drawings_completed ?? 0), 0),
      revisions: perfRows.reduce((sx: number, r: { revisions: number }) => sx + (r.revisions ?? 0), 0),
      errors: perfRows.reduce((sx: number, r: { errors: number }) => sx + (r.errors ?? 0), 0),
      avgDeadlinePct: avg(perfRows.map((r: { deadline_met_pct: number | null }) => r.deadline_met_pct).filter((n: number | null): n is number => n != null)),
      avgRating: avg(perfRows.map((r: { client_rating: number | null }) => r.client_rating).filter((n: number | null): n is number => n != null)),

      broadcastsReceived: monthBcasts.length,
      broadcastsAcked: monthBcasts.filter((b: { is_acknowledged: boolean }) => b.is_acknowledged).length,

      siteCheckIns: ciRows.length,
      siteWithinGeo: ciRows.filter((c: { within_geofence: boolean | null }) => c.within_geofence).length,
      siteProjectsVisited: new Set(ciRows.map((c: { project_id: string | null }) => c.project_id).filter(Boolean)).size,

      attendanceRows: attRows.map((r: { work_date: string; check_in_at: string | null; check_out_at: string | null; accumulated_minutes: number | null; total_minutes: number | null; check_in_within_geofence: boolean | null; check_out_within_geofence: boolean | null }) => ({
        date: fmtDate(r.work_date),
        checkIn: fmtTime(r.check_in_at),
        checkOut: fmtTime(r.check_out_at),
        minutes: r.accumulated_minutes ?? r.total_minutes ?? 0,
        flagged: r.check_in_within_geofence === false || r.check_out_within_geofence === false,
      })),

      taskRows: [
        ...dailyRows.map((t: { description: string; is_done: boolean; task_date: string; done_at: string | null }) => ({
          title: t.description,
          done: t.is_done,
          when: fmtDate(t.done_at ?? t.task_date),
        })),
        ...persistRows.map((t: { title: string; completed: boolean; completed_at: string | null; created_at: string }) => ({
          title: t.title,
          done: t.completed,
          when: fmtDate(t.completed_at ?? t.created_at),
        })),
      ],

      checkInRows: ciRows.map((c: { checked_in_at: string; within_geofence: boolean | null; projects: { name: string } | null }) => ({
        date: fmtDate(c.checked_in_at),
        time: fmtTime(c.checked_in_at),
        project: c.projects?.name ?? "Unknown project",
        withinGeo: !!c.within_geofence,
      })),
    };
  });

  const data: ReportData = {
    studioName,
    monthLabel: monthKeyLabel(monthKey),
    generatedAt: new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: IST }),
    logoSrc,
    members: report,
  };

  const buffer = await renderToBuffer(<MonthlyReport data={data} />);
  const filename = `${studioName.replace(/\s+/g, "_")}_${monthKey}_Report.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
