import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/enquiries/[id]/phones   body: { phone, label?, is_primary? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canEdit } = await supabase.rpc("has_capability", { p_capability: "enquiry:edit" });
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const phone = String(body.phone ?? "").trim();
  if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 });
  const label = body.label ?? null;
  const isPrimary = body.is_primary === true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // If marking primary, unset other primaries first
  if (isPrimary) {
    await db.from("enquiry_phones").update({ is_primary: false }).eq("enquiry_id", id);
  }

  const { data, error } = await db
    .from("enquiry_phones")
    .insert({ enquiry_id: id, phone, label, is_primary: isPrimary })
    .select("id, phone, label, is_primary, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/enquiries/[id]/phones?phone_id=...
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canEdit } = await supabase.rpc("has_capability", { p_capability: "enquiry:edit" });
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const phoneId = req.nextUrl.searchParams.get("phone_id");
  if (!phoneId) return NextResponse.json({ error: "phone_id required" }, { status: 400 });

  const { error } = await supabase
    .from("enquiry_phones")
    .delete()
    .eq("id", phoneId)
    .eq("enquiry_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
