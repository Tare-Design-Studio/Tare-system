import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/attendance/day";

// Per-member activity totals over an IST date range, for the overview's
// performance chart. Day-granular sources only — the KPI view is monthly.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z
  .object({ from: z.string().regex(DAY), to: z.string().regex(DAY) })
  .refine((q) => q.from <= q.to, "from must be on or before to")
  .refine(
    (q) => (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 366,
    "Range is limited to one year",
  );

export type TeamPerformanceRow = {
  user_id: string;
  full_name: string;
  role: string;
  minutes: number;
  tasks_done: number;
  updates: number;
  site_visits: number;
};

// Same counters per member per IST day, for the trend graph. Only days with activity are listed.
export type TeamPerformanceDay = Omit<TeamPerformanceRow, "full_name" | "role"> & { date: string };

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same gate as /api/performance.
  const [{ data: capFinance }, { data: capTeam }] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "finance:view_dashboard" }),
    supabase.rpc("has_capability", { p_capability: "team:edit_user" }),
  ]);
  if (!capFinance && !capTeam) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ from: searchParams.get("from"), to: searchParams.get("to") });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid range" }, { status: 400 });
  }
  const { from, to } = parsed.data;
  const startIso = `${from}T00:00:00+05:30`;
  const endIso = `${to}T23:59:59.999+05:30`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [membersRes, attendanceRes, tasksRes, updatesRes, visitsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, role")
      .eq("is_active", true)
      .is("deleted_at", null)
      .neq("role", "owner")
      .order("full_name"),
    db.from("attendance_logs").select("user_id, work_date, total_minutes").gte("work_date", from).lte("work_date", to),
    db.from("member_tasks").select("user_id, completed_at").gte("completed_at", startIso).lte("completed_at", endIso),
    supabase.from("updates").select("author_id, created_at").gte("created_at", startIso).lte("created_at", endIso),
    db.from("site_check_ins").select("user_id, checked_in_at").gte("checked_in_at", startIso).lte("checked_in_at", endIso),
  ]);

  const failed = [membersRes, attendanceRes, tasksRes, updatesRes, visitsRes].find((r) => r.error);
  if (failed) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const rows = new Map<string, TeamPerformanceRow>();
  for (const m of membersRes.data ?? []) {
    rows.set(m.id, { user_id: m.id, full_name: m.full_name, role: m.role, minutes: 0, tasks_done: 0, updates: 0, site_visits: 0 });
  }
  const days = new Map<string, TeamPerformanceDay>();
  type Counter = "minutes" | "tasks_done" | "updates" | "site_visits";
  const add = (userId: string, date: string, field: Counter, by: number) => {
    const row = rows.get(userId);
    if (!row) return;
    row[field] += by;
    const k = `${userId}|${date}`;
    const d = days.get(k) ?? { user_id: userId, date, minutes: 0, tasks_done: 0, updates: 0, site_visits: 0 };
    d[field] += by;
    days.set(k, d);
  };
  const istDay = (iso: string) => localDate(new Date(iso));

  for (const r of attendanceRes.data as { user_id: string; work_date: string; total_minutes: number | null }[]) {
    add(r.user_id, r.work_date, "minutes", r.total_minutes ?? 0);
  }
  for (const r of tasksRes.data as { user_id: string; completed_at: string }[]) {
    add(r.user_id, istDay(r.completed_at), "tasks_done", 1);
  }
  for (const r of (updatesRes.data ?? []) as { author_id: string; created_at: string }[]) {
    add(r.author_id, istDay(r.created_at), "updates", 1);
  }
  for (const r of visitsRes.data as { user_id: string; checked_in_at: string }[]) {
    add(r.user_id, istDay(r.checked_in_at), "site_visits", 1);
  }

  return NextResponse.json({ data: [...rows.values()], daily: [...days.values()] });
}
