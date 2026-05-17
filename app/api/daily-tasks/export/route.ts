import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const target_user_id = url.searchParams.get("user_id") ?? user.id;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // Non-owners can only export their own tasks
  if (target_user_id !== user.id) {
    const { data: cap } = await supabase
      .from("user_capabilities")
      .select("granted")
      .eq("user_id", user.id)
      .eq("capability", "daily_tasks:view_all")
      .eq("granted", true)
      .maybeSingle();
    if (!cap) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query = supabase
    .from("team_daily_tasks")
    .select(`
      task_date, description, is_done, done_at, project_id,
      users:user_id (full_name),
      projects:project_id (name)
    `)
    .eq("user_id", target_user_id)
    .order("task_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (from) query = query.gte("task_date", from);
  if (to) query = query.lte("task_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const lines: string[] = ["Date,User,Project,Task,Done,Done At"];
  for (const r of rows) {
    const user_name = (r.users as { full_name: string } | null)?.full_name ?? "";
    const project_name = (r.projects as { name: string } | null)?.name ?? "";
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    lines.push([
      r.task_date,
      esc(user_name),
      esc(project_name),
      esc(r.description),
      r.is_done ? "Yes" : "No",
      r.done_at ? new Date(r.done_at).toISOString() : "",
    ].join(","));
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="daily-tasks-export.csv"`,
    },
  });
}
