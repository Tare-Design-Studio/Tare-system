import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/enquiries — Owner: all enquiries for tenant
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("enquiries")
    .select(`
      id, name, phone, email, source, status, message,
      created_via, created_at, converted_to_customer_id,
      enquiry_reminders(id, remind_at, message, category, priority, is_done),
      enquiry_remarks(id, remark, created_at, created_by)
    `)
    .is("converted_to_customer_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/enquiries — Owner: create enquiry manually
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, phone, email, source, message } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("enquiries")
    .insert({
      tenant_id: profile.tenant_id,
      name: name.trim(),
      phone: phone ?? null,
      email: email ?? null,
      source: source ?? null,
      message: message ?? null,
      created_via: "manual",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
