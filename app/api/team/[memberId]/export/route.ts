import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function rangeStart(range: string): string {
  const now = new Date();
  if (range === "3m") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }
  if (range === "6m") {
    const d = new Date(now);
    d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  }
  if (range === "year") {
    return `${now.getFullYear()}-01-01`;
  }
  return now.toISOString().slice(0, 7) + "-01";
}

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cap } = await supabase.rpc("has_capability", { p_capability: "office_attendance:view_all" });
  if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await params;
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") ?? "month";
  const section = searchParams.get("section") ?? "all";
  const start = rangeStart(range);
  const today = new Date().toISOString().slice(0, 10);

  const { data: member } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("id", memberId)
    .is("deleted_at", null)
    .single();

  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isSiteEngineer = member.role === "site_engineer";
  const lines: string[] = [];

  if (isSiteEngineer) {
    const { data: checkIns } = await supabase
      .from("site_check_ins")
      .select("checked_in_at, within_geofence, projects:project_id(name)")
      .eq("user_id", memberId)
      .gte("checked_in_at", `${start}T00:00:00.000Z`)
      .lte("checked_in_at", `${today}T23:59:59.999Z`)
      .order("checked_in_at", { ascending: false });

    lines.push(csvRow(["Date", "Time", "Project", "Within Geofence"]));
    for (const row of checkIns ?? []) {
      const dt = new Date(row.checked_in_at);
      const project = (row.projects as { name: string } | null)?.name ?? "";
      lines.push(csvRow([
        dt.toISOString().slice(0, 10),
        dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        project,
        row.within_geofence ? "Yes" : "No",
      ]));
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${member.full_name.replace(/\s+/g, "_")}_checkins_${range}.csv"`,
      },
    });
  }

  // Team member — build a multi-section CSV or per-section
  const perfMonthStart = start.slice(0, 7) + "-01";

  const [attendanceRes, dailyTasksRes, memberTasksRes, perfRes] = await Promise.all([
    (section === "all" || section === "attendance")
      ? supabase
          .from("attendance_logs")
          .select("work_date, check_in_at, check_out_at, total_minutes, check_in_within_geofence")
          .eq("user_id", memberId)
          .gte("work_date", start)
          .lte("work_date", today)
          .order("work_date", { ascending: false })
      : Promise.resolve({ data: null }),

    (section === "all" || section === "tasks")
      ? supabase
          .from("team_daily_tasks")
          .select("task_date, description, is_done, done_at")
          .eq("user_id", memberId)
          .gte("task_date", start)
          .lte("task_date", today)
          .order("task_date", { ascending: false })
      : Promise.resolve({ data: null }),

    (section === "all" || section === "tasks")
      ? supabase
          .from("member_tasks")
          .select("title, completed, completed_at, created_at")
          .eq("user_id", memberId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),

    (section === "all" || section === "performance")
      ? supabase
          .from("team_performance_monthly")
          .select("period_month, drawings_completed, errors, revisions, deadline_met_pct, client_rating, site_delay_days, notes")
          .eq("user_id", memberId)
          .gte("period_month", perfMonthStart)
          .order("period_month", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  if (section === "attendance" || section === "all") {
    if (section === "all") lines.push("=== ATTENDANCE ===");
    lines.push(csvRow(["Date", "Check In", "Check Out", "Total Minutes", "Within Geofence"]));
    for (const row of attendanceRes.data ?? []) {
      lines.push(csvRow([
        row.work_date,
        row.check_in_at ? new Date(row.check_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "",
        row.check_out_at ? new Date(row.check_out_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "",
        row.total_minutes ?? "",
        row.check_in_within_geofence ? "Yes" : "No",
      ]));
    }
  }

  if (section === "tasks" || section === "all") {
    if (section === "all") lines.push("", "=== DAILY TASKS ===");
    lines.push(csvRow(["Date", "Description", "Done", "Done At"]));
    for (const row of dailyTasksRes.data ?? []) {
      lines.push(csvRow([
        row.task_date,
        row.description,
        row.is_done ? "Yes" : "No",
        row.done_at ? new Date(row.done_at).toLocaleString("en-IN") : "",
      ]));
    }

    if (section === "all") lines.push("", "=== PERSISTENT TASKS ===");
    else lines.push("", csvRow(["Title", "Completed", "Completed At", "Created At"]));
    if (section !== "all") lines.push(csvRow(["Title", "Completed", "Completed At", "Created At"]));
    else lines.push(csvRow(["Title", "Completed", "Completed At", "Created At"]));
    for (const row of memberTasksRes.data ?? []) {
      lines.push(csvRow([
        row.title,
        row.completed ? "Yes" : "No",
        row.completed_at ? new Date(row.completed_at).toLocaleString("en-IN") : "",
        new Date(row.created_at).toLocaleString("en-IN"),
      ]));
    }
  }

  if (section === "performance" || section === "all") {
    if (section === "all") lines.push("", "=== PERFORMANCE ===");
    lines.push(csvRow(["Month", "Drawings", "Errors", "Revisions", "Deadline Met %", "Client Rating", "Site Delay Days", "Notes"]));
    for (const row of perfRes.data ?? []) {
      lines.push(csvRow([
        row.period_month,
        row.drawings_completed,
        row.errors,
        row.revisions,
        row.deadline_met_pct ?? "",
        row.client_rating ?? "",
        row.site_delay_days,
        row.notes ?? "",
      ]));
    }
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${member.full_name.replace(/\s+/g, "_")}_${section}_${range}.csv"`,
    },
  });
}
