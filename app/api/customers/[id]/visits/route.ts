import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const CAPABILITY = "images:select_for_customer";

// A manual visit is a record of something that already happened, so the date is
// required and the time of day is not — the client is shown a day, not a clock.
const CreateSchema = z.object({
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
  visited_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  customer_note: z.string().trim().max(300).nullable().optional(),
  visible_to_customer: z.boolean().optional(),
});

const PatchSchema = z.object({
  visit_id: z.string().uuid(),
  visible_to_customer: z.boolean().optional(),
  customer_note: z.string().trim().max(300).nullable().optional(),
}).refine(
  v => v.visible_to_customer !== undefined || v.customer_note !== undefined,
  { message: "Nothing to update" },
);

type Ctx = { params: Promise<{ id: string }> };

async function guard(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: CAPABILITY });
  if (!canManage) {
    return { error: NextResponse.json({ error: `Forbidden — requires ${CAPABILITY}` }, { status: 403 }) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: customer } = await db.from("customers").select("id, tenant_id").eq("id", id).maybeSingle();
  if (!customer) return { error: NextResponse.json({ error: "Customer not found" }, { status: 404 }) };

  return { user, customer };
}

// Every visit on this customer's projects, real and manually logged.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const service = createServiceClient();

  const { data: projects } = await service
    .from("projects")
    .select("id, name")
    .eq("customer_id", id)
    .is("deleted_at", null);

  const projectIds = (projects ?? []).map(p => p.id);
  if (projectIds.length === 0) return NextResponse.json({ data: [] });

  const projectName = new Map((projects ?? []).map(p => [p.id, p.name]));

  const { data, error } = await service
    .from("site_check_ins")
    .select("id, project_id, user_id, checked_in_at, checked_out_at, duration_minutes, visible_to_customer, customer_note, source, users:user_id(full_name)")
    .in("project_id", projectIds)
    .order("checked_in_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map(v => ({
    id: v.id,
    project_id: v.project_id,
    project_name: projectName.get(v.project_id) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visitor_name: (v as any).users?.full_name ?? null,
    checked_in_at: v.checked_in_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    duration_minutes: (v as any).duration_minutes ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visible_to_customer: (v as any).visible_to_customer as boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customer_note: ((v as any).customer_note as string | null) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source: (v as any).source as string,
  }));

  return NextResponse.json({ data: rows });
}

// Log a visit that was never stamped on site.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const service = createServiceClient();

  // The project must belong to this customer.
  const { data: project } = await service
    .from("projects")
    .select("id, tenant_id")
    .eq("id", parsed.data.project_id)
    .eq("customer_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found for this customer" }, { status: 404 });

  // The named visitor must be in the same tenant, or an owner could attribute a
  // visit to someone outside the studio.
  const { data: visitor } = await service
    .from("users")
    .select("id")
    .eq("id", parsed.data.user_id)
    .eq("tenant_id", project.tenant_id)
    .maybeSingle();
  if (!visitor) return NextResponse.json({ error: "Visitor not found" }, { status: 404 });

  // Midday IST, so a date-only visit cannot slip to the previous day when read
  // back in UTC.
  const checkedInAt = new Date(`${parsed.data.visited_on}T12:00:00+05:30`).toISOString();

  // A manual visit records something that already finished, so it is closed on
  // creation. This is also required for correctness, not just tidiness:
  // idx_site_checkin_open_session is UNIQUE (user_id, project_id) WHERE
  // checked_out_at IS NULL, so leaving it open would collide with that person's
  // live check-in on the same project, and with any second manual visit.
  // duration_minutes stays NULL — the length of the visit was never measured,
  // and the client is shown a date, not a duration.
  const checkedOutAt = checkedInAt;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data, error } = await service
    .from("site_check_ins")
    .insert({
      tenant_id: project.tenant_id,
      project_id: parsed.data.project_id,
      user_id: parsed.data.user_id,
      checked_in_at: checkedInAt,
      checked_out_at: checkedOutAt,
      within_geofence: false,
      geofence_failure_reason: "manual_entry",
      source: "manual",
      customer_note: parsed.data.customer_note ?? null,
      visible_to_customer: parsed.data.visible_to_customer ?? true,
    } as any)
    .select("id")
    .single();
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// Toggle client visibility or retitle a visit.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const service = createServiceClient();

  const { data: visit } = await service
    .from("site_check_ins")
    .select("id, projects!inner(customer_id, deleted_at)")
    .eq("id", parsed.data.visit_id)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owner = (visit as any)?.projects;
  if (!visit || !owner || owner.customer_id !== id || owner.deleted_at !== null) {
    return NextResponse.json({ error: "Visit not found for this customer" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {};
  if (parsed.data.visible_to_customer !== undefined) patch.visible_to_customer = parsed.data.visible_to_customer;
  if (parsed.data.customer_note !== undefined) patch.customer_note = parsed.data.customer_note;

  const { error } = await service
    .from("site_check_ins")
    .update(patch)
    .eq("id", parsed.data.visit_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
