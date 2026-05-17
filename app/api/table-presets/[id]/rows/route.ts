import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const AddRowSchema = z.object({
  section_id: z.string().uuid().nullable().optional(),
  display_order: z.number().int().optional(),
  cells: z.record(z.string(), z.unknown()).optional(),
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

  const result = AddRowSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  if (result.data.section_id) {
    const { data: section } = await service
      .from("table_preset_sections")
      .select("id")
      .eq("id", result.data.section_id)
      .eq("preset_id", id)
      .maybeSingle();

    if (!section) return NextResponse.json({ error: "Section not found for this preset" }, { status: 400 });
  }

  let display_order = result.data.display_order;
  if (display_order === undefined) {
    const { data: maxRow } = await service
      .from("table_preset_rows")
      .select("display_order")
      .eq("preset_id", id)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    display_order = (maxRow?.display_order ?? 0) + 1;
  }

  const { data: row, error } = await service
    .from("table_preset_rows")
    .insert({
      preset_id: id,
      section_id: result.data.section_id ?? null,
      display_order,
      cells: (result.data.cells ?? {}) as Record<string, never>,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row }, { status: 201 });
}
