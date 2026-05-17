import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("personal_reminders")
    .select("id, title, reminder_at, type, is_done, done_at, created_at")
    .eq("user_id", user.id)
    .order("reminder_at", { ascending: true });

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
  const title = (body?.title ?? "").trim();
  const reminder_at = body?.reminder_at;
  const type = body?.type ?? "other";

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!reminder_at) return NextResponse.json({ error: "reminder_at is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("personal_reminders")
    .insert({ user_id: user.id, tenant_id: profile.tenant_id, title, reminder_at, type })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
