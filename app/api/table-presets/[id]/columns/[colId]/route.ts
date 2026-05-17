import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Context = { params: Promise<{ id: string; colId: string }> };

export async function DELETE(_req: Request, { params }: Context) {
  const { id, colId } = await params;
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
  const { data: preset } = await service
    .from("table_presets")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

  const { error } = await service.from("table_preset_columns").delete().eq("id", colId).eq("preset_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
