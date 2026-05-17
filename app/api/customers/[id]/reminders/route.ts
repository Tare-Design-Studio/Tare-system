import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { remind_at, message, category = "other", priority = "medium" } = body;
  if (!remind_at) return NextResponse.json({ error: "remind_at is required" }, { status: 400 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("enquiry_reminders")
    .insert({
      tenant_id: profile.tenant_id,
      customer_id: id,
      user_id: user.id,
      remind_at,
      message: message ?? null,
      category,
      priority,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id: customer_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reminder_id, is_done } = await req.json();
  if (!reminder_id) return NextResponse.json({ error: "reminder_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("enquiry_reminders")
    .update({ is_done: Boolean(is_done) })
    .eq("id", reminder_id)
    .eq("customer_id", customer_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
