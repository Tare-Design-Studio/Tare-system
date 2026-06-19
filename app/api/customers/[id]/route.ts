import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("customers")
    .select(`
      *,
      enquiry_reminders(id, remind_at, message, category, priority, is_done, done_at),
      enquiries!created_from_enquiry_id(id, status, created_at),
      projects!customer_id(id, name, status, current_stage)
    `)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["name", "phone", "email", "address"] as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("customers")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — permanently remove a customer (phrase-gated on the client).
// customers has no soft-delete column; authenticated has no DELETE grant, so we
// delete via the service client after verifying capability + tenant. The
// projects.customer_id FK (NO ACTION) blocks deletion while projects are linked.
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canView } = await supabase.rpc("has_capability", { p_capability: "customer:view" });
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Confirm the customer exists and is visible to this caller (tenant-scoped via RLS).
  const { data: customer } = await supabase.from("customers").select("id").eq("id", id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  // Block deletion if any project still references this customer.
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Unlink the customer's projects before deleting." },
      { status: 409 }
    );
  }

  const admin = createServiceClient();
  const { error } = await admin.from("customers").delete().eq("id", id);
  if (error) {
    // FK violation (e.g. soft-deleted project still references) → friendly message.
    if (error.code === "23503") {
      return NextResponse.json({ error: "This customer is still referenced by other records." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
