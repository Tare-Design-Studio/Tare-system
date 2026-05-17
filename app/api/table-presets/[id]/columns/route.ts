import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const AddColumnSchema = z.object({
  name: z.string().min(1).max(200),
  column_kind: z.enum(["text", "checkbox", "date", "revision_text", "serial"]),
  display_order: z.number().int().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
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
  const { data: preset } = await service
    .from("table_presets")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!preset) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = AddColumnSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  let display_order = result.data.display_order;
  if (display_order === undefined) {
    const { data: maxRow } = await service
      .from("table_preset_columns")
      .select("display_order")
      .eq("preset_id", id)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    display_order = (maxRow?.display_order ?? 0) + 1;
  }

  const { data: column, error } = await service
    .from("table_preset_columns")
    .insert({ preset_id: id, name: result.data.name, column_kind: result.data.column_kind, display_order })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column }, { status: 201 });
}
