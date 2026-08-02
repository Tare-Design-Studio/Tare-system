import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Weights are stored numeric(4,3); penalties numeric(5,2).
const PatchSchema = z.object({
  weight_efficiency: z.number().min(0).max(1),
  weight_quality: z.number().min(0).max(1),
  weight_delivery: z.number().min(0).max(1),
  weight_client_rating: z.number().min(0).max(1).optional(),
  include_client_rating: z.boolean().optional(),
  efficiency_multiplier: z.number().positive().max(100),
  error_penalty: z.number().min(0).max(100),
  revision_penalty: z.number().min(0).max(100),
  delay_penalty: z.number().min(0).max(100),
});

// GET /api/kpi-settings — the scoring policy this tenant is judged by.
// Readable by everyone in the tenant: being scored by a hidden formula is worse
// than no score at all. Writing is gated separately below.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data, error }, { data: canConfigure }] = await Promise.all([
    supabase.from("kpi_settings").select("*").maybeSingle(),
    supabase.rpc("has_capability", { p_capability: "performance:configure" }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data, can_configure: !!canConfigure });
}

// PATCH /api/kpi-settings — change the KPI (client requests #9 / #10).
export async function PATCH(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: can } = await supabase.rpc("has_capability", { p_capability: "performance:configure" });
  if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
  }
  const body = parsed.data;

  const includeClient = body.include_client_rating ?? false;
  const clientWeight = includeClient ? (body.weight_client_rating ?? 0) : 0;
  const sum = body.weight_efficiency + body.weight_quality + body.weight_delivery + clientWeight;

  // The DB trigger validate_kpi_weights() enforces this too; checking here
  // turns a raw Postgres exception into a readable message.
  if (Math.round(sum * 1000) !== 1000) {
    return NextResponse.json(
      { error: `Weights must add up to 100% (currently ${Math.round(sum * 1000) / 10}%)` },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { data, error } = await supabase
    .from("kpi_settings")
    .update({
      weight_efficiency: body.weight_efficiency,
      weight_quality: body.weight_quality,
      weight_delivery: body.weight_delivery,
      weight_client_rating: clientWeight,
      include_client_rating: includeClient,
      efficiency_multiplier: body.efficiency_multiplier,
      error_penalty: body.error_penalty,
      revision_penalty: body.revision_penalty,
      delay_penalty: body.delay_penalty,
      updated_by: user.id,
    })
    .eq("tenant_id", profile.tenant_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
