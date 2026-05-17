import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";

function generateHash(): string {
  // 16 hex chars
  return randomBytes(8).toString("hex");
}

// POST /api/customers/[id]/portal   body: { action: "generate" | "revoke" | "regenerate" }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Portal generation gated by team:edit_user (Owner + admin tag).
  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: "team:edit_user" });
  if (!canManage) return NextResponse.json({ error: "Forbidden — requires team:edit_user" }, { status: 403 });

  const { action } = (await req.json()) as { action: "generate" | "revoke" | "regenerate" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: customer, error: cErr } = await db
    .from("customers")
    .select("id, customer_portal_hash, customer_portal_enabled")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  if (action === "revoke") {
    const { error } = await db
      .from("customers")
      .update({ customer_portal_enabled: false })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "generate") {
    // If a hash already exists, just enable + return it.
    if (customer.customer_portal_hash) {
      const { error } = await db
        .from("customers")
        .update({ customer_portal_enabled: true })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ hash: customer.customer_portal_hash });
    }
    const hash = generateHash();
    const { error } = await db
      .from("customers")
      .update({
        customer_portal_hash: hash,
        customer_portal_hash_generated_at: new Date().toISOString(),
        customer_portal_enabled: true,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ hash });
  }

  if (action === "regenerate") {
    const hash = generateHash();
    const { error } = await db
      .from("customers")
      .update({
        customer_portal_hash: hash,
        customer_portal_hash_generated_at: new Date().toISOString(),
        customer_portal_enabled: true,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ hash });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
