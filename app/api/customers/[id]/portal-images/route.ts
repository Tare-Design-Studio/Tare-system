import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const CAPABILITY = "images:select_for_customer";
const SIGNED_URL_TTL = 60 * 60; // 1 hour — the admin grid is a working session

const PatchSchema = z.object({
  asset_id: z.string().uuid(),
  visible_to_customer: z.boolean().optional(),
  customer_caption: z.string().trim().max(200).nullable().optional(),
}).refine(
  v => v.visible_to_customer !== undefined || v.customer_caption !== undefined,
  { message: "Nothing to update" },
);

type Ctx = { params: Promise<{ id: string }> };

// Every image belonging to this customer's projects, with a signed preview URL
// so the owner can see what they are publishing.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: CAPABILITY });
  if (!canManage) return NextResponse.json({ error: `Forbidden — requires ${CAPABILITY}` }, { status: 403 });

  // Tenant check through the caller's own client, so a foreign customer id is
  // invisible before the service client is ever used.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: customer } = await db.from("customers").select("id").eq("id", id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const service = createServiceClient();

  const { data: projects } = await service
    .from("projects")
    .select("id, name")
    .eq("customer_id", id)
    .is("deleted_at", null);

  const projectIds = (projects ?? []).map(p => p.id);
  if (projectIds.length === 0) return NextResponse.json({ data: [] });

  const projectName = new Map((projects ?? []).map(p => [p.id, p.name]));

  const { data: assets, error } = await service
    .from("media_assets")
    .select("id, project_id, storage_path, webp_path, bucket, kind, taken_at, created_at, visible_to_customer, customer_caption, is_clean")
    .in("project_id", projectIds)
    .in("kind", ["site_image", "drawing"])
    .eq("is_clean", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await Promise.all((assets ?? []).map(async (a) => {
    // Prefer the webp derivative; fall back to the original when conversion
    // never happened (pre-existing uploads) or failed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path = ((a as any).webp_path as string | null) ?? a.storage_path;
    const { data: signed } = await service.storage
      .from(a.bucket)
      .createSignedUrl(path, SIGNED_URL_TTL);
    return {
      id: a.id,
      project_id: a.project_id,
      project_name: projectName.get(a.project_id) ?? null,
      kind: a.kind,
      taken_at: a.taken_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      visible_to_customer: (a as any).visible_to_customer as boolean,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customer_caption: ((a as any).customer_caption as string | null) ?? null,
      url: signed?.signedUrl ?? null,
    };
  }));

  return NextResponse.json({ data: rows });
}

// Toggle what the client sees, or caption it.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: CAPABILITY });
  if (!canManage) return NextResponse.json({ error: `Forbidden — requires ${CAPABILITY}` }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: customer } = await db.from("customers").select("id").eq("id", id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const service = createServiceClient();

  // The asset must belong to a project owned by THIS customer. Without this the
  // capability would let a holder publish any image in the tenant onto any
  // client's portal.
  const { data: asset } = await service
    .from("media_assets")
    .select("id, project_id, projects!inner(customer_id, deleted_at)")
    .eq("id", parsed.data.asset_id)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owner = (asset as any)?.projects;
  if (!asset || !owner || owner.customer_id !== id || owner.deleted_at !== null) {
    return NextResponse.json({ error: "Image not found for this customer" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {};
  if (parsed.data.visible_to_customer !== undefined) patch.visible_to_customer = parsed.data.visible_to_customer;
  if (parsed.data.customer_caption !== undefined) patch.customer_caption = parsed.data.customer_caption;

  const { error } = await service
    .from("media_assets")
    .update(patch)
    .eq("id", parsed.data.asset_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
