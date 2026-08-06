import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The reviewer pool — who a member may send a completed task to.
 *
 * Everyone holding `tasks:assign` tenant-wide, minus the caller (086 rejects
 * reviewing your own work, so offering yourself would render a choice that is
 * guaranteed to 403).
 *
 * Read through the SERVICE client: `user_capabilities` RLS shows a plain member
 * only their own rows, so the caller's client would return an empty pool for
 * everyone except the owner. The elevated read is narrowed to two columns of one
 * capability inside the caller's own tenant, and returns only names — it never
 * discloses what else a colleague can do.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const service = createServiceClient();

  // Tenant is taken from the caller's own row, never from the request.
  const { data: holders, error } = await service
    .from("user_capabilities")
    .select("user_id")
    .eq("capability", "tasks:assign")
    .eq("granted", true)
    .is("scope_project_id", null)
    .eq("tenant_id", profile.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = [...new Set((holders ?? []).map((h) => h.user_id))].filter((id) => id !== user.id);
  if (ids.length === 0) return NextResponse.json([]);

  const { data: people, error: peopleError } = await service
    .from("users")
    .select("id, full_name, role_label, role")
    .in("id", ids)
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name");

  if (peopleError) return NextResponse.json({ error: peopleError.message }, { status: 500 });

  return NextResponse.json(people ?? []);
}
