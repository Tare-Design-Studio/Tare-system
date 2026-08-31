import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CAPABILITY = "images:select_for_customer";

const CreateSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  project_id: z.string().uuid().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// GET /api/customers/[id]/updates — client-facing updates for the admin surface.
// Returns hidden rows too; the portal RPC is what filters on is_visible.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: CAPABILITY });
  if (!canManage) return NextResponse.json({ error: `Forbidden — requires ${CAPABILITY}` }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("customer_updates")
    .select("id, body, project_id, is_visible, created_at, edited_at, author_id, users:author_id(full_name)")
    .eq("customer_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/customers/[id]/updates — write a message for the client to read.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: CAPABILITY });
  if (!canManage) return NextResponse.json({ error: `Forbidden — requires ${CAPABILITY}` }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Confirm the customer is in the caller's tenant before writing. RLS would
  // catch a cross-tenant write anyway; this turns it into a 404 rather than a
  // policy violation.
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const { data, error } = await db
    .from("customer_updates")
    .insert({
      customer_id: id,
      project_id: parsed.data.project_id ?? null,
      author_id: user.id,
      body: parsed.data.body,
    })
    .select("id, body, project_id, is_visible, created_at, edited_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
