import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PROJECT_TYPES = [
  "residential", "commercial", "institutional", "industrial",
  "interior", "landscape", "urban", "other",
] as const;

const PutSchema = z.object({
  user_id: z.string().uuid(),
  // Empty array = no restriction = sees every project (the default).
  project_types: z.array(z.enum(PROJECT_TYPES)),
});

// GET /api/access-matrix/categories — who is narrowed to which project types.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: can } = await supabase.rpc("has_capability", { p_capability: "access_control:manage" });
  if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("user_project_categories")
    .select("user_id, project_type");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byUser: Record<string, string[]> = {};
  for (const row of (data ?? []) as { user_id: string; project_type: string }[]) {
    (byUser[row.user_id] ??= []).push(row.project_type);
  }

  return NextResponse.json({ categories: byUser, project_types: PROJECT_TYPES });
}

// PUT /api/access-matrix/categories — set one member's visible project types.
//
// Sending an empty array clears every restriction, which RESTORES universal
// access rather than removing it: project_type_visible() (089) treats "no rows"
// as "all types". That inversion is deliberate — the default must be open.
export async function PUT(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: can } = await supabase.rpc("has_capability", { p_capability: "access_control:manage" });
  if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { user_id, project_types } = parsed.data;

  const { data: caller } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!caller) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  // The target must be in the caller's own tenant — never trust the body alone.
  const { data: target } = await supabase
    .from("users")
    .select("id, tenant_id")
    .eq("id", user_id)
    .maybeSingle();

  if (!target || target.tenant_id !== caller.tenant_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from("user_project_categories")
    .delete()
    .eq("user_id", user_id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (project_types.length) {
    const { error: insErr } = await supabase
      .from("user_project_categories")
      .insert(project_types.map(t => ({ user_id, project_type: t, tenant_id: caller.tenant_id })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ user_id, project_types });
}
