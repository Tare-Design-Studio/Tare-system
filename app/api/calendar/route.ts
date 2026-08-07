import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/calendar?month=YYYY-MM
// Returns events visible to the current user for the given month.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // e.g. "2026-05"

  let startOf: Date;
  let endOf: Date;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    startOf = new Date(y, m - 1, 1);
    endOf   = new Date(y, m, 1);
  } else {
    const now = new Date();
    startOf = new Date(now.getFullYear(), now.getMonth(), 1);
    endOf   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, title, description, starts_at, ends_at, visibility, source_type, source_id, project_id, enquiry_id, customer_id, assigned_user_id, created_by")
    .gte("starts_at", startOf.toISOString())
    .lt("starts_at", endOf.toISOString())
    .order("starts_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/calendar — create a calendar event
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, starts_at, ends_at, description, visibility = "project", project_id } = body;

  if (!title?.trim() || !starts_at) {
    return NextResponse.json({ error: "title and starts_at are required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      tenant_id: profile.tenant_id,
      title: title.trim(),
      starts_at,
      ends_at: ends_at ?? null,
      description: description ?? null,
      visibility,
      project_id: project_id ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
