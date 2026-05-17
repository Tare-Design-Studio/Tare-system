import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const UpdatePresetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  table_owner_role: z.enum(["team_member", "site_engineer"]).optional(),
  is_default_for_role: z.boolean().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
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

  const result = UpdatePresetSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "User profile not found" }, { status: 500 });

  const service = createServiceClient();
  const { data: preset, error } = await service
    .from("table_presets")
    .update(result.data)
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .eq("is_system", false)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!preset) return NextResponse.json({ error: "Preset not found or cannot be edited" }, { status: 404 });
  return NextResponse.json({ preset });
}

export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: canManage }, { data: canCreateProject }] = await Promise.all([
    supabase.rpc("has_capability", { p_capability: "table_preset:manage" }),
    supabase.rpc("has_capability", { p_capability: "project:create" }),
  ]);
  if (!canManage && !canCreateProject) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: profile } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "User profile not found" }, { status: 500 });
  const service = createServiceClient();

  const { data: existing } = await service
    .from("table_presets")
    .select("is_system")
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

  if (existing?.is_system) {
    return NextResponse.json({ error: "System presets cannot be deleted" }, { status: 403 });
  }

  const { error } = await service.from("table_presets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
