import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const TaskSchema = z.object({
  description: z.string().min(1).max(200),
  project_id: z.string().uuid().optional(),
  task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date");   // YYYY-MM-DD — defaults to today
  const user_id = url.searchParams.get("user_id") ?? user.id;

  let query = supabase
    .from("team_daily_tasks")
    .select("id, description, project_id, task_date, is_done, done_at, created_at, updated_at")
    .eq("user_id", user_id)
    .order("task_date", { ascending: false })
    .order("created_at", { ascending: true });

  if (date) query = query.eq("task_date", date);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // tenant_id is required on insert (no project parent to derive from)
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = TaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from("team_daily_tasks")
    .insert({ user_id: user.id, tenant_id: profile.tenant_id, ...parsed.data })
    .select("id, description, project_id, task_date, is_done, done_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { id, is_done } = z.object({
    id: z.string().uuid(),
    is_done: z.boolean(),
  }).parse(body);

  const { data, error } = await supabase
    .from("team_daily_tasks")
    .update({ is_done })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, is_done, done_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
