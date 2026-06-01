import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// POST /api/enquiries/[id]/reminders
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { remind_at, message, category = "other", priority = "normal" } = body;

  if (!remind_at) {
    return NextResponse.json({ error: "remind_at is required" }, { status: 400 });
  }

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
      enquiry_id: id,
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

// PATCH /api/enquiries/[id]/reminders — mark done or reschedule/edit
export async function PATCH(req: Request, { params }: Params) {
  const { id: enquiry_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { reminder_id, is_done, remind_at, message, category } = body;
  if (!reminder_id) return NextResponse.json({ error: "reminder_id is required" }, { status: 400 });

  const update: {
    is_done?: boolean;
    remind_at?: string;
    message?: string;
    category?: string;
  } = {};
  if (typeof is_done === "boolean") update.is_done = is_done;
  if (typeof remind_at === "string" && remind_at) update.remind_at = remind_at;
  if (typeof message === "string") update.message = message;
  if (typeof category === "string" && category) update.category = category;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("enquiry_reminders")
    .update(update)
    .eq("id", reminder_id)
    .eq("enquiry_id", enquiry_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/enquiries/[id]/reminders?reminder_id=...
export async function DELETE(req: Request, { params }: Params) {
  const { id: enquiry_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reminder_id = new URL(req.url).searchParams.get("reminder_id");
  if (!reminder_id) return NextResponse.json({ error: "reminder_id is required" }, { status: 400 });

  const { error } = await supabase
    .from("enquiry_reminders")
    .delete()
    .eq("id", reminder_id)
    .eq("enquiry_id", enquiry_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
