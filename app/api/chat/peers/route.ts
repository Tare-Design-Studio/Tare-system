import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// People this user can start a DM with: every other active member of their
// tenant. DMs are deliberately not capability-gated — the decision was that
// anyone in the studio can message anyone else, so there is no permission
// matrix to consult here.
export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // users RLS already scopes this to the caller's tenant; the filters below
  // drop inactive and soft-deleted accounts, and the caller themselves.
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("is_active", true)
    .is("deleted_at", null)
    .neq("id", user.id)
    .order("full_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ peers: data ?? [] });
}
