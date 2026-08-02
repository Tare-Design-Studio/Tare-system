import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Office locations for attendance check-in (Mysore, Bangalore, …).
//
// Reads are open to every signed-in member: the check-in card names the office
// it matched, and the presence board labels people by office. Writes require
// office_attendance:configure — moving an office moves the geofence, which is
// what decides whether someone is counted present.

const officeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  address: z.string().trim().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geofence_radius_m: z.number().int().min(50).max(5000).default(200),
  is_active: z.boolean().default(true),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("offices")
    .select("id, name, address, lat, lng, geofence_radius_m, is_active")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: canConfigure } = await supabase.rpc("has_capability", {
    p_capability: "office_attendance:configure",
  });

  return NextResponse.json({ offices: data ?? [], can_configure: !!canConfigure });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canConfigure } = await supabase.rpc("has_capability", {
    p_capability: "office_attendance:configure",
  });
  if (!canConfigure) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = officeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  // tenant_id comes from the session, never the request body.
  const { data, error } = await supabase
    .from("offices")
    .insert({ ...parsed.data, tenant_id: profile.tenant_id })
    .select("id, name, address, lat, lng, geofence_radius_m, is_active")
    .single();

  if (error) {
    // 23505 = the UNIQUE (tenant_id, name) constraint.
    if (error.code === "23505") {
      return NextResponse.json({ error: "An office with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
