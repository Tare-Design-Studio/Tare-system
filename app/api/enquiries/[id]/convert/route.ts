import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// POST /api/enquiries/[id]/convert — convert enquiry to customer
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Fetch the enquiry
  const { data: enquiry, error: eErr } = await supabase
    .from("enquiries")
    .select("id, name, phone, email, converted_to_customer_id")
    .eq("id", id)
    .single();

  if (eErr || !enquiry) {
    return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  }
  if (enquiry.converted_to_customer_id) {
    return NextResponse.json({ error: "Already converted" }, { status: 409 });
  }

  // Create customer row
  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .insert({
      tenant_id: profile.tenant_id,
      name: enquiry.name,
      phone: enquiry.phone,
      email: enquiry.email,
      created_from_enquiry_id: id,
    })
    .select()
    .single();

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // Update enquiry: set converted_to_customer_id + status = 'converted'
  const { error: uErr } = await supabase
    .from("enquiries")
    .update({
      status: "converted",
      converted_to_customer_id: customer.id,
    })
    .eq("id", id);

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ customer_id: customer.id }, { status: 201 });
}
