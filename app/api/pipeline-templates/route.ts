import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("checkpoint_templates")
    .select("*, checkpoint_template_items(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", { p_capability: "project:create" });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = CreateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!profile?.tenant_id) return NextResponse.json({ error: "User profile not found" }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: template, error: insertError } = await supabase
    .from("checkpoint_templates")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ ...result.data, tenant_id: profile.tenant_id, created_by: user.id } as any)
    .select()
    .single();

  if (insertError || !template) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create template" }, { status: 500 });
  }

  return NextResponse.json({ template }, { status: 201 });
}
