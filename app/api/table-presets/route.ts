import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const CreatePresetSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  table_owner_role: z.enum(["team_member", "site_engineer"]),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("table_presets")
    .select("*, table_preset_columns(*), table_preset_sections(*), table_preset_rows(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presets: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: canManage }, { data: canCreateProject }] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "table_preset:manage" }),
    supabase.rpc("has_capability", { p_capability: "project:create" }),
  ]);
  if (!canManage && !canCreateProject) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = CreatePresetSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  const { data: cap } = await supabase
    .from("user_capabilities")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!cap) return NextResponse.json({ error: "User profile not found" }, { status: 500 });

  const service = createServiceClient();
  const { data: createdPreset, error: createError } = await service
    .from("table_presets")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ ...result.data, tenant_id: cap.tenant_id, created_by: user.id } as any)
    .select()
    .single();

  if (createError || !createdPreset) {
    return NextResponse.json({ error: createError?.message ?? "Failed to create preset" }, { status: 500 });
  }

  return NextResponse.json({ preset: createdPreset }, { status: 201 });
}
