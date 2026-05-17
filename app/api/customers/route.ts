import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("customers")
    .select(`
      id, name, phone, email, address, created_at,
      projects ( id, name, status, current_stage, v_payment_status ( is_paid, amount_due, amount_received ) )
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: canCreateProject }, { data: canViewCustomers }] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "project:create" }),
    supabase.rpc("has_capability", { p_capability: "customer:view" }),
  ]);
  if (!canCreateProject && !canViewCustomers) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data: tenant } = await supabase
    .from("user_capabilities")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!tenant) return NextResponse.json({ error: "User profile not found" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insert: any = { tenant_id: tenant.tenant_id, name };
  if (body.phone) insert.phone = body.phone.trim();
  if (body.email) insert.email = body.email.trim();
  if (body.address) insert.address = body.address.trim();

  const { data, error } = await supabase
    .from("customers")
    .insert(insert)
    .select("id, name, phone, email, address, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
