import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Edit or retire a single office. RLS scopes every statement to the caller's
// own tenant, so an id from another studio simply matches no row.

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  address: z.string().trim().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  geofence_radius_m: z.number().int().min(50).max(5000).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canConfigure } = await supabase.rpc("has_capability", {
    p_capability: "office_attendance:configure",
  });
  if (!canConfigure) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("offices")
    .update(parsed.data)
    .eq("id", id)
    .select("id, name, address, lat, lng, geofence_radius_m, is_active")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An office with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

// Retire rather than delete: attendance rows reference the office, and the
// history of who was where should survive an office closing. Deactivating takes
// it out of check-in matching while leaving past records readable.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canConfigure } = await supabase.rpc("has_capability", {
    p_capability: "office_attendance:configure",
  });
  if (!canConfigure) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("offices")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
